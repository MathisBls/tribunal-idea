#!/usr/bin/env node
import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {discoverMcpSources, readClaudeStatus} from './claude-cli.mjs';
import {COURT_CLERK, PERSONA_COLORS, PRESIDING_JUDGE} from './default-personas.mjs';
import {ALLOWED_MODELS, MAX_SEATS, MIN_SEATS, createEngine} from './engine.mjs';
import {deleteHearing, deletePersona, listHearings, listPersonas, savePersona} from './store.mjs';

const PORT = Number(process.env.TRIBUNAL_API_PORT ?? 5281);
const HOST = '127.0.0.1';
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOSTED_ORIGIN = 'https://tribunal-idea.vercel.app';
const ALLOWED_ORIGINS = new Set([
    HOSTED_ORIGIN,
    'http://localhost:5280',
    'http://127.0.0.1:5280',
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    ...(process.env.TRIBUNAL_ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
]);

const app = express();
app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
        res.status(403).json({error: 'Origine non autorisée'});
        return;
    }
    if (origin) {
        res.set({
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET,POST,DELETE',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Private-Network': 'true',
            Vary: 'Origin',
        });
    }
    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    next();
});
app.use(express.json({limit: '200kb'}));

const clients = new Set();
const broadcast = (event, payload) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients) client.write(frame);
};

const engine = createEngine((hearing) => broadcast('hearing', hearing));
let claudeStatus = readClaudeStatus();

app.get('/api/config', (_req, res) => {
    res.json({judge: PRESIDING_JUDGE, clerk: COURT_CLERK, colors: PERSONA_COLORS, models: ALLOWED_MODELS, minSeats: MIN_SEATS, maxSeats: MAX_SEATS});
});

app.get('/api/claude-status', (req, res) => {
    if (req.query.refresh) claudeStatus = readClaudeStatus();
    res.json(claudeStatus);
});

const MCP_CACHE_MS = 5 * 60_000;
let mcpSources = null;
let mcpSourcesAt = 0;
const readMcpSources = async (isRefresh) => {
    if (!mcpSources || isRefresh || Date.now() - mcpSourcesAt > MCP_CACHE_MS) {
        mcpSources = await discoverMcpSources();
        mcpSourcesAt = Date.now();
    }
    return mcpSources;
};

app.get('/api/mcp-sources', async (req, res) => {
    try {
        const sources = await readMcpSources(Boolean(req.query.refresh));
        res.json(sources.map(({name, status, readTools}) => ({name, status, readToolCount: readTools.length})));
    } catch (error) {
        res.status(500).json({error: error.message});
    }
});

app.get('/api/personas', (_req, res) => res.json(listPersonas()));

app.post('/api/personas', (req, res) => {
    try {
        res.json(savePersona(req.body ?? {}));
    } catch (error) {
        res.status(400).json({error: error.message});
    }
});

app.delete('/api/personas/:id', (req, res) => res.json({ok: deletePersona(req.params.id)}));

app.get('/api/hearings', (_req, res) => res.json(listHearings()));

app.post('/api/hearings', async (req, res) => {
    if (!claudeStatus.loggedIn) {
        claudeStatus = readClaudeStatus();
        if (!claudeStatus.loggedIn) {
            res.status(400).json({error: 'Connectez d’abord Claude Code sur cette machine'});
            return;
        }
    }
    try {
        const hasSources = Array.isArray(req.body?.sources) && req.body.sources.length > 0;
        res.json(engine.open(req.body ?? {}, hasSources ? await readMcpSources(false) : []));
    } catch (error) {
        res.status(409).json({error: error.message});
    }
});

app.post('/api/hearings/:id/adjourn', (req, res) => res.json({ok: engine.adjourn(req.params.id)}));

app.delete('/api/hearings/:id', (req, res) => {
    if (engine.isRunningHearing(req.params.id)) {
        res.status(409).json({error: 'Ajournez l’audience avant de la supprimer'});
        return;
    }
    const removed = deleteHearing(req.params.id);
    if (removed) broadcast('hearing-deleted', {id: req.params.id});
    res.json({ok: removed});
});

app.get('/api/events', (req, res) => {
    res.set({'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive'});
    res.flushHeaders();
    res.write('retry: 2000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
});

if (process.argv.includes('--serve-dist')) {
    const distDir = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.listen(PORT, HOST, () => console.log(`Tribunal prêt : ouvrez ${HOSTED_ORIGIN} (pont local sur http://${HOST}:${PORT})`));
