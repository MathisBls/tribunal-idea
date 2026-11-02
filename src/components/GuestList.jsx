import {useEffect, useRef, useState} from 'react';

import Avatar from './Avatar.jsx';

const MAX_GUESTS = 8;
const MAX_GUEST_NAME_LENGTH = 40;
const GUEST_COLORS = ['sky', 'green', 'amber', 'plum', 'rose', 'teal', 'indigo', 'coral'];
const GUEST_CHARACTERS = ['client', 'nego', 'tech', 'gestion', 'directeur'];

export const toGuestPersona = (guest, index) => ({
    id: `guest-${guest.name}`,
    name: guest.name,
    color: GUEST_COLORS[index % GUEST_COLORS.length],
    character: GUEST_CHARACTERS[index % GUEST_CHARACTERS.length],
});

function PersonPlusIcon() {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="9" cy="8" r="4" />
            <path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7" />
            <path d="M19 8v6M16 11h6" />
        </svg>
    );
}

/**
 * Guests of a hearing, shown as small courtroom characters with their names, plus the invite button.
 */
export default function GuestList({guests, onChange, inviteLink = null, onPanelOpen, isReadOnly = false}) {
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [name, setName] = useState('');
    const [isCopied, setIsCopied] = useState(false);
    const isLocalLink = Boolean(inviteLink) && /\/\/(localhost|127\.0\.0\.1)/.test(inviteLink);

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(inviteLink);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 1800);
        } catch {
            setIsCopied(false);
        }
    };
    const container = useRef(null);

    useEffect(() => {
        if (!isPanelOpen) return undefined;
        const closeOnOutsideClick = (event) => {
            if (!container.current?.contains(event.target)) setIsPanelOpen(false);
        };
        const closeOnEscape = (event) => event.key === 'Escape' && setIsPanelOpen(false);
        document.addEventListener('pointerdown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [isPanelOpen]);

    const addGuest = () => {
        const cleanName = name.trim().slice(0, MAX_GUEST_NAME_LENGTH);
        if (!cleanName || guests.some((guest) => guest.name === cleanName)) return;
        onChange([...guests, {name: cleanName}]);
        setName('');
    };

    const removeGuest = (guestName) => onChange(guests.filter((guest) => guest.name !== guestName));

    return (
        <div className="guest-list" ref={container}>
            <ul className="guest-avatars">
                {guests.map((guest, index) => (
                    <li key={guest.name} className="guest">
                        <Avatar persona={toGuestPersona(guest, index)} size="sm" />
                        <span className="guest-name">{guest.name}</span>
                        {!isReadOnly && (
                            <button type="button" className="guest-remove" onClick={() => removeGuest(guest.name)} aria-label={`Retirer ${guest.name}`}>
                                ×
                            </button>
                        )}
                    </li>
                ))}
                {!isReadOnly && guests.length < MAX_GUESTS && (
                    <li className="guest">
                        <button
                            type="button"
                            className={`invite-button${isPanelOpen ? ' is-active' : ''}`}
                            onClick={() => {
                                if (!isPanelOpen) onPanelOpen?.();
                                setIsPanelOpen((open) => !open);
                            }}
                            aria-label="Inviter quelqu'un"
                            title="Inviter quelqu'un"
                        >
                            <PersonPlusIcon />
                        </button>
                        <span className="guest-name muted">Inviter</span>
                    </li>
                )}
            </ul>

            {isPanelOpen && (
                <div className="invite-panel" role="dialog" aria-label="Inviter à l'audience">
                    <strong>Inviter à l'audience</strong>
                    <p className="muted small">Les invités suivent les débats en direct et peuvent intervenir à la barre.</p>
                    <div className="invite-input-row">
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    addGuest();
                                }
                            }}
                            placeholder="Prénom ou e-mail"
                            maxLength={MAX_GUEST_NAME_LENGTH}
                            autoFocus
                        />
                        <button type="button" className="button primary small" onClick={addGuest} disabled={!name.trim()}>
                            Ajouter
                        </button>
                    </div>
                    <div className="invite-link-row">
                        <input readOnly value={inviteLink ?? 'Création du lien…'} onFocus={(event) => event.target.select()} aria-label="Lien d'invitation" />
                        <button type="button" className="button small" onClick={copyLink} disabled={!inviteLink}>
                            {isCopied ? 'Copié' : 'Copier'}
                        </button>
                    </div>
                    <p className="muted small">
                        {isLocalLink
                            ? 'Lien local : il marchera pour les autres une fois le site déployé en ligne.'
                            : 'Chiffré de bout en bout : seuls ceux qui ont le lien peuvent suivre.'}
                    </p>
                </div>
            )}
        </div>
    );
}
