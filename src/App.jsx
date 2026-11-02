import {useCallback, useEffect, useMemo, useState} from 'react';

import {api} from './api.js';
import Avatar from './components/Avatar.jsx';
import ClaudeStatus from './components/ClaudeStatus.jsx';
import HearingView from './components/HearingView.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import BridgeSetup from './components/BridgeSetup.jsx';
import SetupView from './components/SetupView.jsx';
import {useSecretWord} from './use-secret-word.js';

const SECRET_WORD_3D = 'objection';
const BRIDGE_RETRY_MS = 3000;

export default function App() {
    const [config, setConfig] = useState(null);
    const [personas, setPersonas] = useState([]);
    const [hearings, setHearings] = useState([]);
    const [claudeStatus, setClaudeStatus] = useState(null);
    const [selectedHearingId, setSelectedHearingId] = useState(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isBridgeMissing, setIsBridgeMissing] = useState(false);
    const is3dUnlocked = useSecretWord(SECRET_WORD_3D);

    const refreshPersonas = useCallback(() => api.personas().then(setPersonas), []);

    const connectBridge = useCallback(async () => {
        try {
            const [nextConfig, nextHearings] = await Promise.all([api.config(), api.hearings(), refreshPersonas()]);
            setConfig(nextConfig);
            setHearings(nextHearings);
            setIsBridgeMissing(false);
            api.claudeStatus().then(setClaudeStatus);
        } catch {
            setIsBridgeMissing(true);
        }
    }, [refreshPersonas]);

    useEffect(() => {
        connectBridge();
    }, [connectBridge]);

    useEffect(() => {
        if (!isBridgeMissing) return undefined;
        const timer = setInterval(connectBridge, BRIDGE_RETRY_MS);
        return () => clearInterval(timer);
    }, [isBridgeMissing, connectBridge]);

    useEffect(() => {
        if (!config) return undefined;
        const source = new EventSource(api.eventsUrl);
        source.addEventListener('hearing', (event) => {
            const hearing = JSON.parse(event.data);
            setHearings((current) => [hearing, ...current.filter((item) => item.id !== hearing.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        });
        source.addEventListener('hearing-deleted', (event) => {
            const {id} = JSON.parse(event.data);
            setHearings((current) => current.filter((item) => item.id !== id));
            setSelectedHearingId((current) => (current === id ? null : current));
        });
        return () => source.close();
    }, [config]);

    const personasById = useMemo(() => {
        const map = new Map(personas.map((persona) => [persona.id, persona]));
        if (config?.judge) map.set(config.judge.id, config.judge);
        if (config?.clerk) map.set(config.clerk.id, config.clerk);
        return map;
    }, [personas, config]);

    const selectedHearing = hearings.find((hearing) => hearing.id === selectedHearingId) ?? null;
    const runningHearing = hearings.find((hearing) => ['en_cours', 'deliberation'].includes(hearing.status)) ?? null;

    const openHearing = async (draft) => {
        const hearing = await api.openHearing(draft);
        setHearings((current) => [hearing, ...current.filter((item) => item.id !== hearing.id)]);
        setSelectedHearingId(hearing.id);
    };

    if (isBridgeMissing) return <BridgeSetup />;
    if (!config || personas.length === 0) return <div className="boot">Ouverture du tribunal…</div>;

    return (
        <div className="app">
            <header className="topbar">
                <button type="button" className="brand" onClick={() => setSelectedHearingId(null)} title="Nouvelle audience">
                    <Avatar persona={config.judge} size="sm" />
                    Tribunal
                </button>
                <div className="topbar-actions">
                    {runningHearing && runningHearing.id !== selectedHearingId && (
                        <button type="button" className="live-pill" onClick={() => setSelectedHearingId(runningHearing.id)}>
                            <span className="live-dot" /> Audience en cours
                        </button>
                    )}
                    <ClaudeStatus status={claudeStatus} onRefresh={() => api.claudeStatus(true).then(setClaudeStatus)} />
                    <button type="button" className="button ghost" onClick={() => setIsHistoryOpen(true)}>
                        Historique <span className="count">{hearings.length}</span>
                    </button>
                </div>
            </header>

            <main className="main">
                {selectedHearing ? (
                    <HearingView
                        hearing={selectedHearing}
                        personasById={personasById}
                        is3dUnlocked={is3dUnlocked}
                        onNewHearing={() => setSelectedHearingId(null)}
                    />
                ) : (
                    <SetupView
                        config={config}
                        personas={personas}
                        isClaudeReady={Boolean(claudeStatus?.loggedIn)}
                        isBusy={Boolean(runningHearing)}
                        onOpenHearing={openHearing}
                        onPersonasChanged={refreshPersonas}
                    />
                )}
            </main>

            {isHistoryOpen && (
                <HistoryPanel
                    hearings={hearings}
                    personasById={personasById}
                    selectedId={selectedHearingId}
                    onSelect={(id) => {
                        setSelectedHearingId(id);
                        setIsHistoryOpen(false);
                    }}
                    onDelete={(id) => api.deleteHearing(id)}
                    onClose={() => setIsHistoryOpen(false)}
                />
            )}
        </div>
    );
}
