import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TURN_TIMEOUT_MS = 120_000;
const TOOL_TURN_TIMEOUT_MS = 300_000;
const DISCOVERY_TIMEOUT_MS = 60_000;
const READ_VERBS = new Set(['get', 'list', 'search', 'fetch', 'lookup', 'read', 'query', 'find', 'show', 'view', 'describe']);
const NOUN_ONLY_BLOCKLIST = new Set(['write', 'upsert', 'upload', 'run', 'build', 'capacity', 'attachment']);
const WRITE_VERBS = new Set(['create', 'update', 'edit', 'delete', 'remove', 'add', 'transition', 'post', 'comment', 'write', 'set', 'link', 'move', 'merge', 'approve', 'assign', 'upload', 'send', 'run', 'execute', 'trigger', 'queue', 'complete', 'abandon', 'vote', 'batch', 'export', 'import', 'collect']);
const IS_WINDOWS = process.platform === 'win32';

function resolveClaudeCommand() {
    if (process.env.CLAUDE_PATH) return process.env.CLAUDE_PATH;
    if (IS_WINDOWS) {
        const npmExe = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
        if (fs.existsSync(npmExe)) return npmExe;
        return 'claude.cmd';
    }
    return 'claude';
}

const claudeCommand = () => resolveClaudeCommand();
let workingDirectory = null;

/**
 * Folder the CLI runs from, so the MCP servers declared in that project's .mcp.json are loaded too.
 */
export function setClaudeWorkingDirectory(directory) {
    workingDirectory = directory || null;
}

/**
 * Environment of the CLI child: the user's own login is used, never a session inherited from a parent Claude, and
 * slow MCP servers are awaited so the clerk can use them.
 */
function buildChildEnvironment() {
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^CLAUDE_CODE|^CLAUDECODE/i.test(name)));
    return {...inherited, MCP_CONNECTION_NONBLOCKING: 'false'};
}

const toToolPrefix = (serverName) => `mcp__${serverName.replace(/[^A-Za-z0-9_-]/g, '_')}__`;

/**
 * A tool is kept only when its first verb is a read verb, or when it names a resource without any verb or write
 * marker (servers that split reads and `_write` tools), so a persona can never change anything in the user's tools.
 */
function isReadOnlyTool(toolName) {
    const words = toolName
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toLowerCase()
        .split(/[^a-z]+/);
    const firstVerb = words.find((word) => READ_VERBS.has(word) || WRITE_VERBS.has(word));
    if (firstVerb) return READ_VERBS.has(firstVerb);
    return !words.some((word) => NOUN_ONLY_BLOCKLIST.has(word));
}

const STDIO_LIST_TIMEOUT_MS = 90_000;
const MCP_PROTOCOL_VERSION = '2025-06-18';
const PENDING_STATUS = 'pending';
const USER_ORIGIN = 'user';

/**
 * Claude Code projects of this machine that declare their own MCP servers in a .mcp.json file.
 */
export function listMcpProjects() {
    try {
        const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8'));
        return Object.keys(config.projects ?? {})
            .map((directory) => {
                try {
                    const projectConfig = JSON.parse(fs.readFileSync(path.join(directory, '.mcp.json'), 'utf8'));
                    return {path: path.normalize(directory), name: path.basename(directory), servers: Object.keys(projectConfig.mcpServers ?? {})};
                } catch {
                    return null;
                }
            })
            .filter((project) => project && project.servers.length > 0);
    } catch {
        return [];
    }
}

function readUserMcpConfig(name) {
    try {
        const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8'));
        return config.mcpServers?.[name] ?? null;
    } catch {
        return null;
    }
}

/**
 * Asks a local MCP server for its tools over stdio, for servers that start too slowly to be announced by the CLI.
 */
function listStdioTools({command, args = [], env = {}}) {
    return new Promise((resolve) => {
        if (!command) {
            resolve([]);
            return;
        }
        const child = spawn(command, args, {env: {...process.env, ...env}, windowsHide: true, shell: IS_WINDOWS, stdio: ['pipe', 'pipe', 'ignore']});
        const timeout = setTimeout(() => finish([]), STDIO_LIST_TIMEOUT_MS);
        let buffer = '';
        let isDone = false;
        const send = (message) => child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', ...message})}\n`);
        function finish(tools) {
            if (isDone) return;
            isDone = true;
            clearTimeout(timeout);
            child.kill();
            resolve(tools);
        }
        child.stdout.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                let message;
                try {
                    message = JSON.parse(line);
                } catch {
                    continue;
                }
                if (message.id === 1) {
                    send({method: 'notifications/initialized'});
                    send({id: 2, method: 'tools/list', params: {}});
                } else if (message.id === 2) {
                    finish((message.result?.tools ?? []).map((tool) => tool.name));
                }
            }
        });
        child.on('error', () => finish([]));
        child.on('close', () => finish([]));
        send({id: 1, method: 'initialize', params: {protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: {name: 'tribunal', version: '1.0.0'}}});
    });
}

async function completePendingSources(sources) {
    return Promise.all(
        sources.map(async (source) => {
            if (source.status !== PENDING_STATUS || source.origin !== USER_ORIGIN) return source;
            const config = readUserMcpConfig(source.name);
            const toolNames = config ? await listStdioTools(config) : [];
            if (toolNames.length === 0) return source;
            const prefix = toToolPrefix(source.name);
            return {...source, status: 'connected', readTools: toolNames.filter(isReadOnlyTool).map((toolName) => prefix + toolName)};
        }),
    );
}

