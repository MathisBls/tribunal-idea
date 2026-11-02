import {runClaudeTurn} from './claude-cli.mjs';
import {COURT_CLERK, PRESIDING_JUDGE} from './default-personas.mjs';
import {findPersona, saveHearing} from './store.mjs';

export const ALLOWED_MODELS = ['sonnet', 'opus', 'haiku'];
export const MIN_SEATS = 2;
export const MAX_SEATS = 8;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 3;
const STREAM_EMIT_INTERVAL_MS = 120;

const SHARED_RULES = `Tu participes à une audience d'un tribunal fictif qui aide à trancher une question en confrontant plusieurs points de vue.
Règles : français oral et direct, 2 ou 3 phrases courtes, 70 mots maximum, pas de markdown, pas de liste. Désigne les autres membres par leur nom tel qu'il apparaît dans le débat. Réagis à leurs arguments quand c'est pertinent et sois concret (exemple, risque, coût, délai). Ne te présente pas, ne répète pas ce qui a été dit, ne parle que pour toi.`;

const VERDICT_INSTRUCTION = `Rends maintenant le verdict de l'audience. Format strict, en texte simple, sans markdown :
DÉCISION : une phrase claire.
POURQUOI : 2 ou 3 phrases qui pèsent les arguments entendus en citant les membres.
À FAIRE : les actions concrètes, séparées par des points-virgules, pour la personne qui a saisi le tribunal ou pour de vraies équipes ; jamais pour un membre du tribunal, qui est fictif.
RÉSERVE : le risque principal à surveiller, ou « aucune ».`;

const CLERK_RULES = `Tu es le greffier d'un tribunal fictif qui aide à trancher une question.
Avec les outils fournis, uniquement en lecture, rassemble les faits utiles : éléments cités dans la question (tickets, pull requests, pages), puis ce que tu retrouves par recherche si c'est pertinent. Ne modifie jamais rien et n'invente rien.
N'écris rien pendant tes recherches. À la fin, rends un dossier factuel en texte simple, sans markdown, 200 mots maximum, en citant les références (clé de ticket, numéro de PR, titre de page). Si tu ne trouves rien d'utile, dis-le en une phrase.`;

const MAX_GUESTS = 8;
const MAX_GUEST_NAME_LENGTH = 40;

const sanitizeGuests = (guests) =>
    [...new Set((Array.isArray(guests) ? guests : []).map((guest) => String(guest?.name ?? '').trim().slice(0, MAX_GUEST_NAME_LENGTH)).filter(Boolean))]
        .slice(0, MAX_GUESTS)
        .map((name) => ({name}));

