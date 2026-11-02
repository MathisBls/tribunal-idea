import crypto from 'node:crypto';

import {COURT_CLERK, PRESIDING_JUDGE} from './default-personas.mjs';
import {findPersona} from './store.mjs';

const RELAY_URL = 'https://ntfy.sh';
const TOPIC_PREFIX = 'tribunal-';
const TOPIC_ID_BYTES = 15;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const MAX_SHARED_CONTEXT_LENGTH = 1500;
const MAX_INTERVENTION_LENGTH = 600;
const MAX_GUEST_NAME_LENGTH = 40;
const SHARE_ID_PATTERN = /^tribunal-[A-Za-z0-9_-]{20}$/;

const shares = new Map();

const encrypt = (key, payload) => {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final(), cipher.getAuthTag()]);
    return Buffer.concat([iv, body]).toString('base64url');
};

const decrypt = (key, sealed) => {
    const bytes = Buffer.from(sealed, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, IV_BYTES));
    decipher.setAuthTag(bytes.subarray(bytes.length - 16));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(IV_BYTES, bytes.length - 16)), decipher.final()]).toString('utf8'));
};

const toSharedPersona = (persona) => persona && {id: persona.id, name: persona.name, role: persona.role, color: persona.color, character: persona.character};

const toSharedMessage = (message) => ({
    id: message.id,
    personaId: message.personaId,
    authorName: message.authorName,
    kind: message.kind,
    targetId: message.targetId,
    text: message.text,
    at: message.at,
});

async function publish(share, event) {
    try {
        await fetch(`${RELAY_URL}/${share.id}`, {method: 'POST', body: encrypt(share.key, event)});
    } catch {
        // A guest that misses an event catches up on the next snapshot of messages.
    }
}

/**
 * Listens to the guests' interventions, which they publish encrypted on the hearing's inbound topic.
 */
async function listenToGuests(share, onIntervention) {
    const since = Math.floor(share.createdAt / 1000);
    while (!share.isClosed) {
        try {
            const response = await fetch(`${RELAY_URL}/${share.id}-in/json?since=${since}`, {signal: share.abort.signal});
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            for (;;) {
                const {value, done} = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, {stream: true});
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    const frame = JSON.parse(line || '{}');
                    if (frame.event !== 'message' || share.seenInboundIds.has(frame.id)) continue;
                    share.seenInboundIds.add(frame.id);
                    try {
                        const intervention = decrypt(share.key, frame.message);
                        const name = String(intervention.name ?? '').trim().slice(0, MAX_GUEST_NAME_LENGTH);
                        const text = String(intervention.text ?? '').trim().slice(0, MAX_INTERVENTION_LENGTH);
                        if (name && text) onIntervention({name, text, targetId: intervention.targetId ?? null});
                    } catch {
                        // Not sealed with this hearing's key: ignore.
                    }
                }
            }
        } catch {
            if (share.isClosed) return;
        }
    }
}

export function createShare() {
    const share = {
        id: `${TOPIC_PREFIX}${crypto.randomBytes(TOPIC_ID_BYTES).toString('base64url')}`,
        key: crypto.randomBytes(KEY_BYTES),
        createdAt: Date.now(),
        hearingId: null,
        publishedMessageIds: new Set(),
        speakingMessageId: null,
        status: null,
        seenInboundIds: new Set(),
        isClosed: false,
        abort: new AbortController(),
    };
    shares.set(share.id, share);
    return {shareId: share.id, key: share.key.toString('base64url')};
}

export const isShareId = (value) => SHARE_ID_PATTERN.test(String(value ?? ''));

export function bindShare(shareId, hearing, onIntervention) {
    const share = shares.get(shareId);
    if (!share || share.hearingId) return false;
    share.hearingId = hearing.id;
    publish(share, {
        type: 'meta',
        hearing: {
            id: hearing.id,
            question: hearing.question,
            context: hearing.context.slice(0, MAX_SHARED_CONTEXT_LENGTH),
            memberIds: hearing.memberIds,
            rounds: hearing.rounds,
            sources: hearing.sources,
            guests: hearing.guests,
            createdAt: hearing.createdAt,
        },
        personas: [PRESIDING_JUDGE, COURT_CLERK, ...hearing.memberIds.map(findPersona)].map(toSharedPersona).filter(Boolean),
    });
    listenToGuests(share, onIntervention);
    return true;
}

/**
 * Mirrors the hearing to its guests: who is speaking, each finished message, and the status.
 */
export function syncShare(hearing) {
    for (const share of shares.values()) {
        if (share.hearingId !== hearing.id || share.isClosed) continue;
        const speaking = hearing.messages.find((message) => message.isSpeaking);
        if (speaking && speaking.id !== share.speakingMessageId) {
            share.speakingMessageId = speaking.id;
            publish(share, {type: 'speaking', personaId: speaking.personaId, round: hearing.round, isSuspended: hearing.isSuspended});
        }
        for (const message of hearing.messages) {
            if (message.isSpeaking || share.publishedMessageIds.has(message.id)) continue;
            share.publishedMessageIds.add(message.id);
            publish(share, {type: 'message', message: toSharedMessage(message)});
        }
        if (hearing.status !== share.status) {
            share.status = hearing.status;
            publish(share, {type: 'status', status: hearing.status, verdict: hearing.verdict});
        }
        if (['jugee', 'ajournee'].includes(hearing.status)) {
            share.isClosed = true;
            share.abort.abort();
        }
    }
}
