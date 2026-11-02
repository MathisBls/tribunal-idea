import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {COURT_CLERK, DEFAULT_PERSONAS, PERSONA_COLORS, PRESIDING_JUDGE} from './default-personas.mjs';

const DATA_DIR = process.env.TRIBUNAL_DATA_DIR ?? path.join(os.homedir(), '.tribunal');
const HEARINGS_DIR = path.join(DATA_DIR, 'hearings');
const CUSTOM_PERSONAS_FILE = path.join(DATA_DIR, 'personas.json');
const MAX_FIELD_LENGTH = {name: 60, role: 80, persona: 1200};

fs.mkdirSync(HEARINGS_DIR, {recursive: true});

const readJson = (file, fallback) => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return fallback;
    }
};

const writeJson = (file, value) => {
    const temporaryFile = `${file}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(value, null, 2));
    fs.renameSync(temporaryFile, file);
};

const readCustomPersonas = () => readJson(CUSTOM_PERSONAS_FILE, []);

export function listPersonas() {
    return [...DEFAULT_PERSONAS, ...readCustomPersonas()];
}

export function findPersona(id) {
    if (id === PRESIDING_JUDGE.id) return PRESIDING_JUDGE;
    if (id === COURT_CLERK.id) return COURT_CLERK;
    return listPersonas().find((persona) => persona.id === id) ?? null;
}

function sanitizePersona(input) {
    const clip = (value, max) => String(value ?? '').trim().slice(0, max);
    const persona = {
        name: clip(input.name, MAX_FIELD_LENGTH.name),
        role: clip(input.role, MAX_FIELD_LENGTH.role),
        persona: clip(input.persona, MAX_FIELD_LENGTH.persona),
        color: PERSONA_COLORS.includes(input.color) ? input.color : PERSONA_COLORS[0],
    };
    if (!persona.name || !persona.persona) throw new Error('Un nom et une description sont obligatoires');
    return persona;
}

export function savePersona(input) {
    const customPersonas = readCustomPersonas();
    const fields = sanitizePersona(input);
    const existing = input.id ? customPersonas.find((persona) => persona.id === input.id) : null;
    if (input.id && !existing) throw new Error('Seuls les personas créés par vous sont modifiables');
    const persona = existing ? Object.assign(existing, fields) : {id: `custom-${Date.now().toString(36)}`, ...fields, builtIn: false};
    if (!existing) customPersonas.push(persona);
    writeJson(CUSTOM_PERSONAS_FILE, customPersonas);
    return persona;
}

export function deletePersona(id) {
    const customPersonas = readCustomPersonas();
    const remaining = customPersonas.filter((persona) => persona.id !== id);
    if (remaining.length === customPersonas.length) return false;
    writeJson(CUSTOM_PERSONAS_FILE, remaining);
    return true;
}

const hearingFile = (id) => path.join(HEARINGS_DIR, `${id}.json`);
const isValidHearingId = (id) => /^[\w-]+$/.test(id);

export function listHearings() {
    return fs
        .readdirSync(HEARINGS_DIR)
        .filter((file) => file.endsWith('.json'))
        .map((file) => readJson(path.join(HEARINGS_DIR, file), null))
        .filter(Boolean)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveHearing(hearing) {
    writeJson(hearingFile(hearing.id), hearing);
}

export function deleteHearing(id) {
    if (!isValidHearingId(id) || !fs.existsSync(hearingFile(id))) return false;
    fs.unlinkSync(hearingFile(id));
    return true;
}