const clampNumber = (value, min, max, fallback) => {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

function buildTranscript(hearing) {
    return hearing.messages
        .filter((message) => message.text && message.kind !== 'erreur')
        .map((message) => `${findPersona(message.personaId)?.name ?? '?'} : ${message.text}`)
        .join('\n\n');
}

function buildPrompt(hearing, instruction) {
    const transcript = buildTranscript(hearing);
    return [
        `Question soumise au tribunal : ${hearing.question}`,
        hearing.context ? `Contexte fourni :\n${hearing.context}` : '',
        `Membres présents : ${hearing.memberIds.map((id) => findPersona(id)?.name).filter(Boolean).join(', ')}.`,
        transcript ? `Débat jusqu'ici :\n${transcript}` : '',
        instruction,
    ]
        .filter(Boolean)
        .join('\n\n');
}

export function createEngine(onUpdate) {
    let running = null;

    const persist = (hearing) => {
        saveHearing(hearing);
        onUpdate(hearing);
    };

    async function speak(hearing, personaId, instruction, kind, {systemPrompt, allowedTools} = {}) {
        const persona = findPersona(personaId);
        const message = {id: String(hearing.messages.length), personaId, kind, text: '', isSpeaking: true, at: new Date().toISOString()};
        hearing.messages.push(message);
        hearing.speakerId = personaId;
        persist(hearing);
        let lastEmit = 0;
        try {
            message.text = await runClaudeTurn({
                systemPrompt: systemPrompt ?? `${SHARED_RULES}\n\nTon rôle : ${persona.name} (${persona.role}). ${persona.persona}`,
                allowedTools,
                prompt: buildPrompt(hearing, instruction),
                model: hearing.model,
                onDelta: (partial) => {
                    message.text = partial;
                    const now = Date.now();
                    if (now - lastEmit > STREAM_EMIT_INTERVAL_MS) {
                        lastEmit = now;
                        onUpdate(hearing);
                    }
                },
            });
        } catch (error) {
            message.text = error.message;
            message.kind = 'erreur';
        }
        message.isSpeaking = false;
        persist(hearing);
    }

    async function hold(hearing) {
        running = hearing;
        try {
            if (hearing.allowedTools.length > 0) {
                await speak(hearing, COURT_CLERK.id, 'Constitue le dossier de cette affaire.', 'dossier', {systemPrompt: CLERK_RULES, allowedTools: hearing.allowedTools});
                if (hearing.status === 'ajournee') return;
            }
            await speak(hearing, PRESIDING_JUDGE.id, "Ouvre l'audience.", 'ouverture');
            for (let round = 1; round <= hearing.rounds; round++) {
                hearing.round = round;
                for (const personaId of hearing.memberIds) {
                    if (hearing.status === 'ajournee') return;
                    const instruction =
                        round === 1
                            ? 'Donne ta position sur la question et ce que tu recommandes.'
                            : 'Nouveau tour : réponds aux arguments des autres, dis avec qui tu es d’accord ou non, et si tu changes d’avis.';
                    await speak(hearing, personaId, instruction, 'plaidoirie');
                }
            }
            if (hearing.status === 'ajournee') return;
            hearing.status = 'deliberation';
            persist(hearing);
            await speak(hearing, PRESIDING_JUDGE.id, VERDICT_INSTRUCTION, 'verdict');
            hearing.verdict = hearing.messages.at(-1)?.kind === 'verdict' ? hearing.messages.at(-1).text : null;
            hearing.status = hearing.verdict ? 'jugee' : 'ajournee';
        } finally {
            hearing.speakerId = null;
            if (hearing.status !== 'jugee') hearing.status = 'ajournee';
            running = null;
            persist(hearing);
        }
    }

    return {
        isRunning: () => Boolean(running),
        open({question, context, memberIds, model, rounds, sources, guests}, availableSources = []) {
            if (running) throw new Error('Une audience est déjà en cours');
            const cleanQuestion = String(question ?? '').trim().slice(0, 2000);
            if (!cleanQuestion) throw new Error('Posez la question à trancher');
            const seats = [...new Set(Array.isArray(memberIds) ? memberIds : [])].filter((id) => id !== PRESIDING_JUDGE.id && findPersona(id));
            if (seats.length < MIN_SEATS || seats.length > MAX_SEATS) throw new Error(`Choisissez entre ${MIN_SEATS} et ${MAX_SEATS} membres`);
            const requestedSources = new Set(Array.isArray(sources) ? sources : []);
            const chosenSources = availableSources.filter((source) => requestedSources.has(source.name) && source.readTools.length > 0);
            const hearing = {
                id: new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14),
                question: cleanQuestion,
                context: String(context ?? '').trim().slice(0, 6000),
                memberIds: seats,
                model: ALLOWED_MODELS.includes(model) ? model : ALLOWED_MODELS[0],
                rounds: clampNumber(rounds, MIN_ROUNDS, MAX_ROUNDS, 2),
                sources: chosenSources.map((source) => source.name),
                guests: sanitizeGuests(guests),
                allowedTools: chosenSources.flatMap((source) => source.readTools),
                status: 'en_cours',
                round: 0,
                speakerId: null,
                messages: [],
                verdict: null,
                createdAt: new Date().toISOString(),
            };
            persist(hearing);
            hold(hearing);
            return hearing;
        },
        adjourn(id) {
            if (!running || running.id !== id) return false;
            running.status = 'ajournee';
            onUpdate(running);
            return true;
        },
        isRunningHearing: (id) => running?.id === id,
    };
}
