import {useState} from 'react';

const EMPTY_PERSONA = {name: '', role: '', persona: '', color: 'coral'};

export default function PersonaEditor({persona, colors, onSave, onDelete, onClose}) {
    const [draft, setDraft] = useState({...EMPTY_PERSONA, ...persona});
    const [error, setError] = useState('');
    const isEditing = Boolean(persona?.id);
    const update = (field) => (event) => setDraft((current) => ({...current, [field]: event.target.value}));

    const submit = async (event) => {
        event.preventDefault();
        try {
            await onSave(draft);
            onClose();
        } catch (saveError) {
            setError(saveError.message);
        }
    };

    return (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <form className="modal" onSubmit={submit}>
                <h2>{isEditing ? 'Modifier le membre' : 'Nouveau membre'}</h2>
                <label className="field">
                    <span>Nom affiché</span>
                    <input value={draft.name} onChange={update('name')} maxLength={60} placeholder="La juriste" required />
                </label>
                <label className="field">
                    <span>Rôle</span>
                    <input value={draft.role} onChange={update('role')} maxLength={80} placeholder="Droit et contrats" />
                </label>
                <label className="field">
                    <span>Point de vue défendu</span>
                    <textarea
                        value={draft.persona}
                        onChange={update('persona')}
                        maxLength={1200}
                        rows={5}
                        placeholder="Tu analyses chaque décision sous l'angle juridique : obligations, responsabilités, clauses à risque…"
                        required
                    />
                </label>
                <div className="field">
                    <span>Couleur</span>
                    <div className="swatches">
                        {colors.map((color) => (
                            <button
                                key={color}
                                type="button"
                                className={`swatch tone-${color}${draft.color === color ? ' is-selected' : ''}`}
                                onClick={() => setDraft((current) => ({...current, color}))}
                                aria-label={color}
                            />
                        ))}
                    </div>
                </div>
                {error && <p className="form-error">{error}</p>}
                <div className="modal-actions">
                    {isEditing && (
                        <button type="button" className="button danger ghost" onClick={() => onDelete(persona.id).then(onClose)}>
                            Supprimer
                        </button>
                    )}
                    <span className="grow" />
                    <button type="button" className="button ghost" onClick={onClose}>
                        Annuler
                    </button>
                    <button type="submit" className="button primary">
                        Enregistrer
                    </button>
                </div>
            </form>
        </div>
    );
}
