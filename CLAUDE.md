# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Battleground: a web app for friends where you type two fighters, Claude's API judges who wins, and OpenAI's image API draws both fighters. Saved fighters go in a localStorage "BattleDex".

- `project-brief.md`: scope and product decisions.
- `project-build.md`: the staged build plan. **Work happens one stage at a time.** Each stage has a **Done when** check that must pass before the next stage starts. Check which stage the code is at before adding anything, and don't build ahead of the current stage.
- If the two docs disagree, `project-build.md` wins. For example, the brief still allows draws, but the build plan removed them: the judge always names exactly one winner.

## Running locally

```
npm install   # first time only
vercel dev
```

This serves the static page and the `api/` serverless functions together on localhost. Everything is built and tested locally. **Do not deploy to Vercel** during the build plan.

`package.json` only lists server dependencies and sets `"type": "module"` (the `api/` code uses `import`/`export`). There is no build step, linter or test suite. Testing is manual: use the browser, and call the API endpoints directly with curl (`curl -X POST localhost:3000/api/fight -H 'Content-Type: application/json' -d '{"fighter1":"cat","fighter2":"dog"}'`). Secrets (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) live in `.env`, which is gitignored.

## Architecture

**Frontend:** plain HTML, CSS and JS, with no framework. These are `index.html`, `style.css` and `app.js` at the repo root.
- **Views:** the page has separate views (`[data-view]` sections: form, loading, result, error). `showView(name)` in `app.js` toggles the `hidden` attribute so exactly one view is ever visible. New screens, such as the BattleDex, follow this same pattern.
- **Input checks:** fighter names are trimmed, can't be empty, and max out at 100 characters. The server repeats these checks.

**Backend:** Vercel serverless functions in `api/`.
- **Endpoints:** every file in `api/` becomes an endpoint, except files and folders starting with `_`. Shared code goes in `api/_lib/`.
- **Judge prompt:** `api/_lib/judge-prompt.js` exports the judge's system prompt and `buildJudgeMessage()`. That function wraps the fighter names in `<fighter_1>`/`<fighter_2>` tags, and the prompt treats whatever is inside them as names, never as instructions.
- **Judging rules:** the judge must always pick one winner (even for identical matchups), give 2–4 sentences of logical but comedic reasoning, and mention only the two fighters.
- **Reply shape:** the system prompt deliberately has no JSON formatting instructions. In `api/fight.js`, a zod schema passed to Claude's native structured outputs (`client.beta.messages.parse` + `betaZodOutputFormat`) sets the `{ winner, reasoning }` shape. The server then checks that `winner` matches one of the two names entered, and returns the name as the user typed it.
- **Endpoints:** `api/fight.js` (the verdict; the build plan calls it `/api/verdict`) and, later, `api/image.js` (OpenAI). Images come back as **base64**, never URLs, so the client can compress them on a canvas before saving them.

**Storage:** the BattleDex is a single versioned localStorage key, `{ version: 1, fighters: [{ id, name, nameKey, image, createdAt }] }`.
- `nameKey` is the name lowercased with extra spaces trimmed. It is used to reuse saved art instead of calling the image API again.

**No rate limiting, on purpose.** The project dropped Upstash Redis to match the tutorial's simpler setup. Don't add rate limiting or another external service unless asked. Before any public deploy, flag that the endpoints are open and can run up API costs.
