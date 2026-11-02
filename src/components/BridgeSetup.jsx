const BRIDGE_COMMAND = 'npx github:MathisBls/tribunal-idea';

export default function BridgeSetup() {
    return (
        <main className="bridge-setup">
            <h1>Tribunal</h1>
            <p className="bridge-lead">
                Les audiences tournent sur <strong>votre</strong> Claude Code, avec votre abonnement et votre quota. Lancez le pont local sur votre machine :
            </p>
            <ol className="bridge-steps">
                <li>
                    <span>Installez Claude Code et connectez-vous (une seule fois)</span>
                    <code className="block">npm install -g @anthropic-ai/claude-code</code>
                    <code className="block">claude</code>
                    <span className="muted small">
                        puis tapez <code>/login</code> et quittez.
                    </span>
                </li>
                <li>
                    <span>Lancez le pont et laissez le terminal ouvert</span>
                    <code className="block">{BRIDGE_COMMAND}</code>
                </li>
            </ol>
            <p className="muted small bridge-waiting">
                <span className="live-dot" /> En attente du pont sur 127.0.0.1:5281… la page se connecte toute seule.
            </p>
        </main>
    );
}
