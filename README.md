# CHIEF FEES

Static, single-page Bitcoin fees & mempool dashboard. Dark theme, Bitcoin orange
accents, no frameworks, no build step. Pure HTML/CSS/vanilla JS.

Shows:
- Live BTC block height
- Recommended fees (Fast / Medium / Slow, sat/vB)
- Next block projection (median fee, tx count, fill %)
- Network hashrate (EH/s) with a canvas sparkline
- Difficulty adjustment countdown with an animated progress ring
- Sat/vB fee calculator (size in vBytes × fee tier → sats + EUR)

All data comes from the public [mempool.space API](https://mempool.space/docs/api/rest).
The page refreshes every 30 seconds. If an endpoint fails, the affected section
shows `—` and a red status dot — the rest of the page keeps working.

## Files

- `index.html` — markup / structure
- `style.css` — all styling (CSS variables, responsive, monospace numerics)
- `app.js` — vanilla JS: fetches, rendering, calculator logic, sparkline canvas

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
