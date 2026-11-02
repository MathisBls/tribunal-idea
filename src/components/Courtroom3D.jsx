import {Html, useGLTF} from '@react-three/drei';
import {Canvas, useFrame} from '@react-three/fiber';
import {Suspense, useEffect, useMemo, useRef, useState} from 'react';
import {Vector3} from 'three';

const MODEL_URL = '/models/tribunal.glb';
const JUDGE_SLOT = 'juge';
const MEMBER_SLOTS = ['nego', 'directeur', 'gestion', 'client', 'tech'];
const CAMERA_SMOOTHING = 1.1;
const WIDE_SHOT = {position: new Vector3(0, 6.2, 12), target: new Vector3(0, 2.6, -1.5)};
const JUDGE_SHOT = {position: new Vector3(0, 3.8, 2.5), target: new Vector3(0, 2.9, -5.3)};
const SIDE_THRESHOLD = 1;
const PAGE_MAX_LENGTH = 220;
const READING_BASE_MS = 700;
const READING_MS_PER_CHARACTER = 42;
const READING_MIN_MS = 2500;
const TICK_MS = 250;

const readingDuration = (text) => Math.max(READING_MIN_MS, READING_BASE_MS + text.length * READING_MS_PER_CHARACTER);

function paginate(text) {
    const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [];
    const pages = [];
    let current = '';
    for (const sentence of sentences) {
        if (current && (current + sentence).length > PAGE_MAX_LENGTH) {
            pages.push(current.trim());
            current = '';
        }
        current += sentence;
    }
    if (current.trim()) pages.push(current.trim());
    return pages;
}

/**
 * Plays the transcript one bubble page at a time, at reading speed, following the live debate.
 */
function useSpeechPlayback(hearing) {
    const [cursor, setCursor] = useState(null);
    const [now, setNow] = useState(() => Date.now());
    const messages = hearing.messages;
    const isLive = ['en_cours', 'deliberation'].includes(hearing.status);

    useEffect(() => {
        const speakingIndex = messages.findIndex((message) => message.isSpeaking);
        setCursor({index: Math.max(0, isLive ? speakingIndex : 0), page: 0, startedAt: Date.now()});
    }, [hearing.id]);

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(timer);
    }, []);

    const message = cursor ? messages[cursor.index] : null;
    const pages = useMemo(() => (message ? paginate(message.text) : []), [message]);
    const pageText = cursor ? (pages[cursor.page] ?? '') : '';
    const isPageComplete = Boolean(message) && (!message.isSpeaking || cursor.page < pages.length - 1);

    useEffect(() => {
        if (!cursor || !message || !isPageComplete || now - cursor.startedAt < readingDuration(pageText)) return;
        if (cursor.page < pages.length - 1) setCursor({...cursor, page: cursor.page + 1, startedAt: now});
        else if (cursor.index < messages.length - 1) setCursor({index: cursor.index + 1, page: 0, startedAt: now});
    }, [now, cursor, message, isPageComplete, pageText, pages.length, messages.length]);

    return {speakerId: message?.personaId ?? null, bubbleText: pageText};
}

function buildRig(scene, slotByPersonaId) {
    const usedSlots = new Set(slotByPersonaId.values());
    scene.traverse((object) => {
        if (object.isMesh) {
            object.castShadow = true;
            object.receiveShadow = true;
        }
    });
    for (const slot of [JUDGE_SLOT, ...MEMBER_SLOTS]) {
        const node = scene.getObjectByName(`char_${slot}`);
        if (node) node.visible = usedSlots.has(slot);
    }
    scene.updateMatrixWorld(true);
    return [...slotByPersonaId.entries()]
        .map(([personaId, slot], index) => {
            const node = scene.getObjectByName(`char_${slot}`);
            const anchor = scene.getObjectByName(`anchor_${slot}`);
            if (!node || !anchor) return null;
            const anchorPosition = anchor.getWorldPosition(new Vector3());
            const side = anchorPosition.x < -SIDE_THRESHOLD ? 'left' : anchorPosition.x > SIDE_THRESHOLD ? 'right' : 'center';
            return {personaId, slot, index, node, side, anchorPosition, baseY: node.position.y, baseScale: node.scale.clone()};
        })
        .filter(Boolean);
}

