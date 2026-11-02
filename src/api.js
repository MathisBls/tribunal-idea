const LOCAL_BRIDGE_URL = 'http://127.0.0.1:5281';
export const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE ?? LOCAL_BRIDGE_URL);

async function request(path, options = {}) {
    const response = await fetch(API_BASE + path, {
        ...options,
        headers: {'Content-Type': 'application/json', ...(options.headers ?? {})},
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? `Erreur ${response.status}`);
    return payload;
}

export const api = {
    eventsUrl: `${API_BASE}/api/events`,
    config: () => request('/api/config'),
    claudeStatus: (refresh = false) => request(`/api/claude-status${refresh ? '?refresh=1' : ''}`),
    mcpSources: (refresh = false) => request(`/api/mcp-sources${refresh ? '?refresh=1' : ''}`),
    addAzureDevOps: (organization) => request('/api/mcp-sources/azure-devops', {method: 'POST', body: {organization}}),
    settings: () => request('/api/settings'),
    saveSettings: (settings) => request('/api/settings', {method: 'POST', body: settings}),
    createShare: (existing = null) => request('/api/shares', {method: 'POST', body: existing ?? {}}),
    personas: () => request('/api/personas'),
    savePersona: (persona) => request('/api/personas', {method: 'POST', body: persona}),
    deletePersona: (id) => request(`/api/personas/${encodeURIComponent(id)}`, {method: 'DELETE'}),
    hearings: () => request('/api/hearings'),
    openHearing: (hearing) => request('/api/hearings', {method: 'POST', body: hearing}),
    intervene: (id, intervention) => request(`/api/hearings/${encodeURIComponent(id)}/intervene`, {method: 'POST', body: intervention}),
    adjourn: (id) => request(`/api/hearings/${encodeURIComponent(id)}/adjourn`, {method: 'POST'}),
    deleteHearing: (id) => request(`/api/hearings/${encodeURIComponent(id)}`, {method: 'DELETE'}),
};
