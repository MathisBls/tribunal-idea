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
 * Encrypted channel of a shared hearing: the host publishes on the hearing topic, guests answer on its inbound topic.
 * Every event is end-to-end encrypted with the key of the invite link, so the relay only sees opaque messages.
 */
export function openRelay({shareId, key}) {
    const keyPromise = importKey(key);
    const sources = [];

    const listen = (topic, onEvent) => {
        const seenIds = new Set();
        const source = new EventSource(`${RELAY_URL}/${topic}/sse?since=all`);
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
        sources.push(source);
    };

    const post = async (topic, event) => {
        const response = await fetch(`${RELAY_URL}/${topic}`, {method: 'POST', body: await seal(await keyPromise, event)});
        if (!response.ok) throw new Error("Impossible de joindre l'audience partagée");
    };

    return {
        onHearingEvent: (onEvent) => listen(shareId, onEvent),
        onGuestEvent: (onEvent) => listen(`${shareId}-in`, onEvent),
        publishToGuests: (event) => post(shareId, event),
        publishToHost: (event) => post(`${shareId}-in`, event),
        close: () => sources.forEach((source) => source.close()),
    };
}
