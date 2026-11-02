import {useEffect, useMemo, useRef, useState} from 'react';

import Avatar from './Avatar.jsx';
import GuestList from './GuestList.jsx';
import HearingView from './HearingView.jsx';
import PersonaEditor from './PersonaEditor.jsx';
import {openRelay} from '../guest-relay.js';
import {buildSeatPositions} from '../seat-layout.js';

const SPEAKING_PLACEHOLDER_ID = 'speaking';
const FINAL_STATUSES = ['jugee', 'ajournee'];
const GUEST_NAME_KEY = 'tribunal.speakerName';
const GUEST_PERSONAS_KEY = 'tribunal.guestPersonas';
const GUEST_PERSONA_PREFIX = 'guest-persona-';
const MAX_GUEST_NAME_LENGTH = 40;

const readStored = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return key === GUEST_NAME_KEY ? raw : JSON.parse(raw);
    } catch {
        return fallback;
    }
};

const writeStored = (key, value) => {
    try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch {
        // Kept for this visit only.
    }
};

const createPersonaId = () => `${GUEST_PERSONA_PREFIX}${crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 16)}`;

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
            messages: isSpeakerDone ? [...messages, event.message] : [...messages, event.message, ...hearing.messages.filter((message) => message.id === SPEAKING_PLACEHOLDER_ID)],
        };
    }
    if (event.type === 'status') {
        const isFinal = FINAL_STATUSES.includes(event.status);
        return {...hearing, status: event.status, verdict: event.verdict, speakerId: isFinal ? null : hearing.speakerId, messages: isFinal ? messages : hearing.messages};
    }
    return hearing;
}

function JoinForm({onJoin}) {
    const [name, setName] = useState('');
    return (
        <main className="bridge-setup">
            <h1>Tribunal</h1>
            <p className="bridge-lead">Vous êtes invité à une audience. Comment vous appelle-t-on dans la salle ?</p>
            <form
                className="join-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (name.trim()) onJoin(name.trim().slice(0, MAX_GUEST_NAME_LENGTH));
                }}
            >
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Votre prénom" maxLength={MAX_GUEST_NAME_LENGTH} autoFocus />
                <button type="submit" className="button primary" disabled={!name.trim()}>
                    Entrer dans la salle
                </button>
            </form>
        </main>
    );
}

/**
 * The room as the guest sees it before the hearing opens: seats fill up live, and the guest can propose members.
 */
