# Battleground — Project Brief
## 1. What are we actually building? (Scope)

A web app where you type in two fighters and get an AI generated verdict on who'd win, plus AI generated character art for both.

**Audience**: friends, not the general public.

## 2. What's the smallest, simplest version worth shipping (MVP)?

Two text inputs, a Fight button, a working verdict with art, a loading state while we wait on the API, and a basic BattleDex saved to localStorage. Type two fighters, get a real result, save the fighters if you want.

## 3. What are we building this with (tech stack)?

HTML, CSS, and vanilla JS for the frontend. Vercel for hosting and serverless functions. Claude's API for the verdict. OpenAI's image API for the character art. localStorage for saving BattleDex.

## 4. What's the long-term vision, beyond just the MVP?

I would eventually like a real backend where BattleDex characters sync across devices instead of just living in localStorage. I'd also want a quick re-fight option using characters already saved in the BattleDex, instead of typing two new ones every time.

## 5. Details decided so far

- **Verdict format**: a winner card with an animation, plus written reasoning for the win.
- **Draws**: allowed. The verdict can be a draw, and the card and animation need a draw state.
- **Tone**: comedic and fun, not crass.
- **Character art**: one image per fighter. Group inputs still get one image per side, so "10 cows vs 10 lions" is 2 images, not 20.
- **BattleDex stores fighters, not fights**: each saved entry is a fighter (name + image), so it can be re-used for re-fights later.
- **Saved fighters keep their art**: if a fighter is already in the BattleDex, its saved image is reused instead of generating a new one.
- **Image storage**: images are downsized and compressed on the client (canvas resize + JPEG/WebP quality) before saving to localStorage, so they stay under the browser storage quota.
- **Rate limiting**: 5 requests per minute per IP. Will be added later in the project.
- **Budget**: no fixed ceiling for now.
