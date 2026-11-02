import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TURN_TIMEOUT_MS = 120_000;
const TOOL_TURN_TIMEOUT_MS = 300_000;
const DISCOVERY_TIMEOUT_MS = 60_000;
const READ_VERBS = new Set(['get', 'list', 'search', 'fetch', 'lookup', 'read', 'query', 'find', 'show', 'view', 'describe']);
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

const CLAUDE_COMMAND = resolveClaudeCommand();

/**
 * Environment of the CLI child: the user's own login is used, never a session inherited from a parent Claude.
 */
function buildChildEnvironment() {
    return Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^CLAUDE_CODE|^CLAUDECODE/i.test(name)));
}

const toToolPrefix = (serverName) => `mcp__${serverName.replace(/[^A-Za-z0-9_-]/g, '_')}__`;

/**
 * A tool is kept only when its first verb is a read verb, so a persona can never change anything in the user's tools.
 */
function isReadOnlyTool(toolName) {
    const words = toolName
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toLowerCase()
        .split(/[^a-z]+/);
    const firstVerb = words.find((word) => READ_VERBS.has(word) || WRITE_VERBS.has(word));
    return READ_VERBS.has(firstVerb);
}

/**
 * Lists the MCP servers of the user's Claude Code with their read-only tools. The CLI is stopped as soon as it has
 * announced its tools, before any request to the model.
 */
export function discoverMcpSources() {
    return new Promise((resolve, reject) => {
        const child = spawn(CLAUDE_COMMAND, ['-p', '--model', 'haiku', '--tools', '', '--no-session-persistence', '--output-format', 'stream-json', '--verbose'], {
            env: buildChildEnvironment(),
            windowsHide: true,
            shell: IS_WINDOWS && !CLAUDE_COMMAND.endsWith('.exe'),
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
                    return {name: server.name, status: server.status, readTools};
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
 * Tells whether Claude Code is installed and logged in on this machine, without spending any quota.
 */
export function readClaudeStatus() {
    const version = spawnSync(CLAUDE_COMMAND, ['--version'], {encoding: 'utf8', shell: IS_WINDOWS && !CLAUDE_COMMAND.endsWith('.exe'), timeout: 15_000});
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
        const child = spawn(CLAUDE_COMMAND, args, {
            env: buildChildEnvironment(),
            windowsHide: true,
            shell: IS_WINDOWS && !CLAUDE_COMMAND.endsWith('.exe'),
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
