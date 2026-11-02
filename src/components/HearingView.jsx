import {lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';

import Avatar from './Avatar.jsx';
import GuestList from './GuestList.jsx';
import {api} from '../api.js';
import {buildSeatPositions} from '../seat-layout.js';
import {parseVerdict} from '../verdict.js';

const Courtroom3D = lazy(() => import('./Courtroom3D.jsx'));

const STATUS_LABELS = {
    en_cours: 'Débat en cours',
    deliberation: 'Délibération',
    jugee: 'Jugée',
    ajournee: 'Ajournée',
};

const KIND_LABELS = {dossier: 'Dossier', ouverture: 'Ouverture', verdict: 'Verdict', erreur: 'Erreur'};
const PRESIDING_JUDGE_ID = 'president';
const CLERK_ID = 'clerk';
const DRAWER_WIDTH_KEY = 'tribunal.drawerWidth';
const DRAWER_DEFAULT_WIDTH = 460;
const DRAWER_MIN_WIDTH = 340;
const DRAWER_MAX_RATIO = 0.7;
const BOTTOM_TOLERANCE_PX = 48;
const BUBBLE_MAX_LENGTH = 160;

const readStoredWidth = () => {
    try {
        return Number(localStorage.getItem(DRAWER_WIDTH_KEY)) || DRAWER_DEFAULT_WIDTH;
    } catch {
        return DRAWER_DEFAULT_WIDTH;
    }
};

const storeWidth = (width) => {
    try {
        localStorage.setItem(DRAWER_WIDTH_KEY, String(width));
    } catch {
        // Width is only a convenience: ignore blocked storage.
    }
};

const formatBubble = (text) => (text.length > BUBBLE_MAX_LENGTH ? `…${text.slice(-BUBBLE_MAX_LENGTH).replace(/^\S*\s/, '')}` : text);

function VerdictCard({text}) {
    const verdict = parseVerdict(text);
    const [isCopied, setIsCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 1500);
        } catch {
            setIsCopied(false);
        }
    };

    if (!verdict.isStructured) return <p className="verdict-raw">{text}</p>;
    return (
        <section className="verdict-card">
            <div className="verdict-header">
                <span className="eyebrow">Verdict</span>
                <button type="button" className="button small ghost" onClick={copy}>
                    {isCopied ? 'Copié' : 'Copier'}
                </button>
            </div>
            <p className="verdict-decision">{verdict.decision}</p>
            {verdict.reasons && <p className="verdict-reasons">{verdict.reasons}</p>}
            {verdict.actions.length > 0 && (
                <>
                    <h3>À faire</h3>
                    <ul className="verdict-actions">
                        {verdict.actions.map((action) => (
                            <li key={action}>{action}</li>
                        ))}
                    </ul>
                </>
            )}
            {verdict.caveat && verdict.caveat.toLowerCase() !== 'aucune' && (
                <p className="verdict-caveat">
                    <strong>Réserve :</strong> {verdict.caveat}
                </p>
            )}
        </section>
    );
}

function useResizableWidth() {
    const [width, setWidth] = useState(readStoredWidth);

    const startResize = (event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;
        const maxWidth = window.innerWidth * DRAWER_MAX_RATIO;
        let nextWidth = startWidth;
        const onMove = (moveEvent) => {
            nextWidth = Math.round(Math.min(maxWidth, Math.max(DRAWER_MIN_WIDTH, startWidth + startX - moveEvent.clientX)));
            setWidth(nextWidth);
        };
        const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.body.classList.remove('is-resizing');
            storeWidth(nextWidth);
        };
        document.body.classList.add('is-resizing');
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    };

    return {width, startResize};
}

/**
 * Follows new messages only after the reader asked for it with the arrow, and stops as soon as they scroll up.
 */
