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
  };

  const state = {
    fees: null, // { fastestFee, halfHourFee, hourFee, economyFee, minimumFee }
    prices: null, // { EUR, USD, ... }
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
    refreshAll();
    setInterval(() => {
      refreshAll().catch((err) => console.error("[chief-fees] periodic refresh failed:", err));
    }, REFRESH_MS);

    window.addEventListener("resize", () => {
      // redraw sparkline from last known hashrate fetch on resize
      updateHashrate();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
