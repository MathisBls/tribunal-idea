const ROOM_PARAM = 'room';
const HEARING_PARAM = 'hearing';
const ROOM_STORAGE_PREFIX = 'tribunal.room.';
const LAST_SETUP_KEY = 'tribunal.lastSetup';

const readParam = (name) => new URLSearchParams(window.location.search).get(name);

/**
 * Keeps the current room or hearing in the address, so a refresh lands back in the same place.
 */
function writeParams(params) {
    const search = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) if (value) search.set(name, value);
    const query = search.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

export const readHearingIdFromUrl = () => readParam(HEARING_PARAM);
export const showHearingInUrl = (hearingId) => writeParams({[HEARING_PARAM]: hearingId});
export const showRoomInUrl = (roomId) => writeParams({[ROOM_PARAM]: roomId});

export function loadRoomFromUrl() {
    const roomId = readParam(ROOM_PARAM);
    if (!roomId) return null;
    try {
        return JSON.parse(localStorage.getItem(ROOM_STORAGE_PREFIX + roomId) ?? 'null');
    } catch {
        return null;
    }
}

/**
 * Seats, sources, model and rounds of the last room, reused when a new room is opened.
 */
export function readLastSetup() {
    try {
        return JSON.parse(localStorage.getItem(LAST_SETUP_KEY) ?? '{}');
    } catch {
        return {};
    }
}

export function saveRoom(roomId, room) {
    try {
        localStorage.setItem(ROOM_STORAGE_PREFIX + roomId, JSON.stringify(room));
        const {seats, selectedSources, model, rounds} = room.draft;
        localStorage.setItem(LAST_SETUP_KEY, JSON.stringify({seats, selectedSources, model, rounds}));
    } catch {
        // The room still works, it just will not survive a refresh.
    }
}

export function forgetRoom(roomId) {
    try {
        localStorage.removeItem(ROOM_STORAGE_PREFIX + roomId);
    } catch {
        // Nothing to clean up.
    }
}