function useFollowScroll(contentVersion) {
    const scroller = useRef(null);
    const lastScrollTop = useRef(0);
    const [isFollowing, setIsFollowing] = useState(false);
    const [isAtBottom, setIsAtBottom] = useState(true);

    const measure = () => {
        const element = scroller.current;
        if (!element) return;
        setIsAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < BOTTOM_TOLERANCE_PX);
    };

    const onScroll = () => {
        const element = scroller.current;
        if (!element) return;
        if (element.scrollTop < lastScrollTop.current) setIsFollowing(false);
        lastScrollTop.current = element.scrollTop;
        measure();
    };

    const jumpToBottom = () => {
        const element = scroller.current;
        if (!element) return;
        setIsFollowing(true);
        element.scrollTo({top: element.scrollHeight, behavior: 'smooth'});
    };

    useLayoutEffect(() => {
        const element = scroller.current;
        if (!element) return;
        if (isFollowing) {
            element.scrollTop = element.scrollHeight;
            lastScrollTop.current = element.scrollTop;
        }
        measure();
    }, [contentVersion, isFollowing]);

    return {scroller, onScroll, jumpToBottom, isAtBottom};
}

function CourtFloor({hearing, judge, clerk, members}) {
    const seatPositions = useMemo(() => buildSeatPositions(members.length), [members.length]);
    const speakingMessage = hearing.messages.find((message) => message.isSpeaking);
    const hasClerk = (hearing.sources ?? []).length > 0;

    const renderBubble = (personaId) =>
        speakingMessage?.personaId === personaId && (
            <span className="speech-bubble">
                {speakingMessage.text ? (
                    formatBubble(speakingMessage.text)
                ) : (
                    <span className="typing">
                        <i />
                        <i />
                        <i />
                    </span>
                )}
            </span>
        );

    return (
        <div className="room-floor is-live">
            <div className="bench">
                <Avatar persona={judge} size="lg" isSpeaking={hearing.speakerId === judge?.id} />
                <div className="bench-text">
                    <strong>{judge?.name}</strong>
                    <span className="muted small">{STATUS_LABELS[hearing.status]}</span>
                </div>
                {renderBubble(judge?.id)}
            </div>

            <div className="bar is-readonly">
                <span className="bar-label">À la barre</span>
                <p className="bar-question">{hearing.question}</p>
                {(hearing.guests ?? []).length > 0 && <GuestList guests={hearing.guests} isReadOnly />}
            </div>

            {hasClerk && (
                <div className="clerk-seat">
                    <Avatar persona={clerk} size="md" isSpeaking={hearing.speakerId === CLERK_ID} />
                    <span className="small">{clerk?.name}</span>
                    {renderBubble(CLERK_ID)}
                </div>
            )}

            <ol className="room-seats">
                {members.map((persona, index) => (
                    <li
                        key={persona.id}
                        className={`room-seat is-filled${hearing.speakerId === persona.id ? ' is-speaking' : ''}`}
                        style={{'--seat-x': `${seatPositions[index].x}%`, '--seat-y': `${seatPositions[index].y}%`}}
                    >
                        <div className="seat-occupant is-static">
                            <Avatar persona={persona} size="lg" isSpeaking={hearing.speakerId === persona.id} />
                            <strong>{persona.name}</strong>
                            <span className="muted small">{persona.role}</span>
                            {renderBubble(persona.id)}
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}

export default function HearingView({hearing, personasById, is3dUnlocked, onNewHearing}) {
    const [is3dShown, setIs3dShown] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(true);
    const {width, startResize} = useResizableWidth();
    const isLive = ['en_cours', 'deliberation'].includes(hearing.status);
    const members = hearing.memberIds.map((id) => personasById.get(id)).filter(Boolean);
    const judge = personasById.get(PRESIDING_JUDGE_ID);
    const clerk = personasById.get(CLERK_ID);
    const lastMessage = hearing.messages.at(-1);
    const {scroller, onScroll, jumpToBottom, isAtBottom} = useFollowScroll(`${hearing.messages.length}:${lastMessage?.text?.length ?? 0}:${isDrawerOpen}`);

    useEffect(() => {
        if (!is3dUnlocked) setIs3dShown(false);
    }, [is3dUnlocked]);

    return (
        <div className={`hearing-layout${isDrawerOpen ? ' has-drawer' : ''}`} style={{'--drawer-width': `${width}px`}}>
            <section className="room hearing-room">
                <div className="room-toolbar">
                    <span className={`status-badge status-${hearing.status}`}>
                        {isLive && <span className="live-dot" />}
                        {STATUS_LABELS[hearing.status] ?? hearing.status}
                        {hearing.status === 'en_cours' && hearing.round > 0 && ` · tour ${hearing.round}/${hearing.rounds}`}
                    </span>
                    <div className="hearing-actions">
                        {is3dUnlocked && (
                            <button type="button" className="button small ghost" onClick={() => setIs3dShown((shown) => !shown)}>
                                {is3dShown ? 'Plan de salle' : 'Salle 3D'}
                            </button>
                        )}
                        {isLive && (
                            <button type="button" className="button small danger ghost" onClick={() => api.adjourn(hearing.id)}>
                                Ajourner
                            </button>
                        )}
                        {!isDrawerOpen && (
                            <button type="button" className="button small" onClick={() => setIsDrawerOpen(true)}>
                                Transcription
                            </button>
                        )}
                        <button type="button" className="button small" onClick={onNewHearing}>
                            Nouvelle audience
                        </button>
                    </div>
                </div>
                {is3dShown ? (
                    <div className="courtroom-3d">
                        <Suspense fallback={<div className="boot">Ouverture de la salle…</div>}>
                            <Courtroom3D hearing={hearing} members={members} judge={judge} />
                        </Suspense>
                    </div>
                ) : (
                    <CourtFloor hearing={hearing} judge={judge} clerk={clerk} members={members} />
                )}
            </section>

            {isDrawerOpen && (
                <aside className="transcript-drawer" aria-label="Transcription">
                    <div className="drawer-resizer" onPointerDown={startResize} role="separator" aria-orientation="vertical" aria-label="Redimensionner" />
                    <div className="transcript-drawer-header">
                        <div>
                            <span className="eyebrow">Transcription</span>
                            <h2 className="transcript-title">{hearing.question}</h2>
                            {hearing.context && <p className="muted hearing-context">{hearing.context}</p>}
                        </div>
                        <button type="button" className="icon-button" onClick={() => setIsDrawerOpen(false)} aria-label="Fermer la transcription">
                            ×
                        </button>
                    </div>
                    <div className="transcript-scroller" ref={scroller} onScroll={onScroll}>
                        <ol className="transcript">
                            {hearing.messages.map((message) => {
                                const persona = personasById.get(message.personaId);
                                if (message.kind === 'verdict' && !message.isSpeaking) {
                                    return (
                                        <li key={message.id} className="transcript-verdict">
                                            <VerdictCard text={message.text} />
                                        </li>
                                    );
                                }
                                return (
                                    <li key={message.id} className={`message kind-${message.kind} tone-border-${persona?.color ?? 'slate'}`}>
                                        <Avatar persona={persona} size="md" isSpeaking={message.isSpeaking} />
                                        <div className="message-body">
                                            <div className="message-meta">
                                                <strong>{persona?.name ?? 'Membre retiré'}</strong>
                                                <span className="muted small">{persona?.role}</span>
                                                {KIND_LABELS[message.kind] && <span className={`kind-tag kind-tag-${message.kind}`}>{KIND_LABELS[message.kind]}</span>}
                                            </div>
                                            <p>
                                                {message.text}
                                                {message.isSpeaking && (
                                                    <span className="typing">
                                                        <i />
                                                        <i />
                                                        <i />
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                    {!isAtBottom && (
                        <button type="button" className="jump-to-bottom" onClick={jumpToBottom} aria-label="Aller au dernier message et suivre">
                            ↓
                        </button>
                    )}
                </aside>
            )}
        </div>
    );
}
