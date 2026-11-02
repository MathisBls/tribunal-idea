import {useState} from 'react';

import Avatar from './Avatar.jsx';
import {parseVerdict} from '../verdict.js';

const STATUS_LABELS = {en_cours: 'En cours', deliberation: 'Délibération', jugee: 'Jugée', ajournee: 'Ajournée'};

const formatDate = (iso) =>
    new Date(iso).toLocaleString('fr-FR', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'});

export default function HistoryPanel({hearings, personasById, selectedId, onSelect, onDelete, onClose}) {
    const [confirmingId, setConfirmingId] = useState(null);

    return (
        <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <aside className="drawer" aria-label="Historique des audiences">
                <div className="drawer-header">
                    <h2>Historique</h2>
                    <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer">
                        ×
                    </button>
                </div>
                {hearings.length === 0 ? (
                    <p className="muted empty">Aucune audience pour l'instant.</p>
                ) : (
                    <ul className="history-list">
                        {hearings.map((hearing) => {
                            const decision = hearing.verdict ? parseVerdict(hearing.verdict).decision : '';
                            const isRunning = ['en_cours', 'deliberation'].includes(hearing.status);
                            return (
                                <li key={hearing.id} className={hearing.id === selectedId ? 'is-selected' : ''}>
                                    <button type="button" className="history-item" onClick={() => onSelect(hearing.id)}>
                                        <span className="history-meta">
                                            <span className={`status-badge small status-${hearing.status}`}>{STATUS_LABELS[hearing.status]}</span>
                                            <span className="muted small">{formatDate(hearing.createdAt)}</span>
                                        </span>
                                        <strong>{hearing.question}</strong>
                                        {decision && <span className="muted small history-decision">{decision}</span>}
                                        <span className="history-members">
                                            {hearing.memberIds.map((id) => (
                                                <Avatar key={id} persona={personasById.get(id)} size="xs" />
                                            ))}
                                        </span>
                                    </button>
                                    {!isRunning &&
                                        (confirmingId === hearing.id ? (
                                            <span className="confirm-row">
                                                <span className="small">Supprimer ?</span>
                                                <button type="button" className="button small danger" onClick={() => onDelete(hearing.id).then(() => setConfirmingId(null))}>
                                                    Oui
                                                </button>
                                                <button type="button" className="button small ghost" onClick={() => setConfirmingId(null)}>
                                                    Non
                                                </button>
                                            </span>
                                        ) : (
                                            <button type="button" className="link-button small danger-text" onClick={() => setConfirmingId(hearing.id)}>
                                                Supprimer
                                            </button>
                                        ))}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </aside>
        </div>
    );
}
