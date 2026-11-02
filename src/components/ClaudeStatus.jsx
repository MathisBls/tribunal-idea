import {useEffect, useRef, useState} from 'react';

export default function ClaudeStatus({status, onRefresh}) {
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const container = useRef(null);

    useEffect(() => {
        if (!isHelpOpen) return undefined;
        const closeOnOutsideClick = (event) => {
            if (!container.current?.contains(event.target)) setIsHelpOpen(false);
        };
        const closeOnEscape = (event) => event.key === 'Escape' && setIsHelpOpen(false);
        document.addEventListener('pointerdown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [isHelpOpen]);

    if (!status) return null;

    const label = !status.installed ? 'Claude Code non installé' : status.loggedIn ? 'Connecté à Claude' : 'Claude non connecté';
    const tone = status.loggedIn ? 'ok' : 'warn';

    return (
        <div className="claude-status" ref={container}>
            <button type="button" className={`status-pill ${tone}`} onClick={() => setIsHelpOpen((open) => !open)}>
                <span className="status-dot" /> {label}
            </button>
            {isHelpOpen && (
                <div className="popover" role="dialog">
                    {status.loggedIn ? (
                        <>
                            <p>
                                Les audiences utilisent <strong>votre</strong> compte Claude ({status.method === 'api-key' ? 'clé API' : 'abonnement'}) via
                                Claude Code{status.version ? ` ${status.version}` : ''}. Chaque membre consomme votre quota.
                            </p>
                            <p className="muted">Pour changer de compte : lancez <code>claude</code> dans un terminal puis <code>/login</code>.</p>
                        </>
                    ) : !status.installed ? (
                        <>
                            <p>Installez Claude Code, puis connectez-vous avec votre compte :</p>
                            <code className="block">npm install -g @anthropic-ai/claude-code</code>
                            <code className="block">claude</code>
                            <p className="muted">Dans Claude Code, tapez <code>/login</code> et suivez les instructions.</p>
                        </>
                    ) : (
                        <>
                            <p>Connectez Claude Code à votre compte : dans un terminal, lancez</p>
                            <code className="block">claude</code>
                            <p className="muted">puis tapez <code>/login</code>. Revenez ensuite ici.</p>
                        </>
                    )}
                    <button type="button" className="button small" onClick={onRefresh}>
                        Vérifier à nouveau
                    </button>
                </div>
            )}
        </div>
    );
}
