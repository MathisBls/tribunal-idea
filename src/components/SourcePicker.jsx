import {useEffect, useRef, useState} from 'react';

import Select from './Select.jsx';
import {api} from '../api.js';

const CONNECTED_STATUS = 'connected';
const CLAUDE_AI_ORIGIN = 'claudeai';
const CLAUDE_AI_CONNECTORS_URL = 'https://claude.ai/settings/connectors';
const AZURE_DEVOPS_SERVER = 'azure-devops';
const NO_PROJECT = '';
const OTHER_PROJECT = '__other__';

const HIDDEN_SOURCES_KEY = 'tribunal.hiddenSources';

const readHiddenSources = () => {
    try {
        return JSON.parse(localStorage.getItem(HIDDEN_SOURCES_KEY) ?? '[]');
    } catch {
        return [];
    }
};

const storeHiddenSources = (names) => {
    try {
        localStorage.setItem(HIDDEN_SOURCES_KEY, JSON.stringify(names));
    } catch {
        // Hiding is a per-machine convenience.
    }
};

const formatSourceName = (name) => name.replace(/^claude\.ai /, '');
const isUsableSource = (source) => source.status === CONNECTED_STATUS && source.readToolCount > 0;

/**
 * Tools the clerk may read: ready ones are picked with one click, the others offer a way to connect them.
 */
