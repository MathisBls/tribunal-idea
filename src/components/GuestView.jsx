import {useEffect, useMemo, useRef, useState} from 'react';

import HearingView from './HearingView.jsx';
import {joinHearing} from '../guest-relay.js';

const SPEAKING_PLACEHOLDER_ID = 'speaking';
const FINAL_STATUSES = ['jugee', 'ajournee'];

function applyEvent(hearing, event) {
    if (event.type === 'meta') return {...event.hearing, status: hearing?.status ?? 'en_cours', round: 0, speakerId: null, messages: hearing?.messages ?? [], verdict: null};
    if (!hearing) return hearing;
    const messages = hearing.messages.filter((message) => message.id !== SPEAKING_PLACEHOLDER_ID);
    if (event.type === 'speaking') {
        return {...hearing, round: event.round, isSuspended: Boolean(event.isSuspended), speakerId: event.personaId, messages: [...messages, {id: SPEAKING_PLACEHOLDER_ID, personaId: event.personaId, kind: 'plaidoirie', text: '', isSpeaking: true}]};
    }
    if (event.type === 'message') {
        if (messages.some((message) => message.id === event.message.id)) return hearing;
        const isSpeakerDone = hearing.speakerId === event.message.personaId;
        return {
            ...hearing,
            speakerId: isSpeakerDone ? null : hearing.speakerId,
            messages: isSpeakerDone ? [...messages, event.message] : [...hearing.messages.filter((message) => message.id !== SPEAKING_PLACEHOLDER_ID), event.message, ...hearing.messages.filter((message) => message.id === SPEAKING_PLACEHOLDER_ID)],
        };
    }
    if (event.type === 'status') {
        const isFinal = FINAL_STATUSES.includes(event.status);
        return {...hearing, status: event.status, verdict: event.verdict, speakerId: isFinal ? null : hearing.speakerId, messages: isFinal ? messages : hearing.messages};
    }
    return hearing;
}

/**
 * Page of an invited guest: follows the hearing live and speaks at the bar, without Claude Code.
 */
export default function GuestView({invite}) {
    const [hearing, setHearing] = useState(null);
    const [personas, setPersonas] = useState([]);
    const connection = useRef(null);

    useEffect(() => {
        connection.current = joinHearing(invite, (event) => {
            if (event.type === 'meta') setPersonas(event.personas);
            setHearing((current) => applyEvent(current, event));
        });
        return () => connection.current?.leave();
    }, [invite]);

    const personasById = useMemo(() => new Map(personas.map((persona) => [persona.id, persona])), [personas]);

    if (!hearing) {
        return (
            <main className="bridge-setup">
                <h1>Tribunal</h1>
                <p className="bridge-lead">Vous êtes invité à une audience.</p>
                <p className="muted small bridge-waiting">
                    <span className="live-dot" /> En attente de l'ouverture de l'audience…
                </p>
            </main>
        );
    }

    return <HearingView hearing={hearing} personasById={personasById} isGuest onIntervene={(intervention) => connection.current.intervene(intervention)} />;
}
