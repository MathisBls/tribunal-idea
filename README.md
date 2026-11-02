# Tribunal

Soumets une question à un tribunal de personas IA : chacun plaide selon son point de vue, puis le président rend un verdict structuré (décision, raisons, actions, réserve).

Chaque audience tourne sur **ton propre Claude Code**, donc sur ton abonnement et ton quota. Aucune clé n'est stockée par l'app.

## Prérequis

- Node.js 20+
- [Claude Code](https://docs.claude.com/claude-code) installé et connecté :

```bash
npm install -g @anthropic-ai/claude-code
claude
```

Dans Claude Code, tape `/login` puis quitte. Une variable `ANTHROPIC_API_KEY` marche aussi.

## Lancer

```bash
npm install
npm run dev
```

Ouvre http://localhost:5280.

Pour une version compilée : `npm run build`, puis `npm start` (sert `dist/` sur http://localhost:5281).

## Utilisation

1. Écris la question et, si besoin, du contexte.
2. Choisis le nombre de sièges (2 à 8) avec le stepper.
3. Glisse des personas de la bibliothèque vers les sièges, ou clique dessus. Tu peux glisser un siège sur un autre pour les échanger, ou le renvoyer dans la bibliothèque pour le libérer.
4. **+ Nouveau persona** pour créer tes propres membres (nom, rôle, point de vue, couleur).
5. Choisis le modèle et le nombre de tours, puis ouvre l'audience.

Les audiences et les personas créés sont stockés en local dans `data/` (ignoré par git).

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `CLAUDE_PATH` | Chemin du binaire `claude` s'il n'est pas dans le PATH |
| `TRIBUNAL_API_PORT` | Port de l'API (défaut 5281) |

L'API écoute uniquement sur `127.0.0.1`.
