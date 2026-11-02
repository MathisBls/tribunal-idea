import {useState} from 'react';

import Select from './Select.jsx';

const SPEAKER_NAME_KEY = 'tribunal.speakerName';
const WHOLE_COURT = '';
const MAX_INTERVENTION_LENGTH = 600;

const readStoredName = () => {
    try {
        return localStorage.getItem(SPEAKER_NAME_KEY) ?? '';
    } catch {
        return '';
    }
};

const storeName = (name) => {
    try {
        localStorage.setItem(SPEAKER_NAME_KEY, name);
    } catch {
        // The name is only remembered for convenience.
    }
};

/**
 * Lets the people in the room speak at the bar: to the whole court, or to one member, which suspends the debate.
 */
export default function InterventionComposer({court, onSend}) {
    const [name, setName] = useState(readStoredName);
    const [text, setText] = useState('');
    const [targetId, setTargetId] = useState(WHOLE_COURT);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState('');
    const targetOptions = [
        {value: WHOLE_COURT, label: 'Tout le tribunal', hint: 'Versé aux débats'},
        ...court.map((persona) => ({value: persona.id, label: persona.name, hint: "Suspend l'audience pour répondre"})),
    ];
    const canSend = name.trim().length > 0 && text.trim().length > 0 && !isSending;

    const send = async (event) => {
        event.preventDefault();
        if (!canSend) return;
        setIsSending(true);
        setError('');
        try {
            storeName(name.trim());
            await onSend({name: name.trim(), text: text.trim(), targetId: targetId || null});
            setText('');
        } catch (sendError) {
            setError(sendError.message);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <form className="composer" onSubmit={send}>
            <div className="composer-row">
                <input className="composer-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Votre nom" maxLength={40} aria-label="Votre nom" />
                <span className="muted small">à</span>
                <Select value={targetId} options={targetOptions} onChange={setTargetId} label="Destinataire" />
            </div>
            <div className="composer-row">
                <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) send(event);
                    }}
                    placeholder={targetId ? 'Votre question…' : 'Votre intervention à la barre…'}
                    rows={2}
                    maxLength={MAX_INTERVENTION_LENGTH}
                />
                <button type="submit" className="button primary" disabled={!canSend}>
                    {isSending ? '…' : 'Intervenir'}
                </button>
            </div>
            {error && <p className="form-error">{error}</p>}
        </form>
    );
}
