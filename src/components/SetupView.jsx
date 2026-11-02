import {useEffect, useMemo, useState} from 'react';

import Avatar from './Avatar.jsx';
import PersonaEditor from './PersonaEditor.jsx';
import {api} from '../api.js';
import {buildSeatPositions} from '../seat-layout.js';

const DEFAULT_SEAT_COUNT = 4;
const DRAG_TYPE = 'application/x-tribunal-persona';
const CONNECTED_STATUS = 'connected';

const readDrag = (event) => {
    try {
        return JSON.parse(event.dataTransfer.getData(DRAG_TYPE));
    } catch {
        return null;
    }
};

export default function SetupView({config, personas, isClaudeReady, isBusy, onOpenHearing, onPersonasChanged}) {
    const [seats, setSeats] = useState(() => personas.slice(0, DEFAULT_SEAT_COUNT).map((persona) => persona.id).concat(Array(DEFAULT_SEAT_COUNT).fill(null)).slice(0, DEFAULT_SEAT_COUNT));
    const [question, setQuestion] = useState('');
    const [context, setContext] = useState('');
    const [isContextOpen, setIsContextOpen] = useState(false);
    const [model, setModel] = useState(config.models[0]);
    const [rounds, setRounds] = useState(2);
    const [editedPersona, setEditedPersona] = useState(null);
    const [hoveredSeat, setHoveredSeat] = useState(null);
    const [isLobbyHovered, setIsLobbyHovered] = useState(false);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mcpSources, setMcpSources] = useState(null);
    const [selectedSources, setSelectedSources] = useState([]);

    useEffect(() => {
        api.mcpSources().then(setMcpSources).catch(() => setMcpSources([]));
    }, []);

    const personaById = new Map(personas.map((persona) => [persona.id, persona]));
    const seatedIds = new Set(seats.filter(Boolean));
    const filledSeats = seats.filter((id) => id && personaById.has(id));
    const seatPositions = useMemo(() => buildSeatPositions(seats.length), [seats.length]);
    const canOpen = isClaudeReady && !isBusy && question.trim().length > 0 && filledSeats.length >= config.minSeats && !isSubmitting;

    const resizeSeats = (count) => {
        const nextCount = Math.min(config.maxSeats, Math.max(config.minSeats, count));
        setSeats((current) => {
            if (nextCount >= current.length) return [...current, ...Array(nextCount - current.length).fill(null)];
            const kept = current.filter(Boolean).slice(0, nextCount);
            return [...kept, ...Array(nextCount - kept.length).fill(null)];
        });
    };

    const placeInSeat = (personaId, seatIndex) =>
        setSeats((current) => {
            const next = [...current];
            const previousIndex = next.indexOf(personaId);
            if (previousIndex >= 0) next[previousIndex] = next[seatIndex];
            next[seatIndex] = personaId;
            return next;
        });

    const addToCourt = (personaId) => {
        if (seatedIds.has(personaId)) {
            setSeats((current) => current.map((id) => (id === personaId ? null : id)));
            return;
        }
        const emptyIndex = seats.indexOf(null);
        if (emptyIndex >= 0) placeInSeat(personaId, emptyIndex);
        else if (seats.length < config.maxSeats) setSeats((current) => [...current, personaId]);
    };

    const removeFromSeat = (seatIndex) => setSeats((current) => current.map((id, index) => (index === seatIndex ? null : id)));

    const startDrag = (event, personaId, fromSeat = null) => {
        event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({personaId, fromSeat}));
        event.dataTransfer.effectAllowed = 'move';
    };

    const submit = async (event) => {
        event.preventDefault();
        setError('');
        setIsSubmitting(true);
        try {
            await onOpenHearing({question, context, memberIds: filledSeats, model, rounds, sources: selectedSources});
        } catch (openError) {
            setError(openError.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const refreshSources = () => {
        setMcpSources(null);
        api.mcpSources(true).then(setMcpSources).catch(() => setMcpSources([]));
    };

    const toggleSource = (name) => setSelectedSources((current) => (current.includes(name) ? current.filter((source) => source !== name) : [...current, name]));

    const savePersona = async (persona) => {
        await api.savePersona(persona);
        await onPersonasChanged();
    };

    const deletePersona = async (id) => {
        await api.deletePersona(id);
        setSeats((current) => current.map((seat) => (seat === id ? null : seat)));
        await onPersonasChanged();
    };

    return (
        <form className="setup" onSubmit={submit}>
            <section className="room" aria-label="Salle d'audience">
                <div className="room-toolbar">
                    <span className="eyebrow">Salle d'audience</span>
                    <div className="stepper" aria-label="Nombre de sièges">
                        <button type="button" onClick={() => resizeSeats(seats.length - 1)} disabled={seats.length <= config.minSeats} aria-label="Retirer un siège">
                            −
                        </button>
                        <span>
                            <strong>{seats.length}</strong> sièges
                        </span>
                        <button type="button" onClick={() => resizeSeats(seats.length + 1)} disabled={seats.length >= config.maxSeats} aria-label="Ajouter un siège">
                            +
                        </button>
                    </div>
                </div>

                <div className="room-floor">
                    <div className="bench">
                        <Avatar persona={config.judge} size="lg" />
                        <div className="bench-text">
                            <strong>{config.judge.name}</strong>
                            <span className="muted small">Préside et rend le verdict</span>
                        </div>
                    </div>

                    <div className="bar">
                        <label className="bar-label" htmlFor="question">
                            À la barre
                        </label>
                        <textarea
                            id="question"
                            className="question-input"
                            value={question}
                            onChange={(event) => setQuestion(event.target.value)}
                            placeholder="Quelle question le tribunal doit-il trancher ?"
                            rows={3}
                            maxLength={2000}
                        />
                        {isContextOpen ? (
                            <textarea
                                className="context-input"
                                value={context}
                                onChange={(event) => setContext(event.target.value)}
                                placeholder="Pièces du dossier : chiffres, contraintes, ticket, extrait de document…"
                                rows={3}
                                maxLength={6000}
                            />
                        ) : (
                            <button type="button" className="link-button small" onClick={() => setIsContextOpen(true)}>
                                + Joindre des pièces au dossier
                            </button>
                        )}
                    </div>

                    <ol className="room-seats">
                        {seats.map((personaId, index) => {
                            const persona = personaId ? personaById.get(personaId) : null;
                            const position = seatPositions[index];
                            return (
                                <li
                                    key={index}
                                    className={`room-seat${persona ? ' is-filled' : ''}${hoveredSeat === index ? ' is-target' : ''}`}
                                    style={{'--seat-x': `${position.x}%`, '--seat-y': `${position.y}%`}}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        setHoveredSeat(index);
                                    }}
                                    onDragLeave={() => setHoveredSeat((current) => (current === index ? null : current))}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        setHoveredSeat(null);
                                        const drag = readDrag(event);
                                        if (drag?.personaId) placeInSeat(drag.personaId, index);
                                    }}
                                >
                                    {persona ? (
                                        <div className="seat-occupant" draggable onDragStart={(event) => startDrag(event, persona.id, index)} title={persona.persona}>
                                            <Avatar persona={persona} size="lg" />
                                            <strong>{persona.name}</strong>
                                            <span className="muted small">{persona.role}</span>
                                            <button type="button" className="seat-remove" onClick={() => removeFromSeat(index)} aria-label={`Retirer ${persona.name}`}>
                                                ×
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="seat-free">
                                            <span className="seat-chair">{index + 1}</span>
                                            <span className="muted small">Siège libre</span>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </div>
            </section>

            <section
                className={`lobby${isLobbyHovered ? ' is-target' : ''}`}
                aria-label="Membres disponibles"
                onDragOver={(event) => {
                    event.preventDefault();
                    setIsLobbyHovered(true);
                }}
                onDragLeave={() => setIsLobbyHovered(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setIsLobbyHovered(false);
                    const drag = readDrag(event);
                    if (drag?.fromSeat !== null && drag?.fromSeat !== undefined) removeFromSeat(drag.fromSeat);
                }}
            >
                <div className="lobby-header">
                    <div>
                        <span className="eyebrow">Salle des pas perdus</span>
                        <p className="muted small">Glissez un membre vers un siège, ou cliquez dessus. Renvoyez-le ici pour libérer sa place.</p>
                    </div>
                    <button type="button" className="button small" onClick={() => setEditedPersona({})}>
                        + Nouveau membre
                    </button>
                </div>
                <ul className="persona-list">
                    {personas.map((persona) => {
                        const isSeated = seatedIds.has(persona.id);
                        return (
                            <li key={persona.id} className={`persona-chip tone-${persona.color}${isSeated ? ' is-seated' : ''}`}>
                                <div
                                    className="persona-chip-body"
                                    draggable
                                    onDragStart={(event) => startDrag(event, persona.id)}
                                    onClick={() => addToCourt(persona.id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && addToCourt(persona.id)}
                                    title={persona.persona}
                                >
                                    <Avatar persona={persona} size="sm" />
                                    <span className="persona-chip-text">
                                        <strong>{persona.name}</strong>
                                        <span className="muted small">{isSeated ? 'En séance' : persona.role}</span>
                                    </span>
                                </div>
                                {!persona.builtIn && (
                                    <button type="button" className="link-button small" onClick={() => setEditedPersona(persona)}>
                                        Modifier
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </section>

            <section className="clerk-desk">
                <div className="clerk-header">
                    <Avatar persona={config.clerk} size="md" />
                    <div>
                        <span className="eyebrow">Greffe</span>
                        <p className="muted small">
                            Le greffier consulte vos outils connectés à Claude Code, en lecture seule, et verse un dossier factuel avant les débats.
                        </p>
                    </div>
                    <button type="button" className="link-button small" onClick={refreshSources} disabled={mcpSources === null}>
                        Actualiser
                    </button>
                </div>
                {mcpSources === null ? (
                    <p className="muted small">Recherche de vos outils…</p>
                ) : mcpSources.length === 0 ? (
                    <p className="muted small">Aucun outil MCP trouvé dans votre Claude Code.</p>
                ) : (
                    <ul className="source-list">
                        {mcpSources.map((source) => {
                            const isUsable = source.status === CONNECTED_STATUS && source.readToolCount > 0;
                            const isSelected = selectedSources.includes(source.name);
                            return (
                                <li key={source.name}>
                                    <button
                                        type="button"
                                        className={`source-chip${isSelected ? ' is-selected' : ''}`}
                                        disabled={!isUsable}
                                        onClick={() => toggleSource(source.name)}
                                        title={isUsable ? `${source.readToolCount} outil${source.readToolCount > 1 ? 's' : ''} de lecture` : 'À connecter dans Claude Code'}
                                    >
                                        {source.name.replace(/^claude.ai /, '')}
                                        {!isUsable && <span className="muted small"> · à connecter</span>}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <section className="launch-bar">
                <div className="options">
                    <label className="field inline">
                        <span>Modèle</span>
                        <select value={model} onChange={(event) => setModel(event.target.value)}>
                            {config.models.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="field inline">
                        <span>Tours de débat</span>
                        <div className="segmented">
                            {[1, 2, 3].map((value) => (
                                <button key={value} type="button" className={rounds === value ? 'is-active' : ''} onClick={() => setRounds(value)}>
                                    {value}
                                </button>
                            ))}
                        </div>
                    </div>
                    <span className="muted small">
                        {filledSeats.length} membre{filledSeats.length > 1 ? 's' : ''} · environ {filledSeats.length * rounds + 2} réponses sur votre quota Claude
                    </span>
                </div>
                <div className="launch-action">
                    {error && <p className="form-error">{error}</p>}
                    {!isClaudeReady && <p className="form-error">Connectez Claude Code (en haut à droite).</p>}
                    {isBusy && <p className="muted small">Une audience est déjà en cours.</p>}
                    <button type="submit" className="button primary" disabled={!canOpen}>
                        {isSubmitting ? 'Ouverture…' : "Ouvrir l'audience"}
                    </button>
                </div>
            </section>

            {editedPersona && (
                <PersonaEditor
                    persona={editedPersona}
                    colors={config.colors}
                    characters={config.characters}
                    onSave={savePersona}
                    onDelete={deletePersona}
                    onClose={() => setEditedPersona(null)}
                />
            )}
        </form>
    );
}