/**
 * Lists the MCP servers of the user's Claude Code with their read-only tools.
 */
export async function discoverMcpSources() {
    return completePendingSources(await readAnnouncedSources());
}

/**
 * Reads the servers announced by the CLI, which is stopped as soon as it has listed its tools, before any request to
 * the model.
 */
function readAnnouncedSources() {
    return new Promise((resolve, reject) => {
        const child = spawn(claudeCommand(), ['-p', '--model', 'haiku', '--tools', '', '--no-session-persistence', '--output-format', 'stream-json', '--verbose'], {
            env: buildChildEnvironment(),
            cwd: workingDirectory ?? undefined,
            windowsHide: true,
            shell: IS_WINDOWS && !claudeCommand().endsWith('.exe'),
            stdio: ['pipe', 'pipe', 'ignore'],
        });
        const timeout = setTimeout(() => child.kill(), DISCOVERY_TIMEOUT_MS);
        let buffer = '';
        let isResolved = false;
        child.stdout.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                let event;
                try {
                    event = JSON.parse(line);
                } catch {
                    continue;
                }
                if (event.type !== 'system' || event.subtype !== 'init') continue;
                const tools = event.tools ?? [];
                const sources = (event.mcp_servers ?? []).map((server) => {
                    const prefix = toToolPrefix(server.name);
                    const readTools = tools.filter((tool) => tool.startsWith(prefix) && isReadOnlyTool(tool.slice(prefix.length)));
                    return {name: server.name, status: server.status, origin: server.source ?? null, readTools};
                });
                isResolved = true;
                clearTimeout(timeout);
                child.kill();
                resolve(sources);
                return;
            }
        });
        child.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.on('close', () => {
            clearTimeout(timeout);
            if (!isResolved) reject(new Error('Impossible de lister les outils de Claude Code'));
        });
        child.stdin.end('ok');
    });
}

/**
 * Registers an MCP server in the user's Claude Code configuration, for every project.
 */
export function addMcpServer(name, commandArgs) {
    const result = spawnSync(claudeCommand(), ['mcp', 'add', '--scope', 'user', name, '--', ...commandArgs], {
        encoding: 'utf8',
        env: buildChildEnvironment(),
        shell: IS_WINDOWS && !claudeCommand().endsWith('.exe'),
        timeout: 30_000,
    });
    if (result.error || result.status !== 0) throw new Error((result.stderr || result.stdout || 'Ajout impossible').trim().split('\n').at(-1));
}

/**
 * Tells whether Claude Code is installed and logged in on this machine, without spending any quota.
 */
export function readClaudeStatus() {
    const version = spawnSync(claudeCommand(), ['--version'], {encoding: 'utf8', shell: IS_WINDOWS && !claudeCommand().endsWith('.exe'), timeout: 15_000});
    if (version.error || version.status !== 0) {
        return {installed: false, loggedIn: false, version: null, method: null};
    }
    const credentialsFile = path.join(os.homedir(), '.claude', '.credentials.json');
    const hasSubscriptionLogin = fs.existsSync(credentialsFile) || process.platform === 'darwin';
    const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
    return {
        installed: true,
        loggedIn: hasSubscriptionLogin || hasApiKey,
        version: version.stdout.trim().split(' ')[0],
        method: hasApiKey ? 'api-key' : hasSubscriptionLogin ? 'subscription' : null,
    };
}

/**
 * Runs one turn of a persona through the user's Claude Code CLI and streams the text as it is written.
 */
export function runClaudeTurn({systemPrompt, prompt, model, allowedTools = [], onDelta}) {
    return new Promise((resolve, reject) => {
        const args = [
            '-p',
            '--model', model,
            '--tools', '',
            '--no-session-persistence',
            '--output-format', 'stream-json',
            '--verbose',
            '--include-partial-messages',
            '--system-prompt', systemPrompt,
            ...(allowedTools.length > 0 ? ['--allowedTools', allowedTools.join(',')] : ['--strict-mcp-config']),
        ];
        const child = spawn(claudeCommand(), args, {
            env: buildChildEnvironment(),
            cwd: workingDirectory ?? undefined,
            windowsHide: true,
            shell: IS_WINDOWS && !claudeCommand().endsWith('.exe'),
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const timeout = setTimeout(() => child.kill(), allowedTools.length > 0 ? TOOL_TURN_TIMEOUT_MS : TURN_TIMEOUT_MS);
        let text = '';
        let buffer = '';
        let errorOutput = '';
        child.stderr.on('data', (chunk) => {
            errorOutput += chunk.toString('utf8');
        });
        child.stdout.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                let event;
                try {
                    event = JSON.parse(line);
                } catch {
                    continue;
                }
                const delta = event.type === 'stream_event' && event.event?.delta?.type === 'text_delta' ? event.event.delta.text : null;
                if (delta) {
                    text += delta;
                    onDelta(text);
                } else if (event.type === 'result' && event.result) {
                    text = event.result;
                    onDelta(text);
                }
            }
        });
        child.on('error', (error) => {
            clearTimeout(timeout);
            reject(new Error(`Claude Code introuvable (${error.message})`));
        });
        child.on('close', (code) => {
            clearTimeout(timeout);
            if (text.trim()) resolve(text.trim());
            else reject(new Error(errorOutput.trim().split('\n').at(-1) || `pas de réponse (code ${code})`));
        });
        child.stdin.end(prompt);
    });
}
