# CHIEF FEES

Static, single-page Bitcoin fees & mempool dashboard. Dark theme, Bitcoin orange
accents, no frameworks, no build step. Pure HTML/CSS/vanilla JS.

Shows:
- Live BTC block height
- A pixel-art animated mining scene (see below)
- Recommended fees (Fast / Medium / Slow, sat/vB)
- Next block projection (median fee, tx count, fill %)
- Network hashrate (EH/s) with a canvas sparkline
- Difficulty adjustment countdown with an animated progress ring
- Sat/vB fee calculator (size in vBytes × fee tier → sats + EUR)

All data comes from the public [mempool.space API](https://mempool.space/docs/api/rest).
The page refreshes every 30 seconds. If an endpoint fails, the affected section
shows `—` and a red status dot — the rest of the page keeps working.

## Live mining scene

A `<canvas>` hero section, rendered pixel-art style (low-res offscreen buffer
blitted with `imageSmoothingEnabled = false`), driven entirely by real data —
no invented numbers for the core mechanics:

- **TX queue** — figure count/composition from the real next-block tx count
  and fee range; orange = high fee, grey = low fee
- **Block under construction** — fill level from the real block fill %;
  figures walk over and place their tx at a rate proportional to that fill %
- **Miners** — hammer swing speed maps linearly from real network hashrate
  (500 EH/s = slow, 1000 EH/s = frantic, clamped)
- **Chain strip** — real block heights, appended only on a real tip-height
  increase (polled every 10s, separate from the main 30s cycle)
- **Block found** — flash + particle burst + slide-to-chain sequence, fires
  only when the polled tip height actually increases; never simulated

Respects `prefers-reduced-motion` (renders a static frame, no rAF loop) and
pauses the animation loop when the tab is hidden. Only cosmetic flourishes
(particle scatter angles, idle timing) use `Math.random()` — never the queue
composition, fill level, hammer speed, or the block-found event itself.

**Manual testing hook:** `window.chiefFeesDebug = { state, scene }` is
exposed in the browser console for local testing —
`chiefFeesDebug.state.hashrateEHs = 1000` forces frantic hammers instantly,
`chiefFeesDebug.scene.tipHeight -= 1` forces the next real 10s poll to look
like a new block was found.

## Files

- `index.html` — markup / structure
- `style.css` — all styling (CSS variables, responsive, monospace numerics)
- `app.js` — vanilla JS: fetches, rendering, calculator logic, sparkline
  canvas, and the mining scene engine

No dependencies, no `npm install`, no build tooling of any kind.

## Local preview

Open `index.html` directly in a browser, or serve the folder with any static
server, e.g.:

```zsh
/usr/bin/python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploying to GitHub Pages

1. Push this folder as the root of its own repository (already done for
   `ChiefDVee/chieffees`).
2. In the repo settings → **Pages**, set:
   - Source: `Deploy from a branch`
   - Branch: `main`, folder: `/ (root)`
3. GitHub Pages serves static sites from **public** repositories for free —
   the repo must be public for Pages to be available at no cost.
4. The site will be live at `https://chiefdvee.github.io/chieffees/` a minute
   or two after enabling Pages.

No CI, no secrets, no server-side code — it's just three static files calling
a public API directly from the browser.