function LobbyView({lobby, guestName, myPersonas, onSavePersona, onDeletePersona, onPropose}) {
    const [editedPersona, setEditedPersona] = useState(null);
    const seatPositions = useMemo(() => buildSeatPositions(lobby?.seats.length ?? 0), [lobby?.seats.length]);

    if (!lobby) {
        return (
            <main className="bridge-setup">
                <h1>Tribunal</h1>
                <p className="muted small bridge-waiting">
                    <span className="live-dot" /> Connexion à la salle…
                </p>
            </main>
        );
    }

    const seatedIds = new Set(lobby.seats.filter(Boolean).map((persona) => persona.id));
    const freeSeatCount = lobby.seats.filter((persona) => !persona).length;

    return (
        <div className="setup guest-lobby">
            <section className="room" aria-label="Salle d'audience">
                <div className="room-toolbar">
                    <span className="eyebrow">Salle d'audience · en préparation</span>
                    <span className="muted small live-label">
                        <span className="live-dot" /> En direct
                    </span>
                </div>
                <div className="room-floor">
                    <div className="bench">
                        <Avatar persona={lobby.judge} size="lg" />
                        <div className="bench-text">
                            <strong>{lobby.judge?.name}</strong>
                            <span className="muted small">Préside et rend le verdict</span>
                        </div>
                    </div>
                    <div className="bar is-readonly">
                        <span className="bar-label">À la barre</span>
                        <p className="bar-question">{lobby.question || 'La question n’est pas encore posée…'}</p>
                        {lobby.guests.length > 0 && <GuestList guests={lobby.guests} isReadOnly />}
                    </div>
                    <ol className="room-seats">
                        {lobby.seats.map((persona, index) => (
                            <li
                                key={persona?.id ?? `free-${index}`}
                                className={`room-seat${persona ? ' is-filled' : ''}`}
                                style={{'--seat-x': `${seatPositions[index].x}%`, '--seat-y': `${seatPositions[index].y}%`}}
                            >
                                {persona ? (
                                    <div className="seat-occupant is-static">
                                        <Avatar persona={persona} size="lg" />
                                        <strong>{persona.name}</strong>
                                        <span className="muted small">{persona.proposedBy ? `Proposé par ${persona.proposedBy}` : persona.role}</span>
                                    </div>
                                ) : (
                                    <div className="seat-free">
                                        <span className="seat-chair">{index + 1}</span>
                                        <span className="muted small">Siège libre</span>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            <section className="lobby">
                <div className="lobby-header">
                    <div>
                        <span className="eyebrow">Vos membres</span>
                        <p className="muted small">
                            Connecté en tant que <strong>{guestName}</strong>. Proposez un membre : il prend un siège libre dans la salle.
                        </p>
                    </div>
                    <button type="button" className="button small" onClick={() => setEditedPersona({})}>
                        + Nouveau membre
                    </button>
                </div>
                {myPersonas.length === 0 ? (
                    <p className="muted small">Vous n’avez pas encore créé de membre.</p>
                ) : (
                    <ul className="persona-list">
                        {myPersonas.map((persona) => {
                            const isSeated = seatedIds.has(persona.id);
                            return (
                                <li key={persona.id} className={`persona-chip tone-${persona.color}${isSeated ? ' is-seated' : ''}`}>
                                    <div className="persona-chip-body">
                                        <Avatar persona={persona} size="sm" />
                                        <span className="persona-chip-text">
                                            <strong>{persona.name}</strong>
                                            <span className="muted small">{isSeated ? 'En séance' : persona.role}</span>
                                        </span>
                                    </div>
                                    {!isSeated && (
                                        <button
                                            type="button"
                                            className="source-connect"
                                            onClick={() => onPropose(persona)}
                                            disabled={freeSeatCount === 0}
                                            title={freeSeatCount === 0 ? 'Aucun siège libre' : 'Faire siéger'}
                                        >
                                            Proposer
                                        </button>
                                    )}
                                    <button type="button" className="link-button small" onClick={() => setEditedPersona(persona)}>
                                        Modifier
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {editedPersona && (
                <PersonaEditor
                    persona={editedPersona}
                    colors={lobby.colors}
                    characters={lobby.characters}
                    onSave={onSavePersona}
                    onDelete={onDeletePersona}
                    onClose={() => setEditedPersona(null)}
                />
            )}
        </div>
    );
}

/**
 * Page of an invited guest: joins the room, proposes members, then follows the hearing and speaks at the bar.
 */
export default function GuestView({invite}) {
    const [guestName, setGuestName] = useState(() => readStored(GUEST_NAME_KEY, ''));
    const [myPersonas, setMyPersonas] = useState(() => readStored(GUEST_PERSONAS_KEY, []));
    const [lobby, setLobby] = useState(null);
    const [hearing, setHearing] = useState(null);
    const [personas, setPersonas] = useState([]);
    const relay = useRef(null);

    useEffect(() => {
        const channel = openRelay(invite);
        relay.current = channel;
        channel.onHearingEvent((event) => {
            if (event.type === 'lobby') {
                setLobby(event);
                return;
            }
            if (event.type === 'meta') setPersonas(event.personas);
            setHearing((current) => applyEvent(current, event));
        });
        return () => channel.close();
    }, [invite]);

    useEffect(() => {
        if (guestName) relay.current?.publishToHost({type: 'join', name: guestName}).catch(() => {});
    }, [guestName]);

    const personasById = useMemo(() => new Map(personas.map((persona) => [persona.id, persona])), [personas]);

    const saveMyPersonas = (next) => {
        setMyPersonas(next);
        writeStored(GUEST_PERSONAS_KEY, next);
    };

    const savePersona = async (persona) => {
        const saved = {...persona, id: persona.id?.startsWith(GUEST_PERSONA_PREFIX) ? persona.id : createPersonaId()};
        saveMyPersonas([...myPersonas.filter((existing) => existing.id !== saved.id), saved]);
    };

    const deletePersona = async (id) => saveMyPersonas(myPersonas.filter((persona) => persona.id !== id));

    const propose = (persona) => relay.current?.publishToHost({type: 'propose-member', author: guestName, persona}).catch(() => {});

    if (!guestName) {
        return (
            <JoinForm
                onJoin={(name) => {
                    writeStored(GUEST_NAME_KEY, name);
                    setGuestName(name);
                }}
            />
        );
    }

    if (!hearing) {
        return <LobbyView lobby={lobby} guestName={guestName} myPersonas={myPersonas} onSavePersona={savePersona} onDeletePersona={deletePersona} onPropose={propose} />;
    }

    return <HearingView hearing={hearing} personasById={personasById} isGuest onIntervene={(intervention) => relay.current.publishToHost({type: 'intervention', ...intervention})} />;
}
