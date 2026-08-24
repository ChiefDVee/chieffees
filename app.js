(() => {
  "use strict";

  const REFRESH_MS = 30000;
  const BLOCK_VSIZE_MAX = 1000000; // approx vbytes in a full block, used for fill %

  const API = {
    height: "https://mempool.space/api/blocks/tip/height",
    fees: "https://mempool.space/api/v1/fees/recommended",
    mempoolBlocks: "https://mempool.space/api/v1/fees/mempool-blocks",
    hashrate: "https://mempool.space/api/v1/mining/hashrate/3d",
    difficulty: "https://mempool.space/api/v1/difficulty-adjustment",
    prices: "https://mempool.space/api/v1/prices",
    blocksList: "https://mempool.space/api/v1/blocks", // one-time fetch: seeds the "waiting" label on page load
  };

  const state = {
    fees: null, // { fastestFee, halfHourFee, hourFee, economyFee, minimumFee }
    prices: null, // { EUR, USD, ... }
    nextBlock: null, // { medianFee, txCount, feeRange, fillPct } — feeds the mining scene
    hashrateEHs: null, // feeds the mining scene's hammer speed
    blockHeight: null, // feeds the mining scene's chain
  };

  const els = {
    blockHeight: document.getElementById("block-height"),
    blockHeightDot: document.getElementById("block-height-dot"),

    feeFast: document.getElementById("fee-fast"),
    feeMedium: document.getElementById("fee-medium"),
    feeSlow: document.getElementById("fee-slow"),

    nbMedian: document.getElementById("nb-median"),
    nbTxCount: document.getElementById("nb-txcount"),
    nbRange: document.getElementById("nb-range"),
    nbFillPct: document.getElementById("nb-fill-pct"),
    nbFillBar: document.getElementById("nb-fill-bar"),

    hashrateValue: document.getElementById("hashrate-value"),
    sparkline: document.getElementById("hashrate-sparkline"),

    diffRingFg: document.getElementById("diff-ring-fg"),
    diffRemainingBlocks: document.getElementById("diff-remaining-blocks"),
    diffChange: document.getElementById("diff-change"),
    diffDate: document.getElementById("diff-date"),
    diffProgress: document.getElementById("diff-progress"),

    calcSize: document.getElementById("calc-size"),
    calcTier: document.getElementById("calc-tier"),
    calcSats: document.getElementById("calc-sats"),
    calcEur: document.getElementById("calc-eur"),
    presetBtns: Array.from(document.querySelectorAll(".preset-btn")),
    lastUpdated: document.getElementById("last-updated"),
  };

  function fmtTime(d) {
    return d.toLocaleTimeString(undefined, { hour12: false });
  }

  function setDot(key, ok) {
    document.querySelectorAll(`[data-status-dot="${key}"]`).forEach((dot) => {
      dot.classList.toggle("dot-error", !ok);
    });
    if (key === "height") {
      els.blockHeightDot.classList.toggle("dot-error", !ok);
    }
  }

  function fmtInt(n) {
    return new Intl.NumberFormat("en-US").format(Math.round(n));
  }

  function fmtFee(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
    return res.json();
  }

  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
    return res.text();
  }

  // ---- Block height ----
  async function updateBlockHeight() {
    try {
      const text = await fetchText(API.height);
      const height = parseInt(text.trim(), 10);
      els.blockHeight.textContent = fmtInt(height);
      state.blockHeight = height;
      noteTipHeight(height);
      setDot("height", true);
    } catch (err) {
      console.error("[chief-fees] updateBlockHeight failed:", err);
      els.blockHeight.textContent = "—";
      setDot("height", false);
    }
  }

  // ---- Fee cards ----
  function pulseCard(tier) {
    const card = document.querySelector(`.fee-card[data-tier="${tier}"]`);
    if (!card) return;
    card.classList.remove("pulse");
    // force reflow so the animation restarts
    void card.offsetWidth;
    card.classList.add("pulse");
  }

  async function updateFees() {
    try {
      const data = await fetchJSON(API.fees);
      const prevFast = state.fees ? state.fees.fastestFee : null;
      const prevMedium = state.fees ? state.fees.halfHourFee : null;
      const prevSlow = state.fees ? state.fees.economyFee : null;

      els.feeFast.textContent = fmtFee(data.fastestFee);
      els.feeMedium.textContent = fmtFee(data.halfHourFee);
      els.feeSlow.textContent = fmtFee(data.economyFee);

      if (prevFast !== null && prevFast !== data.fastestFee) pulseCard("fast");
      if (prevMedium !== null && prevMedium !== data.halfHourFee) pulseCard("medium");
      if (prevSlow !== null && prevSlow !== data.economyFee) pulseCard("slow");

      state.fees = data;
      setDot("fees", true);
      runCalculator();
    } catch (err) {
      console.error("[chief-fees] updateFees failed:", err);
      els.feeFast.textContent = "—";
      els.feeMedium.textContent = "—";
      els.feeSlow.textContent = "—";
      setDot("fees", false);
    }
  }

  // ---- Next block ----
  async function updateNextBlock() {
    try {
      const data = await fetchJSON(API.mempoolBlocks);
      const next = Array.isArray(data) ? data[0] : null;
      if (!next) throw new Error("no mempool blocks returned");

      els.nbMedian.textContent = fmtFee(next.medianFee);

      const txCount = next.nTx ?? next.n_tx ?? null;
      els.nbTxCount.textContent = txCount !== null ? fmtInt(txCount) : "—";

      const range = Array.isArray(next.feeRange) ? next.feeRange : null;
      if (range && range.length) {
        const lo = range[0];
        const hi = range[range.length - 1];
        els.nbRange.textContent = `${fmtFee(lo)} – ${fmtFee(hi)}`;
      } else {
        els.nbRange.textContent = "—";
      }

      const vsize = next.blockVSize ?? next.blockSize ?? 0;
      const fillPct = Math.max(0, Math.min(100, (vsize / BLOCK_VSIZE_MAX) * 100));
      els.nbFillPct.textContent = `${fillPct.toFixed(1)}%`;
      els.nbFillBar.style.width = `${fillPct}%`;

      state.nextBlock = { medianFee: next.medianFee ?? null, txCount, feeRange: range, fillPct };
      setDot("nextblock", true);
    } catch (err) {
      console.error("[chief-fees] updateNextBlock failed:", err);
      els.nbMedian.textContent = "—";
      els.nbTxCount.textContent = "—";
      els.nbRange.textContent = "—";
      els.nbFillPct.textContent = "—";
      els.nbFillBar.style.width = "0%";
      setDot("nextblock", false);
    }
  }

  // ---- Hashrate ----
  function drawSparkline(canvas, values) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 1);
    const h = Math.max(rect.height || 60, 1);

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!values || values.length < 2) return;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = 4;

    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * (w - pad * 2) + pad;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return [x, y];
    });

    // filled area
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(247, 147, 26, 0.35)");
    grad.addColorStop(1, "rgba(247, 147, 26, 0)");

    ctx.beginPath();
    ctx.moveTo(points[0][0], h - pad);
    points.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(points[points.length - 1][0], h - pad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#f7931a";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // last point dot
    const [lx, ly] = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#f7931a";
    ctx.fill();
  }

  async function updateHashrate() {
    try {
      const data = await fetchJSON(API.hashrate);
      const current = data.currentHashrate;
      const ehs = current / 1e18;
      els.hashrateValue.textContent = ehs.toFixed(1);
      state.hashrateEHs = ehs;

      const series = Array.isArray(data.hashrates)
        ? data.hashrates.map((p) => p.avgHashrate / 1e18)
        : [];
      drawSparkline(els.sparkline, series);

      setDot("hashrate", true);
    } catch (err) {
      console.error("[chief-fees] updateHashrate failed:", err);
      els.hashrateValue.textContent = "—";
      setDot("hashrate", false);
    }
  }

  // ---- Difficulty adjustment ----
  const DIFF_RING_CIRCUMFERENCE = 2 * Math.PI * 52; // r=52

  function updateDifficultyRing(progressPercent) {
    const clamped = Math.max(0, Math.min(100, progressPercent));
    const offset = DIFF_RING_CIRCUMFERENCE * (1 - clamped / 100);
    els.diffRingFg.style.strokeDasharray = String(DIFF_RING_CIRCUMFERENCE);
    els.diffRingFg.style.strokeDashoffset = String(offset);
  }

  async function updateDifficulty() {
    try {
      const data = await fetchJSON(API.difficulty);

      els.diffRemainingBlocks.textContent = fmtInt(data.remainingBlocks);

      const change = data.difficultyChange;
      const sign = change > 0 ? "+" : "";
      els.diffChange.textContent = `${sign}${change.toFixed(2)}%`;
      els.diffChange.classList.remove("positive", "negative");
      els.diffChange.classList.add(change > 0 ? "positive" : "negative");
      els.diffRingFg.style.stroke = change > 0 ? "var(--red)" : "var(--accent)";

      if (data.estimatedRetargetDate) {
        const d = new Date(data.estimatedRetargetDate);
        els.diffDate.textContent = d.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } else {
        els.diffDate.textContent = "—";
      }

      const progress = data.progressPercent ?? 0;
      els.diffProgress.textContent = `${progress.toFixed(1)}%`;
      updateDifficultyRing(progress);

      setDot("difficulty", true);
    } catch (err) {
      console.error("[chief-fees] updateDifficulty failed:", err);
      els.diffRemainingBlocks.textContent = "—";
      els.diffChange.textContent = "—";
      els.diffDate.textContent = "—";
      els.diffProgress.textContent = "—";
      updateDifficultyRing(0);
      setDot("difficulty", false);
    }
  }

  // ---- Prices ----
  async function updatePrices() {
    try {
      const data = await fetchJSON(API.prices);
      state.prices = data;
      setDot("prices", true);
      runCalculator();
    } catch (err) {
      console.error("[chief-fees] updatePrices failed:", err);
      state.prices = null;
      setDot("prices", false);
      runCalculator();
    }
  }

  // ---- Calculator ----
  function runCalculator() {
    const size = parseInt(els.calcSize.value, 10);
    const tier = els.calcTier.value;

    if (!state.fees || !size || size <= 0) {
      els.calcSats.textContent = "— sats";
      els.calcEur.textContent = "— €";
      return;
    }

    const rateMap = {
      fast: state.fees.fastestFee,
      medium: state.fees.halfHourFee,
      slow: state.fees.economyFee,
    };
    const rate = rateMap[tier];
    if (rate === undefined || rate === null) {
      els.calcSats.textContent = "— sats";
      els.calcEur.textContent = "— €";
      return;
    }

    const totalSats = Math.round(rate * size);
    els.calcSats.textContent = `${fmtInt(totalSats)} sats`;

    if (state.prices && state.prices.EUR) {
      const eur = (totalSats / 1e8) * state.prices.EUR;
      els.calcEur.textContent = `${eur < 0.01 ? "<0.01" : eur.toFixed(2)} €`;
    } else {
      els.calcEur.textContent = "— €";
    }
  }

  function initCalculator() {
    els.calcSize.addEventListener("input", runCalculator);
    els.calcTier.addEventListener("change", runCalculator);

    els.presetBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        els.calcSize.value = btn.dataset.size;
        els.presetBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        runCalculator();
      });
    });
  }

  // ---- Mining scene ----
  // Everything the scene draws is derived from real API data already stored
  // in `state` by the functions above (or from the dedicated tip-height
  // poll below). Only cosmetic flourishes — particle scatter angles, idle
  // animation phase offsets — use Math.random(); queue length/composition,
  // block fill, hammer speed and the block-found event itself never do.

  const LOGICAL_W = 240;
  const LOGICAL_H = 76; // taller than the main scene band alone needs, so the
  // chain strip has real headroom below each height label — see CHAIN_Y below
  const SCENE_BAND_H = 46; // 0..46 = main scene, 46..76 = chain strip
  const GROUND_Y = 44;
  const GROUND_TEXTURE_H = SCENE_BAND_H - GROUND_Y;
  const BLOCK_GRID_COLS = 8;
  const BLOCK_GRID_ROWS = 6;
  const BLOCK_BOX = { x: 108, y: 6, w: 64, h: 36 };
  const CELL_W = BLOCK_BOX.w / BLOCK_GRID_COLS;
  const CELL_H = BLOCK_BOX.h / BLOCK_GRID_ROWS;
  const QUEUE_LANE = { xStart: 6, xEnd: 100 };
  const FIGURE_SPACING = 5.5; // wide enough that individual sprites read as people, not a solid bar
  const MINER_COUNT = 4;
  const MINER_LANE = { xStart: BLOCK_BOX.x + BLOCK_BOX.w + 10, xEnd: LOGICAL_W - 8 };
  const CHAIN_Y = 52;
  const CHAIN_ICON = 10;
  const CHAIN_SPACING = 22;
  const CHAIN_RIGHT_X = LOGICAL_W - 30; // wide margin so a 6-digit height label never clips the canvas edge
  const MAX_CHAIN = 8;
  const WALK_DURATION_MS = 900;
  const LEAVE_DURATION_MS = 500; // cosmetic walk-away-and-fade after delivery, decoupled from placement timing
  const FOUND_FLASH_MS = 180;
  const FOUND_SLIDE_MS = 420;
  const TIP_POLL_MS = 10000;
  const HASHRATE_SPEED_LO = 500; // EH/s -> slow hammer swing
  const HASHRATE_SPEED_HI = 1000; // EH/s -> frantic hammer swing
  const IDLE_BOB_PERIOD_MS = 900;
  const IMPATIENT_TAP_PERIOD_LO_MS = 700; // foot-tap cadence right as fill crosses the impatience threshold
  const IMPATIENT_TAP_PERIOD_HI_MS = 350; // foot-tap cadence once escalated (far past the threshold)
  const FILL_PCT_IMPATIENT_THRESHOLD = 95;

  // Deterministic "dirt" pattern for the ground strip, computed once at
  // script load (not per frame) — a simple integer hash, not Math.random,
  // so it's cheap and stable across the whole session.
  function groundHash(x) {
    let h = (x * 2654435761) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return h % 100;
  }
  const GROUND_PATTERN = Array.from({ length: LOGICAL_W }, (_, x) => groundHash(x) < 55);

  const scene = {
    canvas: null,
    ctx: null,
    off: null,
    offCtx: null,
    colors: null,
    capColors: [],
    reducedMotion: false,
    running: false,
    rafId: null,
    lastFrameTime: 0,
    maxQueue: 30,
    queue: [], // [{ tier: "high"|"low", walking, walkT, seed }], front = index 0
    departing: [], // [{ tier, seed, t }] cosmetic walk-off-and-fade only — never touches fillCells/mechanics
    fillCells: 0,
    fillTargetCells: 0,
    totalCells: BLOCK_GRID_COLS * BLOCK_GRID_ROWS,
    justFilledIdx: -1,
    justFilledAt: 0,
    nextPlacementAt: 0,
    hammerPhase: 0,
    lastKnownEHs: HASHRATE_SPEED_LO,
    debugHammerPeriodMs: null,
    chain: [], // real block heights, oldest first
    tipHeight: null,
    lastBlockAt: null, // wall-clock ms of the most recent real block-found event (or seeded once from /v1/blocks)
    found: null, // { startedAt, height } while a block-found sequence plays
    particles: [],
  };

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function easeOutCubic(t) {
    const c = clamp(t, 0, 1);
    return 1 - Math.pow(1 - c, 3);
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  function shadeHex(hex, percent) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const num = parseInt(m[1], 16);
    const amt = Math.round(2.55 * percent);
    const r = clamp(((num >> 16) & 0xff) + amt, 0, 255);
    const g = clamp(((num >> 8) & 0xff) + amt, 0, 255);
    const b = clamp((num & 0xff) + amt, 0, 255);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  function loadSceneColors() {
    const cs = getComputedStyle(document.documentElement);
    const pick = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    return {
      bgElevated: pick("--bg-elevated", "#121212"),
      border: pick("--border", "#242424"),
      borderSoft: pick("--border-soft", "#1c1c1c"),
      text: pick("--text", "#ededed"),
      textDim: pick("--text-dim", "#8a8a8a"),
      textFaint: pick("--text-faint", "#565656"),
      accent: pick("--accent", "#f7931a"),
      green: pick("--green", "#2ecc71"),
      red: pick("--red", "#e94e4e"),
    };
  }

  function chainSlotX(indexFromRight) {
    return CHAIN_RIGHT_X - indexFromRight * CHAIN_SPACING;
  }

  // Maps a queue position to an approximate real fee-rate by interpolating
  // across the real feeRange array from mempool-blocks (front of queue =
  // highest fee, matching real tx priority ordering) — no invented numbers.
  function feeRateForQueueIndex(i, total, feeRange) {
    if (!feeRange || feeRange.length < 2 || total <= 0) return null;
    const t = total <= 1 ? 1 : 1 - i / (total - 1);
    const idx = t * (feeRange.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const frac = idx - lo;
    return feeRange[lo] + (feeRange[hi] - feeRange[lo]) * frac;
  }

  function rebuildQueue() {
    const nb = state.nextBlock;
    const count = clamp(nb ? nb.txCount ?? 0 : 0, 0, scene.maxQueue);
    const threshold = state.fees ? state.fees.halfHourFee : null;
    const queue = [];
    for (let i = 0; i < count; i++) {
      const rate = nb && nb.feeRange ? feeRateForQueueIndex(i, count, nb.feeRange) : null;
      const tier = threshold != null && rate != null && rate >= threshold ? "high" : "low";
      // seed is fixed at creation (from the build-time loop index), not the
      // figure's current array index — stays stable as figures ahead of it
      // get shifted out, so its look doesn't flicker as the queue drains.
      queue.push({ tier, walking: false, walkT: 0, seed: i });
    }
    scene.queue = queue;
  }

  function syncSceneFromState() {
    const pct = state.nextBlock ? state.nextBlock.fillPct : null;
    if (pct != null) {
      scene.fillTargetCells = Math.round((scene.totalCells * clamp(pct, 0, 100)) / 100);
      if (scene.fillCells > scene.fillTargetCells) scene.fillCells = scene.fillTargetCells;
    }
    rebuildQueue();
    if (scene.reducedMotion) renderSceneFrame(performance.now());
  }

  function noteTipHeight(height) {
    if (!Number.isFinite(height)) return;
    if (scene.tipHeight === null) {
      scene.tipHeight = height;
      scene.chain = [height];
      if (scene.reducedMotion) renderSceneFrame(performance.now());
      return;
    }
    if (height > scene.tipHeight) {
      triggerBlockFound(height);
    }
    scene.tipHeight = height;
  }

  function triggerBlockFound(height) {
    console.debug(`[chief-fees] block found: ${height}`);
    scene.lastBlockAt = Date.now();
    scene.found = { startedAt: performance.now(), height };
    spawnFoundParticles(BLOCK_BOX.x + BLOCK_BOX.w / 2, BLOCK_BOX.y + BLOCK_BOX.h / 2);
    scene.chain.push(height);
    if (scene.chain.length > MAX_CHAIN) scene.chain.shift();
    if (scene.reducedMotion) {
      scene.found = null;
      scene.fillCells = 0;
      const pct = state.nextBlock ? state.nextBlock.fillPct : 0;
      scene.fillTargetCells = Math.round((scene.totalCells * clamp(pct ?? 0, 0, 100)) / 100);
      renderSceneFrame(performance.now());
    }
  }

  function spawnFoundParticles(cx, cy) {
    const n = 16;
    for (let i = 0; i < n; i++) {
      // cosmetic flourish only — the event itself is 100% real-data-driven
      const angle = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.4;
      const speed = 20 + Math.random() * 30;
      scene.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 400 + Math.random() * 200,
      });
    }
  }

  async function pollTipHeight() {
    try {
      const text = await fetchText(API.height);
      const height = parseInt(text.trim(), 10);
      noteTipHeight(height);
      setDot("scene", true);
    } catch (err) {
      console.error("[chief-fees] pollTipHeight failed:", err);
      setDot("scene", false);
    }
  }

  // One-time fetch (the only new network call in this pass) so the waiting
  // label reads a real elapsed time immediately on page load instead of
  // starting from 0. Never overwrites a value already set by a real
  // block-found event that beat this fetch to the punch.
  async function seedLastBlockTimestamp() {
    try {
      const blocks = await fetchJSON(API.blocksList);
      const latest = Array.isArray(blocks) ? blocks[0] : null;
      if (latest && Number.isFinite(latest.timestamp) && scene.lastBlockAt === null) {
        scene.lastBlockAt = latest.timestamp * 1000;
        if (scene.reducedMotion) renderSceneFrame(performance.now());
      }
    } catch (err) {
      console.error("[chief-fees] seedLastBlockTimestamp failed:", err);
    }
  }

  function minutesSinceLastBlock() {
    return scene.lastBlockAt === null ? null : Math.max(0, Math.floor((Date.now() - scene.lastBlockAt) / 60000));
  }

  function isImpatient() {
    return state.nextBlock ? state.nextBlock.fillPct >= FILL_PCT_IMPATIENT_THRESHOLD : false;
  }

  function impatienceLevel(mins) {
    if (!isImpatient()) return 0;
    return clamp(((mins ?? 0) - 10) / 20, 0, 1);
  }

  function placementIntervalMs(fillPct) {
    const lo = 4000;
    const hi = 400;
    const t = clamp(fillPct ?? 0, 0, 100) / 100;
    return lo + (hi - lo) * t;
  }

  function hammerPeriodMs(ehs) {
    const slow = 1400;
    const fast = 220;
    const c = clamp(ehs ?? HASHRATE_SPEED_LO, HASHRATE_SPEED_LO, HASHRATE_SPEED_HI);
    const t = (c - HASHRATE_SPEED_LO) / (HASHRATE_SPEED_HI - HASHRATE_SPEED_LO);
    return slow + (fast - slow) * t;
  }

  function updateFoundEffect(now) {
    const elapsed = now - scene.found.startedAt;
    if (elapsed >= FOUND_FLASH_MS + FOUND_SLIDE_MS) {
      scene.found = null;
      scene.fillCells = 0;
      const pct = state.nextBlock ? state.nextBlock.fillPct : 0;
      scene.fillTargetCells = Math.round((scene.totalCells * clamp(pct ?? 0, 0, 100)) / 100);
    }
  }

  function updateScene(dt, now) {
    // Hammer speed reads state.hashrateEHs live every frame (not a cached
    // snapshot) so a console override takes effect within one frame.
    if (state.hashrateEHs != null) scene.lastKnownEHs = state.hashrateEHs;
    const period = hammerPeriodMs(scene.lastKnownEHs);
    scene.debugHammerPeriodMs = period;
    scene.hammerPhase = (scene.hammerPhase + dt / period) % 1;

    if (scene.found) {
      updateFoundEffect(now);
    } else {
      if (scene.fillCells < scene.fillTargetCells && scene.queue.length > 0 && now >= scene.nextPlacementAt) {
        const front = scene.queue[0];
        if (!front.walking) {
          front.walking = true;
          front.walkT = 0;
        }
      }
      if (scene.queue.length > 0 && scene.queue[0].walking) {
        const front = scene.queue[0];
        front.walkT += dt / WALK_DURATION_MS;
        if (front.walkT >= 1) {
          // Mechanics unchanged: shift + fillCells++ + next-placement timing
          // happen at exactly the same moment as before. The push into
          // `departing` is purely cosmetic bookkeeping layered on top.
          const departed = scene.queue.shift();
          scene.fillCells = Math.min(scene.totalCells, scene.fillCells + 1);
          scene.justFilledIdx = scene.fillCells - 1;
          scene.justFilledAt = now;
          scene.departing.push({ tier: departed.tier, seed: departed.seed, t: 0 });
          scene.nextPlacementAt = now + placementIntervalMs(state.nextBlock ? state.nextBlock.fillPct : 0);
        }
      }
    }

    if (scene.departing.length) {
      scene.departing = scene.departing.filter((d) => d.t < 1);
      scene.departing.forEach((d) => {
        d.t += dt / LEAVE_DURATION_MS;
      });
    }

    if (scene.particles.length) {
      scene.particles = scene.particles.filter((p) => p.life < p.maxLife);
      scene.particles.forEach((p) => {
        p.life += dt;
        p.x += (p.vx * dt) / 1000;
        p.y += (p.vy * dt) / 1000;
      });
    }
  }

  // Small humanoid sprite, ~8 wide x 12-13 tall including cap/carried block,
  // all rect-based. `opts.legOffset` (0|1) picks between the two walk/idle
  // leg frames; `opts.headTurn` nudges head+cap 1px for the impatient tell.
  function drawHumanFrame(ctx, footX, footY, opts) {
    const fx = Math.round(footX);
    const fy = Math.round(footY);
    const headOffset = opts.headTurn ? 1 : 0;

    const leftLegH = opts.legOffset === 1 ? 3 : 4;
    const rightLegH = opts.legOffset === 1 ? 4 : 3;
    ctx.fillStyle = opts.bodyColor;
    ctx.fillRect(fx - 2, fy - leftLegH, 2, leftLegH);
    ctx.fillRect(fx, fy - rightLegH, 2, rightLegH);

    ctx.fillRect(fx - 2, fy - 8, 4, 4); // torso

    if (opts.hasBeard) {
      ctx.fillStyle = opts.beardColor;
      ctx.fillRect(fx - 1 + headOffset, fy - 8, 2, 1);
    }

    ctx.fillStyle = opts.headColor;
    ctx.fillRect(fx - 1 + headOffset, fy - 10, 3, 2);

    ctx.fillStyle = opts.capColor;
    ctx.fillRect(fx - 2 + headOffset, fy - 11, 4, 2);

    if (opts.carryColor) {
      ctx.fillStyle = opts.carryColor;
      ctx.fillRect(fx - 1, fy - 13, 2, 2); // tx block carried above the head
    }
  }

  // Deterministic per-figure look from a stable seed (fixed at creation in
  // rebuildQueue, never from Math.random) so the queue reads as a crowd of
  // distinct people rather than clones, without flickering frame to frame.
  function queueFigureTraits(seed) {
    return {
      hasBeard: seed % 3 === 0,
      capColorIdx: scene.capColors.length ? seed % scene.capColors.length : 0,
    };
  }

  function drawQueueFigure(ctx, colors, fig, x, footY, now) {
    const bodyColor = fig.tier === "high" ? colors.accent : colors.textFaint;
    const traits = queueFigureTraits(fig.seed);
    const capColor = scene.capColors[traits.capColorIdx] || colors.text;

    let legOffset = 0;
    let headTurn = false;
    let alpha = 1;
    let carryColor = bodyColor;

    if (fig.walking) {
      legOffset = Math.floor(fig.walkT * 6) % 2;
    } else if (fig.leaving) {
      legOffset = Math.floor(fig.t * 6) % 2;
      alpha = 1 - fig.t;
      carryColor = null; // already delivered its tx
    } else {
      const level = impatienceLevel(minutesSinceLastBlock());
      if (level > 0) {
        const tapPeriod = IMPATIENT_TAP_PERIOD_LO_MS - (IMPATIENT_TAP_PERIOD_LO_MS - IMPATIENT_TAP_PERIOD_HI_MS) * level;
        legOffset = Math.floor(now / tapPeriod + fig.seed * 0.5) % 2;
        headTurn = Math.floor(now / (1400 - level * 700) + fig.seed) % 5 === 0;
      } else {
        legOffset = Math.floor(now / IDLE_BOB_PERIOD_MS + fig.seed * 0.37) % 2;
      }
    }

    ctx.globalAlpha = alpha;
    drawHumanFrame(ctx, x, footY, {
      bodyColor,
      headColor: colors.text,
      beardColor: colors.textDim,
      capColor,
      hasBeard: traits.hasBeard,
      legOffset,
      headTurn,
      carryColor,
    });
    ctx.globalAlpha = 1;
  }

  function drawMinerFigure(ctx, footX, footY, colors, phase) {
    const x = Math.round(footX);
    const y = Math.round(footY);
    const down = phase >= 0.5;

    ctx.fillStyle = colors.text;
    ctx.fillRect(x - 2, y - 4, 2, 4);
    ctx.fillRect(x, y - 4, 2, 4);
    ctx.fillRect(x - 2, y - 9, 4, 5); // body
    ctx.fillRect(x - 2, y - 12, 4, 3); // helmet
    ctx.fillStyle = colors.accent;
    ctx.fillRect(x - 1, y - 12, 1, 1); // lamp

    ctx.strokeStyle = colors.textDim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 2, y - 8);
    if (down) ctx.lineTo(x + 5, y - 3);
    else ctx.lineTo(x + 5, y - 12);
    ctx.stroke();

    ctx.fillStyle = colors.textFaint;
    if (down) ctx.fillRect(x + 4, y - 4, 2, 2);
    else ctx.fillRect(x + 4, y - 13, 2, 2);

    // brief impact spark right as the pickaxe strikes, not the whole down-half
    if (phase >= 0.5 && phase < 0.58) {
      ctx.fillStyle = colors.accent;
      ctx.fillRect(x + 5, y - 2, 1, 1);
      ctx.fillRect(x + 6, y - 3, 1, 1);
    }
  }

  function drawGround(ctx, colors) {
    for (let x = 0; x < LOGICAL_W; x += 2) {
      ctx.fillStyle = GROUND_PATTERN[x] ? colors.borderSoft : colors.border;
      ctx.fillRect(x, GROUND_Y, 2, GROUND_TEXTURE_H);
    }
    ctx.strokeStyle = colors.border;
    ctx.beginPath();
    ctx.moveTo(0, SCENE_BAND_H + 0.5);
    ctx.lineTo(LOGICAL_W, SCENE_BAND_H + 0.5);
    ctx.stroke();
  }

  function drawQueue(ctx, colors, now) {
    const n = scene.queue.length;
    // Back-to-front so nearer (lower-index) figures correctly overlap the
    // ones behind them in the line instead of being painted over.
    for (let i = n - 1; i >= 0; i--) {
      const fig = scene.queue[i];
      let x;
      if (fig.walking) {
        const startX = QUEUE_LANE.xEnd;
        const endX = BLOCK_BOX.x - 2;
        x = startX + (endX - startX) * easeOutCubic(fig.walkT);
      } else {
        x = QUEUE_LANE.xEnd - i * FIGURE_SPACING;
        if (x < QUEUE_LANE.xStart) continue;
      }
      drawQueueFigure(ctx, colors, fig, x, GROUND_Y, now);
    }
  }

  function drawDeparting(ctx, colors, now) {
    scene.departing.forEach((d) => {
      const startX = BLOCK_BOX.x + BLOCK_BOX.w + 2;
      const endX = MINER_LANE.xStart - 2;
      const x = startX + (endX - startX) * easeOutCubic(d.t);
      drawQueueFigure(ctx, colors, { tier: d.tier, seed: d.seed, leaving: true, t: d.t }, x, GROUND_Y, now);
    });
  }

  function cellColor(colors, idx) {
    const variant = idx % 3;
    if (variant === 0) return shadeHex(colors.accent, -10);
    if (variant === 1) return colors.accent;
    return shadeHex(colors.accent, 12);
  }

  function drawScaffold(ctx, colors) {
    const { x, y, w, h } = BLOCK_BOX;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
    ctx.strokeStyle = colors.borderSoft;
    const struts = [
      [x - 2, y - 2, x + 2, y + 2],
      [x + w + 2, y - 2, x + w - 2, y + 2],
      [x - 2, y + h + 2, x + 2, y + h - 2],
      [x + w + 2, y + h + 2, x + w - 2, y + h - 2],
    ];
    struts.forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });
  }

  function drawBlock(ctx, colors, now) {
    if (scene.found) {
      drawFoundBlock(ctx, colors, now);
      return;
    }
    const { x, y } = BLOCK_BOX;
    drawScaffold(ctx, colors);
    for (let r = 0; r < BLOCK_GRID_ROWS; r++) {
      for (let c = 0; c < BLOCK_GRID_COLS; c++) {
        const idx = r * BLOCK_GRID_COLS + c;
        const cx = x + c * CELL_W + 1;
        const cy = y + r * CELL_H + 1;
        const cw = CELL_W - 2;
        const ch = CELL_H - 2;
        if (idx < scene.fillCells) {
          const justPlaced = idx === scene.justFilledIdx && now - scene.justFilledAt < 250;
          ctx.fillStyle = justPlaced ? colors.text : cellColor(colors, idx);
          ctx.fillRect(cx, cy, cw, ch);
        } else {
          ctx.strokeStyle = colors.borderSoft;
          ctx.strokeRect(cx + 0.5, cy + 0.5, Math.max(1, cw - 1), Math.max(1, ch - 1));
        }
      }
    }
  }

  function drawFoundBlock(ctx, colors, now) {
    const elapsed = now - scene.found.startedAt;
    const { x, y, w, h } = BLOCK_BOX;
    if (elapsed < FOUND_FLASH_MS) {
      const flashT = elapsed / FOUND_FLASH_MS;
      ctx.fillStyle = colors.text;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1 - flashT * 0.3;
      ctx.fillStyle = colors.accent;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    } else {
      const slideT = (elapsed - FOUND_FLASH_MS) / FOUND_SLIDE_MS;
      const eased = easeOutCubic(slideT);
      const targetX = chainSlotX(0);
      const targetY = CHAIN_Y;
      const curX = x + (targetX - x) * eased;
      const curY = y + (targetY - y) * eased;
      const curW = w + (CHAIN_ICON - w) * eased;
      const curH = h + (CHAIN_ICON - h) * eased;
      ctx.fillStyle = colors.accent;
      ctx.fillRect(curX, curY, Math.max(2, curW), Math.max(2, curH));
    }
  }

  function drawMiners(ctx, colors) {
    const span = MINER_LANE.xEnd - MINER_LANE.xStart;
    for (let i = 0; i < MINER_COUNT; i++) {
      const x = MINER_LANE.xStart + (span * (i + 0.5)) / MINER_COUNT;
      const phase = (scene.hammerPhase + i * 0.17) % 1;
      drawMinerFigure(ctx, x, GROUND_Y, colors, phase);
    }
  }

  function drawParticles(ctx, colors) {
    if (!scene.particles.length) return;
    ctx.fillStyle = colors.accent;
    scene.particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    });
    ctx.globalAlpha = 1;
  }

  function drawBitcoinGlyph(ctx, colors, ix, iy) {
    // ~5x7 rect-based ₿ mark, debossed into the block in the background
    // shade so it reads clearly against the orange fill at this tiny scale.
    const gx = ix + 3;
    const gy = iy + 2;
    ctx.fillStyle = colors.bgElevated;
    ctx.fillRect(gx, gy - 1, 1, 1);
    ctx.fillRect(gx, gy, 1, 5);
    ctx.fillRect(gx, gy + 5, 1, 1);
    ctx.fillRect(gx + 1, gy, 2, 2);
    ctx.fillRect(gx + 1, gy + 3, 2, 2);
  }

  function drawChainIcons(ctx, colors) {
    const n = scene.chain.length;
    for (let i = 0; i < n; i++) {
      const indexFromRight = n - 1 - i;
      const x = chainSlotX(indexFromRight);
      if (x < -CHAIN_ICON || x > LOGICAL_W) continue;
      ctx.fillStyle = colors.accent;
      ctx.fillRect(x, CHAIN_Y, CHAIN_ICON, CHAIN_ICON);
      ctx.strokeStyle = colors.bgElevated;
      ctx.strokeRect(x + 0.5, CHAIN_Y + 0.5, CHAIN_ICON - 1, CHAIN_ICON - 1);
      drawBitcoinGlyph(ctx, colors, x, CHAIN_Y);
    }
  }

  // Chain grows leftward from CHAIN_RIGHT_X (a fixed right margin); the
  // label itself is clamped to the canvas by its own measured width so a
  // 6-digit height can never fall outside the visible area, regardless of
  // canvas scale.
  function drawChainLabels(ctx, colors) {
    const n = scene.chain.length;
    if (n === 0) return;
    const scale = scene.canvas.width / LOGICAL_W;
    ctx.font = `${Math.max(9, Math.round(6 * scale))}px ui-monospace, monospace`;
    ctx.fillStyle = colors.textFaint;
    ctx.textAlign = "center";
    const labelCount = Math.min(n, 4);
    for (let k = 0; k < labelCount; k++) {
      const height = scene.chain[n - 1 - k];
      const label = String(height);
      const rawX = (chainSlotX(k) + CHAIN_ICON / 2) * scale;
      const halfW = ctx.measureText(label).width / 2 + 2;
      const x = clamp(rawX, halfW, scene.canvas.width - halfW);
      const topY = (CHAIN_Y + CHAIN_ICON + 2) * scale;
      ctx.fillText(label, x, topY);
    }
  }

  function drawWaitingLabel(ctx, colors) {
    if (scene.found) return;
    const mins = minutesSinceLastBlock();
    if (mins === null) return;
    const scale = scene.canvas.width / LOGICAL_W;
    ctx.font = `${Math.max(7, Math.round(4.2 * scale))}px ui-monospace, monospace`;
    ctx.fillStyle = colors.textDim;
    ctx.textAlign = "center";
    const label = `waiting for miner · ${mins} min since last block`;
    const rawX = (BLOCK_BOX.x + BLOCK_BOX.w / 2) * scale;
    const halfW = ctx.measureText(label).width / 2 + 2;
    const x = clamp(rawX, halfW, scene.canvas.width - halfW);
    ctx.fillText(label, x, 0);
  }

  function renderSceneFrame(now) {
    if (!scene.ctx || !scene.offCtx || !scene.colors) return;
    const octx = scene.offCtx;
    const colors = scene.colors;

    octx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    octx.fillStyle = colors.bgElevated;
    octx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    drawGround(octx, colors);
    drawQueue(octx, colors, now);
    drawBlock(octx, colors, now);
    drawDeparting(octx, colors, now);
    drawMiners(octx, colors);
    drawParticles(octx, colors);
    drawChainIcons(octx, colors);

    const ctx = scene.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, scene.canvas.width, scene.canvas.height);
    ctx.drawImage(scene.off, 0, 0, LOGICAL_W, LOGICAL_H, 0, 0, scene.canvas.width, scene.canvas.height);

    ctx.textBaseline = "top";
    drawWaitingLabel(ctx, colors);
    drawChainLabels(ctx, colors);
  }

  function sceneLoop(ts) {
    if (!scene.running) return;
    const dt = scene.lastFrameTime ? Math.min(ts - scene.lastFrameTime, 100) : 16;
    scene.lastFrameTime = ts;
    try {
      updateScene(dt, ts);
      renderSceneFrame(ts);
    } catch (err) {
      console.error("[chief-fees] scene render failed:", err);
    }
    scene.rafId = requestAnimationFrame(sceneLoop);
  }

  function startSceneLoop() {
    if (scene.running || scene.reducedMotion) return;
    scene.running = true;
    scene.lastFrameTime = 0;
    scene.rafId = requestAnimationFrame(sceneLoop);
  }

  function stopSceneLoop() {
    scene.running = false;
    if (scene.rafId) cancelAnimationFrame(scene.rafId);
    scene.rafId = null;
  }

  function resizeSceneCanvas() {
    if (!scene.canvas) return;
    const wrap = scene.canvas.parentElement;
    const cssWidth = wrap.clientWidth || 300;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssHeight = cssWidth * (LOGICAL_H / LOGICAL_W);
    scene.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    scene.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    scene.maxQueue = cssWidth < 480 ? 10 : cssWidth < 800 ? 20 : 30;
    renderSceneFrame(performance.now());
  }

  function initScene() {
    scene.canvas = document.getElementById("mining-scene");
    if (!scene.canvas) return;
    scene.ctx = scene.canvas.getContext("2d");
    scene.off = document.createElement("canvas");
    scene.off.width = LOGICAL_W;
    scene.off.height = LOGICAL_H;
    scene.offCtx = scene.off.getContext("2d");
    scene.offCtx.imageSmoothingEnabled = false;
    scene.colors = loadSceneColors();
    scene.capColors = [scene.colors.text, scene.colors.textDim, scene.colors.accent, scene.colors.green, scene.colors.red];

    const reducedMotionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
    scene.reducedMotion = reducedMotionMQ.matches;
    reducedMotionMQ.addEventListener("change", (e) => {
      scene.reducedMotion = e.matches;
      if (scene.reducedMotion) stopSceneLoop();
      else startSceneLoop();
      renderSceneFrame(performance.now());
    });

    resizeSceneCanvas();
    window.addEventListener("resize", debounce(resizeSceneCanvas, 150));

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopSceneLoop();
      } else if (!scene.reducedMotion) {
        scene.lastFrameTime = 0;
        startSceneLoop();
      }
    });

    pollTipHeight();
    setInterval(() => {
      pollTipHeight().catch((err) => console.error("[chief-fees] periodic tip-height poll failed:", err));
    }, TIP_POLL_MS);
    seedLastBlockTimestamp();

    if (!scene.reducedMotion) startSceneLoop();
    else renderSceneFrame(performance.now());
  }

  // ---- Refresh cycle ----
  async function refreshAll() {
    console.debug(`[chief-fees] refresh cycle start ${new Date().toISOString()}`);
    try {
      await Promise.allSettled([
        updateBlockHeight(),
        updateFees(),
        updateNextBlock(),
        updateHashrate(),
        updateDifficulty(),
        updatePrices(),
      ]);
      syncSceneFromState();
      const now = new Date();
      if (els.lastUpdated) {
        els.lastUpdated.textContent = fmtTime(now);
      }
      console.debug(`[chief-fees] refresh cycle complete ${now.toISOString()}`);
    } catch (err) {
      // Promise.allSettled itself never rejects, but this guards against
      // any unexpected error in the DOM update below so a single bad tick
      // can never silently stop future refreshes.
      console.error("[chief-fees] refresh cycle failed unexpectedly:", err);
    }
  }

  function init() {
    initCalculator();
    initScene();
    refreshAll();
    setInterval(() => {
      refreshAll().catch((err) => console.error("[chief-fees] periodic refresh failed:", err));
    }, REFRESH_MS);

    window.addEventListener("resize", () => {
      // redraw sparkline from last known hashrate fetch on resize
      updateHashrate();
    });

    // Debug hook for manual console testing (hashrate override, tip-height
    // decrement to force a block-found event) — see README for usage.
    window.chiefFeesDebug = { state, scene };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