export default function SourcePicker({selectedSources, onToggle}) {
    const [sources, setSources] = useState(null);
    const [organization, setOrganization] = useState('');
    const [isAzureFormOpen, setIsAzureFormOpen] = useState(false);
    const [error, setError] = useState('');
    const [hiddenSources, setHiddenSources] = useState(readHiddenSources);
    const [isShowingHidden, setIsShowingHidden] = useState(false);
    const [projectDir, setProjectDir] = useState(null);
    const [projects, setProjects] = useState([]);
    const [projectDirDraft, setProjectDirDraft] = useState('');
    const [isEditingProjectDir, setIsEditingProjectDir] = useState(false);
    const isAwaitingConnection = useRef(false);

    const loadSources = (isRefresh) => {
        setSources(null);
        api.mcpSources(isRefresh)
            .then(setSources)
            .catch(() => setSources([]));
    };

    useEffect(() => {
        api.settings()
            .then((settings) => {
                setProjectDir(settings.projectDir);
                setProjects(settings.projects);
            })
            .catch(() => setProjectDir(null));
        loadSources(false);
        const refreshAfterConnecting = () => {
            if (!isAwaitingConnection.current) return;
            isAwaitingConnection.current = false;
            loadSources(true);
        };
        window.addEventListener('focus', refreshAfterConnecting);
        return () => window.removeEventListener('focus', refreshAfterConnecting);
    }, []);

    const addAzureDevOps = async (event) => {
        event.preventDefault();
        setError('');
        try {
            await api.addAzureDevOps(organization.trim());
            setIsAzureFormOpen(false);
            loadSources(true);
        } catch (addError) {
            setError(addError.message);
        }
    };

    const applyProjectDir = async (directory) => {
        setError('');
        try {
            const settings = await api.saveSettings({projectDir: directory});
            setProjectDir(settings.projectDir);
            setProjects(settings.projects);
            setIsEditingProjectDir(false);
            loadSources(true);
        } catch (saveError) {
            setError(saveError.message);
        }
    };

    const chooseProject = (value) => {
        if (value === OTHER_PROJECT) {
            setProjectDirDraft(projectDir ?? '');
            setIsEditingProjectDir(true);
            return;
        }
        applyProjectDir(value);
    };

    const projectOptions = [
        {value: NO_PROJECT, label: 'Aucun projet', hint: 'Seulement vos outils personnels'},
        ...projects.map((project) => ({value: project.path, label: project.name, hint: project.servers.join(', ')})),
        ...(projectDir && !projects.some((project) => project.path === projectDir) ? [{value: projectDir, label: projectDir, hint: 'Dossier choisi'}] : []),
        {value: OTHER_PROJECT, label: 'Autre dossier…', hint: 'Saisir un chemin'},
    ];

    const saveProjectDir = async (event) => {
        event.preventDefault();
        setError('');
        try {
            const settings = await api.saveSettings({projectDir: projectDirDraft});
            setProjectDir(settings.projectDir);
            setIsEditingProjectDir(false);
            loadSources(true);
        } catch (saveError) {
            setError(saveError.message);
        }
    };

    const projectDirRow = isEditingProjectDir ? (
        <form className="project-dir-form" onSubmit={saveProjectDir}>
            <input
                value={projectDirDraft}
                onChange={(event) => setProjectDirDraft(event.target.value)}
                placeholder="C:\\chemin\\vers\\votre\\projet"
                autoFocus
            />
            <button type="submit" className="button primary small">
                Enregistrer
            </button>
            <button type="button" className="button ghost small" onClick={() => setIsEditingProjectDir(false)}>
                Annuler
            </button>
        </form>
    ) : (
        <div className="project-dir">
            <span className="source-group-title">Projet</span>
            <Select value={projectDir ?? NO_PROJECT} options={projectOptions} onChange={chooseProject} label="Projet Claude Code" />
            <span className="muted small">Ajoute les outils déclarés par ce projet, comme Jira.</span>
        </div>
    );

    if (sources === null)
        return (
            <div className="source-picker">
                {projectDirRow}
                <p className="muted small">Recherche de vos outils…</p>
            </div>
        );

    const toggleHidden = (name) => {
        const next = hiddenSources.includes(name) ? hiddenSources.filter((hidden) => hidden !== name) : [...hiddenSources, name];
        setHiddenSources(next);
        storeHiddenSources(next);
        if (selectedSources.includes(name)) onToggle(name);
    };

    const visibleSources = sources.filter((source) => isShowingHidden || !hiddenSources.includes(source.name));
    const hiddenCount = sources.filter((source) => hiddenSources.includes(source.name)).length;
    const readySources = visibleSources.filter(isUsableSource);
    const pendingSources = visibleSources.filter((source) => !isUsableSource(source));
    const renderHideButton = (source) => (
        <button
            type="button"
            className="source-hide"
            onClick={() => toggleHidden(source.name)}
            aria-label={hiddenSources.includes(source.name) ? `Afficher ${formatSourceName(source.name)}` : `Masquer ${formatSourceName(source.name)}`}
            title={hiddenSources.includes(source.name) ? 'Afficher' : 'Masquer de la greffe'}
        >
            <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
                {hiddenSources.includes(source.name) ? (
                    <path d="M2 5a3 3 0 1 0 1-2.2M2 1.5V3h1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                ) : (
                    <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                )}
            </svg>
        </button>
    );
    const hasAzureDevOps = sources.some((source) => source.name === AZURE_DEVOPS_SERVER);

    return (
        <div className="source-picker">
            {projectDirRow}
            <div className="source-group">
                <span className="source-group-title">Prêts</span>
                {readySources.length === 0 ? (
                    <p className="muted small">Aucun outil connecté pour l'instant.</p>
                ) : (
                    <ul className="source-list">
                        {readySources.map((source) => {
                            const isSelected = selectedSources.includes(source.name);
                            return (
                                <li key={source.name} className="source-item">
                                    <button
                                        type="button"
                                        className={`source-chip is-ready${isSelected ? ' is-selected' : ''}`}
                                        onClick={() => onToggle(source.name)}
                                        aria-pressed={isSelected}
                                        title={`${source.readToolCount} outil${source.readToolCount > 1 ? 's' : ''} de lecture`}
                                    >
                                        <span className="source-dot" />
                                        {formatSourceName(source.name)}
                                        <span className="source-check">{isSelected ? '✓' : '+'}</span>
                                    </button>
                                    {renderHideButton(source)}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="source-group">
                <span className="source-group-title">À connecter</span>
                <ul className="source-list">
                    {!hasAzureDevOps && (
                        <li>
                            {isAzureFormOpen ? (
                                <form className="source-connect-form" onSubmit={addAzureDevOps}>
                                    <span className="small">Azure DevOps</span>
                                    <input
                                        value={organization}
                                        onChange={(event) => setOrganization(event.target.value)}
                                        placeholder="Organisation"
                                        autoFocus
                                        maxLength={63}
                                    />
                                    <button type="submit" className="button primary small" disabled={!organization.trim()}>
                                        Ajouter
                                    </button>
                                    <button type="button" className="icon-button" onClick={() => setIsAzureFormOpen(false)} aria-label="Annuler">
                                        ×
                                    </button>
                                </form>
                            ) : (
                                <span className="source-chip is-pending">
                                    Azure DevOps
                                    <button type="button" className="source-connect" onClick={() => setIsAzureFormOpen(true)}>
                                        Ajouter
                                    </button>
                                </span>
                            )}
                        </li>
                    )}
                    {pendingSources.map((source) => (
                        <li key={source.name} className="source-item">
                            <span className="source-chip is-pending">
                                {formatSourceName(source.name)}
                                {source.origin === CLAUDE_AI_ORIGIN ? (
                                    <a
                                        className="source-connect"
                                        href={CLAUDE_AI_CONNECTORS_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={() => {
                                            isAwaitingConnection.current = true;
                                        }}
                                    >
                                        Connecter
                                    </a>
                                ) : (
                                    <span className="muted small" title="Dans un terminal : claude, puis /mcp">
                                        via /mcp
                                    </span>
                                )}
                            </span>
                            {renderHideButton(source)}
                        </li>
                    ))}
                </ul>
                {error && <p className="form-error">{error}</p>}
                <p className="muted small">
                    Après connexion, revenez ici : la liste se met à jour toute seule.
                    {hiddenCount > 0 && (
                        <>
                            {' '}
                            <button type="button" className="link-button small" onClick={() => setIsShowingHidden((isShown) => !isShown)}>
                                {isShowingHidden ? 'Cacher les outils masqués' : `Outils masqués (${hiddenCount})`}
                            </button>
                        </>
                    )}
                </p>
            </div>
        </div>
    );
}