function Room({hearing, personasById, slotByPersonaId}) {
    const {scene} = useGLTF(MODEL_URL);
    const rig = useMemo(() => buildRig(scene, slotByPersonaId), [scene, slotByPersonaId]);
    const {speakerId, bubbleText} = useSpeechPlayback(hearing);
    const lookTarget = useRef(WIDE_SHOT.target.clone());
    const spotlight = useRef(null);

    useFrame((state, delta) => {
        const time = state.clock.elapsedTime;
        const smoothing = 1 - Math.exp(-delta * CAMERA_SMOOTHING);
        const speaker = rig.find((entry) => entry.personaId === speakerId) ?? null;
        for (const entry of rig) {
            const isSpeaking = entry === speaker;
            const hop = isSpeaking ? Math.abs(Math.sin(time * 6)) * 0.08 : Math.sin(time * 1.4 + entry.index) * 0.01;
            const squash = isSpeaking ? Math.sin(time * 12) * 0.03 : 0;
            entry.node.position.y = entry.baseY + hop;
            entry.node.scale.set(entry.baseScale.x * (1 - squash), entry.baseScale.y * (1 + squash), entry.baseScale.z * (1 - squash));
        }
        const shot = speaker?.slot === JUDGE_SLOT || hearing.status === 'deliberation' ? JUDGE_SHOT : WIDE_SHOT;
        state.camera.position.lerp(shot.position, smoothing);
        lookTarget.current.lerp(shot.target, smoothing);
        state.camera.lookAt(lookTarget.current);
        if (spotlight.current) {
            spotlight.current.target.position.lerp(speaker?.anchorPosition ?? WIDE_SHOT.target, smoothing * 3);
            spotlight.current.target.updateMatrixWorld();
            spotlight.current.intensity += ((speaker ? 70 : 0) - spotlight.current.intensity) * Math.min(smoothing * 3, 1);
        }
    });

    const speaker = rig.find((entry) => entry.personaId === speakerId) ?? null;
    return (
        <>
            <primitive object={scene} />
            <spotLight ref={spotlight} position={[0, 8, 2]} angle={0.28} penumbra={0.7} intensity={0} castShadow color="#fff1d6" />
            {rig
                .filter((entry) => entry !== speaker)
                .map((entry) => (
                    <Html key={entry.personaId} position={entry.anchorPosition} zIndexRange={[20, 10]}>
                        <div className={`plate3d tone-${personasById.get(entry.personaId)?.color}`}>{personasById.get(entry.personaId)?.name}</div>
                    </Html>
                ))}
            {speaker && (
                <Html key={`bubble-${speaker.personaId}`} position={speaker.anchorPosition} zIndexRange={[100, 90]}>
                    <div className={`bubble3d align-${speaker.side}`}>
                        <strong>{personasById.get(speaker.personaId)?.name}</strong>
                        <p>{bubbleText || '…'}</p>
                    </div>
                </Html>
            )}
        </>
    );
}

export default function Courtroom3D({hearing, members, judge}) {
    const personasById = useMemo(() => new Map([judge, ...members].filter(Boolean).map((persona) => [persona.id, persona])), [judge, members]);
    const slotByPersonaId = useMemo(() => {
        const slots = new Map();
        if (judge) slots.set(judge.id, JUDGE_SLOT);
        members.slice(0, MEMBER_SLOTS.length).forEach((persona, index) => slots.set(persona.id, MEMBER_SLOTS[index]));
        return slots;
    }, [judge, members]);
    const hiddenCount = Math.max(0, members.length - MEMBER_SLOTS.length);

    return (
        <>
            <Canvas shadows camera={{position: WIDE_SHOT.position.toArray(), fov: 46}} dpr={[1, 2]}>
                <color attach="background" args={['#1a140f']} />
                <fog attach="fog" args={['#1a140f', 18, 32]} />
                <hemisphereLight args={['#fff4e0', '#3a2a1c', 1.0]} />
                <directionalLight position={[6, 10, 6]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} />
                <pointLight position={[0, 4, -6]} intensity={8} color="#ffd8a0" />
                <Suspense fallback={null}>
                    <Room hearing={hearing} personasById={personasById} slotByPersonaId={slotByPersonaId} />
                </Suspense>
            </Canvas>
            {hiddenCount > 0 && <p className="courtroom-note">La salle 3D a 5 places : {hiddenCount} membre(s) suivent le débat depuis le texte.</p>}
        </>
    );
}

useGLTF.preload(MODEL_URL);
