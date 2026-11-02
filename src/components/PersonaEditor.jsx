import {useState} from 'react';

import Avatar from './Avatar.jsx';

const PREVIEW_ID = 'persona-preview';

export default function PersonaEditor({persona, colors, characters, onSave, onDelete, onClose}) {
    const [draft, setDraft] = useState({name: '', role: '', persona: '', color: colors[0], character: characters[0].id, ...persona});
    const [error, setError] = useState('');
    const [isPreviewTalking, setIsPreviewTalking] = useState(false);
    const isEditing = Boolean(persona?.id);
    const update = (field) => (event) => setDraft((current) => ({...current, [field]: event.target.value}));
    const choose = (field, value) => setDraft((current) => ({...current, [field]: value}));
    const selectedCharacter = characters.find((character) => character.id === draft.character) ?? characters[0];
    const preview = {id: draft.id ?? PREVIEW_ID, name: draft.name, color: draft.color, character: draft.character};

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
            <form className="modal persona-editor" onSubmit={submit}>
                <h2>{isEditing ? 'Modifier le membre' : 'Nouveau membre'}</h2>
                <div className="persona-editor-grid">
                    <section className="character-studio" aria-label="Personnage">
                        <div className="character-stage" onMouseEnter={() => setIsPreviewTalking(true)} onMouseLeave={() => setIsPreviewTalking(false)}>
                            <Avatar persona={preview} size="xl" isSpeaking={isPreviewTalking} />
                            <strong>{draft.name || 'Nouveau membre'}</strong>
                            <span className="muted small">{selectedCharacter.details}</span>
                        </div>
                        <div className="field">
                            <span>Personnage</span>
                            <div className="character-grid">
                                {characters.map((character) => (
                                    <button
                                        key={character.id}
                                        type="button"
                                        className={`character-tile${draft.character === character.id ? ' is-selected' : ''}`}
                                        onClick={() => choose('character', character.id)}
                                        title={character.details}
                                    >
                                        <Avatar persona={{id: `${PREVIEW_ID}-${character.id}`, color: draft.color, character: character.id}} size="md" />
                                        <span className="small">{character.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="field">
                            <span>Couleur de la tenue</span>
                            <div className="swatches">
                                {colors.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        className={`swatch tone-${color}${draft.color === color ? ' is-selected' : ''}`}
                                        onClick={() => choose('color', color)}
                                        aria-label={color}
                                    />
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="persona-fields">
                        <label className="field">
                            <span>Nom affiché</span>
                            <input value={draft.name} onChange={update('name')} maxLength={60} placeholder="La juriste" required />
                        </label>
                        <label className="field">
                            <span>Rôle</span>
                            <input value={draft.role} onChange={update('role')} maxLength={80} placeholder="Droit et contrats" />
                        </label>
                        <label className="field grow-field">
                            <span>Point de vue défendu</span>
                            <textarea
                                value={draft.persona}
                                onChange={update('persona')}
                                maxLength={1200}
                                rows={8}
                                placeholder="Tu analyses chaque décision sous l'angle juridique : obligations, responsabilités, clauses à risque…"
                                required
                            />
                        </label>
                    </section>
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
