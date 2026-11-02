const RELAY_URL = 'https://ntfy.sh';
const IV_BYTES = 12;
const JOIN_PATH_PATTERN = /^\/join\/(tribunal-[A-Za-z0-9_-]{20})$/;

const fromBase64Url = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')), (character) => character.charCodeAt(0));

const toBase64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const buildInviteLink = ({shareId, key}) => `${window.location.origin}/join/${shareId}#${key}`;

export function readInvite(location) {
    const match = location.pathname.match(JOIN_PATH_PATTERN);
    const key = location.hash.slice(1);
    return match && key ? {shareId: match[1], key} : null;
}

const importKey = (key) => crypto.subtle.importKey('raw', fromBase64Url(key), 'AES-GCM', false, ['encrypt', 'decrypt']);

async function open(cryptoKey, sealed) {
    const bytes = fromBase64Url(sealed);
    const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES)}, cryptoKey, bytes.slice(IV_BYTES));
    return JSON.parse(new TextDecoder().decode(plain));
}

async function seal(cryptoKey, payload) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const body = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, cryptoKey, new TextEncoder().encode(JSON.stringify(payload))));
    const sealed = new Uint8Array(iv.length + body.length);
    sealed.set(iv);
    sealed.set(body, iv.length);
    return toBase64Url(sealed);
}

/**
 * Follows a shared hearing through the relay: every event is end-to-end encrypted with the key of the invite link.
 */
export function joinHearing({shareId, key}, onEvent) {
    const keyPromise = importKey(key);
    const seenIds = new Set();
    const source = new EventSource(`${RELAY_URL}/${shareId}/sse?since=all`);
    source.onmessage = async (frameEvent) => {
        try {
            const frame = JSON.parse(frameEvent.data);
            if (frame.event !== 'message' || seenIds.has(frame.id)) return;
            seenIds.add(frame.id);
            onEvent(await open(await keyPromise, frame.message));
        } catch {
            // Frames sealed with another key are not part of this hearing.
        }
    };
    return {
        intervene: async ({name, text, targetId}) => {
            const response = await fetch(`${RELAY_URL}/${shareId}-in`, {method: 'POST', body: await seal(await keyPromise, {name, text, targetId})});
            if (!response.ok) throw new Error("Impossible d'envoyer l'intervention");
        },
        leave: () => source.close(),
    };
}
