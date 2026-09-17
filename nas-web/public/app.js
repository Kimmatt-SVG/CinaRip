const statusEl = document.getElementById("status");

function showStatus(message, { error = false, kind = "notice" } = {}) {
  if (!statusEl) return;
  const text = String(message || "").trim();
  if (!text) {
    hideStatus();
    return;
  }
  statusEl.textContent = text;
  statusEl.hidden = false;
  statusEl.classList.toggle("is-error", Boolean(error));
  statusEl.dataset.kind = kind;
}

function hideStatus() {
  if (!statusEl) return;
  statusEl.textContent = "";
  statusEl.hidden = true;
  statusEl.classList.remove("is-error");
  delete statusEl.dataset.kind;
}

const summaryEl = document.getElementById("library-summary");
const storageLabel = document.getElementById("storage-label");
const storageBar = document.getElementById("storage-bar");
const storageMeter = document.getElementById("storage-meter");
const libraryList = document.getElementById("library-list");
const filterInput = document.getElementById("filter");
const viewLibrary = document.getElementById("view-library");
const viewSearch = document.getElementById("view-search");
const viewShow = document.getElementById("view-show");
const viewFreezer = document.getElementById("view-freezer");
const viewSettings = document.getElementById("view-settings");
const viewStage = document.querySelector(".view-stage");
const tabViewOrder = [viewLibrary, viewSearch, viewFreezer, viewSettings].filter(Boolean);
const VIEW_SWITCH_MS = 340;
const VIEW_SLIDE_PX = 28;
let activeViewEl = null;
let viewSwitchGen = 0;
const tabLibrary = document.getElementById("tab-library");
const tabSearch = document.getElementById("tab-search");
const tabFreezer = document.getElementById("tab-freezer");
const tabSettings = document.getElementById("tab-settings");
const freezerList = document.getElementById("freezer-list");
const freezerFilter = document.getElementById("freezer-filter");
const freezerSummary = document.getElementById("freezer-summary");
const freezerFailed = document.getElementById("freezer-failed");
const showPoster = document.getElementById("show-poster");
const showTitle = document.getElementById("show-title");
const showMeta = document.getElementById("show-meta");
const episodeList = document.getElementById("episode-list");
const showFreezerAction = document.getElementById("show-freezer-action");
const playerDialog = document.getElementById("player-dialog");
const player = document.getElementById("player");
const playerTitle = document.getElementById("player-title");
const searchList = document.getElementById("search-list");
const searchStatus = document.getElementById("search-status");
const accountLabel = document.getElementById("account-label");
const jobCard = document.getElementById("job-card");
const jobTitle = document.getElementById("job-title");
const jobLabel = document.getElementById("job-label");
const jobBar = document.getElementById("job-bar");
const jobMeter = document.getElementById("job-meter");
const jobPhase = document.getElementById("job-phase");
const catalogResultsHead = document.getElementById("catalog-results-head");
const catalogResultsSummary = document.getElementById("catalog-results-summary");
const catalogDetail = document.getElementById("catalog-detail");
const catalogDetailPoster = document.getElementById("catalog-detail-poster");
const catalogDetailTitle = document.getElementById("catalog-detail-title");
const catalogDetailYear = document.getElementById("catalog-detail-year");
const catalogDetailStatus = document.getElementById("catalog-detail-status");
const catalogTvPanel = document.getElementById("catalog-tv-panel");
const catalogTvSeasonSelect = document.getElementById("catalog-tv-season-select");
const catalogTvEpisodeSelect = document.getElementById("catalog-tv-episode-select");
const catalogTvEpisodeSummary = document.getElementById("catalog-tv-episode-summary");
const catalogTvEpisodeList = document.getElementById("catalog-tv-episode-list");
const catalogAddQueue = document.getElementById("catalog-add-queue");
const downloadQueueSummary = document.getElementById("download-queue-summary");
const downloadQueueList = document.getElementById("download-queue-list");
const downloadQueueSection = document.getElementById("download-queue-section");
const queueMeter = document.getElementById("queue-meter");
const queueBar = document.getElementById("queue-bar");
const startDownloadQueueButton = document.getElementById("start-download-queue");
const stopDownloadQueueButton = document.getElementById("stop-download-queue");
const clearDownloadQueueButton = document.getElementById("clear-download-queue");

let library = { movies: [], shows: [] };
let searchResults = [];
let searchCounts = null;
let selectedCatalogMovie = null;
let catalogTvSeasonOptions = [];
let catalogTvEpisodeOptions = [];
let tvShowPlan = null;
let catalogTvScanToken = 0;
let lastQueueSnapshot = { items: [], counts: {}, running: false };
let lastDoneCount = 0;
let lastQueueRunning = null;
const heardFailedIds = new Set();
let playedQueueFinish = false;
let lastRouteKey = null;
let lastTornadoStatus = null;
let lastHealth = null;
let shellMotionDone = false;
let jobCardVisible = false;
const seenQueueIds = new Set();
const motionSig = Object.create(null);
const reduceMotionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
const splashEl = document.getElementById("splash");
const splashLabelEl = document.getElementById("splash-label");
const splashReadyBtn = document.getElementById("splash-ready");
const SPLASH_MIN_MS = 750;
const SPLASH_SESSION_KEY = "cinarip.splash.dismissed";
let splashDismissed = false;
let siteAuth = { loggedIn: false, configured: false };

function splashDismissedThisSession() {
  try {
    return sessionStorage.getItem(SPLASH_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberSplashDismissed() {
  splashDismissed = true;
  try {
    sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}

function canMotion() {
  return typeof window.anime === "function" && !reduceMotionMq.matches;
}

function markMotionReady() {
  document.documentElement.classList.add("motion-ready");
}

function motionTargets(targets) {
  if (!targets) return [];
  if (targets.nodeType === 1) return [targets];
  return Array.from(targets).filter((el) => el && el.nodeType === 1);
}

function clearMotionStyles(el) {
  el.style.removeProperty("opacity");
  el.style.removeProperty("transform");
  el.style.removeProperty("will-change");
}

function motionFade(targets, options = {}) {
  const list = motionTargets(targets);
  if (!list.length) {
    options.complete?.();
    return;
  }
  if (!canMotion()) {
    list.forEach(clearMotionStyles);
    options.complete?.();
    return;
  }
  const from = { opacity: 0, translateY: options.fromY ?? 14 };
  if (options.scaleFrom != null) from.scale = options.scaleFrom;
  window.anime.set(list, from);
  list.forEach((el) => {
    el.style.willChange = "transform, opacity";
  });
  const props = {
    targets: list,
    opacity: 1,
    translateY: 0,
    duration: options.duration ?? 420,
    delay: options.delay ?? 0,
    easing: options.easing || "easeOutCubic",
    complete() {
      list.forEach(clearMotionStyles);
      options.complete?.();
    }
  };
  if (options.scaleFrom != null) props.scale = 1;
  window.anime(props);
}

const meterStates = new WeakMap();

function meterTone(percent) {
  if (percent >= 92) return "critical";
  if (percent >= 78) return "warn";
  return "";
}

function setMeterTone(meter, tone) {
  if (!meter) return;
  meter.classList.toggle("is-warn", tone === "warn");
  meter.classList.toggle("is-critical", tone === "critical");
}

function animateMeterFill(fill, percent, options = {}) {
  if (!fill) return;
  const next = Math.max(0, Math.min(100, Number(percent) || 0));
  let state = meterStates.get(fill);
  if (!state) {
    state = { value: next };
    meterStates.set(fill, state);
  }
  const prev = state.value;
  if (Math.abs(prev - next) < 0.4 && fill.style.width) {
    fill.style.width = `${next}%`;
    state.value = next;
    return;
  }
  if (!canMotion() || options.immediate) {
    if (typeof window.anime === "function") window.anime.remove(state);
    state.value = next;
    fill.style.width = `${next}%`;
    return;
  }
  window.anime.remove(state);
  window.anime({
    targets: state,
    value: next,
    duration: options.duration ?? 720,
    easing: options.easing || "easeOutCubic",
    update() {
      fill.style.width = `${state.value.toFixed(2)}%`;
    },
    complete() {
      state.value = next;
      fill.style.width = `${next}%`;
    }
  });
}

function animateCountLabel(el, nextValue, suffix) {
  if (!el) return;
  const next = Math.max(0, Number(nextValue) || 0);
  const key = "_count";
  const state = el[key] || { value: next };
  el[key] = state;
  const render = (value) => {
    el.textContent = `${Math.round(value)}${suffix || ""}`;
  };
  if (!canMotion() || Math.abs(state.value - next) < 0.5) {
    state.value = next;
    render(next);
    return;
  }
  window.anime.remove(state);
  window.anime({
    targets: state,
    value: next,
    round: 1,
    duration: 640,
    easing: "easeOutCubic",
    update() {
      render(state.value);
    }
  });
}

function motionStagger(nodes, options = {}) {
  const list = motionTargets(nodes);
  const key = options.key || "cards";
  const sig = list.length
    ? `${list.length}:${list.map((el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24)).join("~")}`.slice(0, 400)
    : "empty";
  if (!options.force && motionSig[key] === sig) return false;
  motionSig[key] = sig;
  if (options.skip || !list.length) {
    options.onReady?.(list);
    return true;
  }
  motionFade(list, {
    fromY: options.fromY ?? 16,
    duration: options.duration ?? 400,
    delay: (_, i) => Math.min(i * (options.stagger ?? 24), 360),
    complete() {
      options.onReady?.(list);
    }
  });
  return true;
}

const TILE_TILT_MAX = 8;
const TILE_TILT_SCALE = 1.03;
const TILE_TILT_Z = 14;
let activeTiltCard = null;
let tiltRaf = 0;
let pendingTilt = null;

function tileFace(card) {
  if (!card) return null;
  if (card.classList.contains("catalog-card")) return card.querySelector(".catalog-card-poster");
  return card.querySelector(".poster");
}

function tileFloatWrap(card) {
  if (!card) return null;
  return card.querySelector(":scope > .tile-scene > .tile-float-wrap") || card.querySelector(".tile-float-wrap");
}

function ensureTileScene(card) {
  const existing = tileFloatWrap(card);
  if (existing) return existing;
  const face = tileFace(card);
  if (!face) return null;
  const scene = document.createElement("div");
  scene.className = "tile-scene";
  const wrap = document.createElement("div");
  wrap.className = "tile-float-wrap";
  face.replaceWith(scene);
  wrap.appendChild(face);
  scene.appendChild(wrap);
  return wrap;
}

function closestTile(node) {
  const card = node?.closest?.(".library-card, .catalog-card");
  if (!card) return null;
  if (card.closest("#catalog-detail, #view-show, .show-hero")) return null;
  return card;
}

function splashBlocksTiles() {
  return Boolean(splashEl && !splashEl.hidden);
}

function canTiltPointer(event) {
  if (!canMotion() || splashBlocksTiles() || !event) return false;
  return Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
}

function clearFaceTilt(face) {
  if (!face) return;
  if (typeof window.anime === "function") window.anime.remove(face);
  face.classList.remove("is-tilting");
  face.style.removeProperty("transform");
  face.style.removeProperty("will-change");
}

function stopTileFloat(card) {
  card.classList.remove("tile-float", "is-tilting");
  const wrap = tileFloatWrap(card);
  if (wrap) {
    wrap.classList.remove("tile-float", "is-tilting");
    wrap.style.removeProperty("--tile-float-dur");
    wrap.style.removeProperty("--tile-float-delay");
    wrap.style.removeProperty("--tile-float-x-dur");
    wrap.style.removeProperty("--tile-float-x-delay");
    wrap.style.removeProperty("--tile-float-x-amp");
    wrap.style.removeProperty("will-change");
  }
  card.style.removeProperty("--tile-float-dur");
  card.style.removeProperty("--tile-float-delay");
  card.style.removeProperty("will-change");
  clearFaceTilt(tileFace(card));
}

function stopTileFloatIn(root) {
  if (!root) return;
  root.querySelectorAll(".library-card, .catalog-card").forEach(stopTileFloat);
}

function startTileFloat(cards) {
  const list = motionTargets(cards);
  if (!canMotion()) {
    list.forEach(stopTileFloat);
    return;
  }
  list.forEach((card, i) => {
    const wrap = ensureTileScene(card);
    if (!wrap) return;
    wrap.classList.add("tile-float");
    wrap.style.setProperty("--tile-float-dur", `${2.8 + (i % 5) * 0.45}s`);
    wrap.style.setProperty("--tile-float-delay", `${-((i * 0.41) % 2.6)}s`);
    wrap.style.setProperty("--tile-float-x-dur", `${5.6 + (i % 7) * 0.5}s`);
    wrap.style.setProperty("--tile-float-x-delay", `${-((i * 0.67) % 4.2)}s`);
    wrap.style.setProperty("--tile-float-x-amp", `${(i % 2 === 0 ? 1 : -1) * (2 + (i % 2))}px`);
  });
}

function applyTileTilt(card, event) {
  const face = tileFace(card);
  if (!face) return;
  const rect = (tileFloatWrap(card) || card).getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  pendingTilt = {
    face,
    rotateY: Math.max(-1, Math.min(1, x)) * TILE_TILT_MAX,
    rotateX: Math.max(-1, Math.min(1, -y)) * TILE_TILT_MAX
  };
  if (tiltRaf) return;
  tiltRaf = window.requestAnimationFrame(() => {
    tiltRaf = 0;
    const next = pendingTilt;
    pendingTilt = null;
    if (!next || !canMotion()) return;
    window.anime.set(next.face, {
      rotateX: next.rotateX,
      rotateY: next.rotateY,
      scale: TILE_TILT_SCALE,
      translateZ: TILE_TILT_Z
    });
  });
}

function resetTileTilt(card) {
  const face = tileFace(card);
  if (!face) return;
  pendingTilt = null;
  if (!canMotion()) {
    clearFaceTilt(face);
    return;
  }
  window.anime.remove(face);
  window.anime({
    targets: face,
    rotateX: 0,
    rotateY: 0,
    scale: 1,
    translateZ: 0,
    duration: 280,
    easing: "easeOutCubic",
    complete() {
      if (activeTiltCard === card) return;
      clearFaceTilt(face);
    }
  });
}

function enterTile(card) {
  if (activeTiltCard && activeTiltCard !== card) {
    const prev = activeTiltCard;
    activeTiltCard = null;
    const prevFace = tileFace(prev);
    if (prevFace) prevFace.classList.remove("is-tilting");
    resetTileTilt(prev);
  }
  activeTiltCard = card;
  const face = tileFace(card);
  if (face) {
    window.anime.remove(face);
    face.classList.add("is-tilting");
    face.style.willChange = "transform";
  }
}

function leaveTile(card) {
  if (activeTiltCard === card) activeTiltCard = null;
  const face = tileFace(card);
  if (face) face.classList.remove("is-tilting");
  resetTileTilt(card);
}

function onTilePointerMove(event) {
  if (!canTiltPointer(event)) {
    if (activeTiltCard) leaveTile(activeTiltCard);
    return;
  }
  const card = closestTile(event.target);
  if (!card) {
    if (activeTiltCard) leaveTile(activeTiltCard);
    return;
  }
  if (activeTiltCard !== card) enterTile(card);
  applyTileTilt(card, event);
}

function teardownAllTileMotion() {
  activeTiltCard = null;
  pendingTilt = null;
  document.querySelectorAll(".library-card, .catalog-card").forEach(stopTileFloat);
}

function wireTileMotion() {
  document.addEventListener("pointermove", onTilePointerMove, { passive: true });
  document.addEventListener("pointerleave", () => {
    if (activeTiltCard) leaveTile(activeTiltCard);
  });
  const onReduce = () => {
    if (canMotion()) {
      startTileFloat(document.querySelectorAll(".library-card, .catalog-card"));
      return;
    }
    teardownAllTileMotion();
  };
  if (typeof reduceMotionMq.addEventListener === "function") reduceMotionMq.addEventListener("change", onReduce);
  else if (typeof reduceMotionMq.addListener === "function") reduceMotionMq.addListener(onReduce);
}

function bindTileGrid(nodes, options = {}) {
  const list = motionTargets(nodes);
  const changed = motionStagger(list, {
    key: options.key,
    skip: options.skip,
    force: options.force,
    stagger: options.stagger,
    onReady: startTileFloat
  });
  if (!changed) startTileFloat(list);
}

function setGridHtml(el, html, key) {
  if (!el) return false;
  const sigKey = `${key}:html`;
  if (motionSig[sigKey] === html) return false;
  stopTileFloatIn(el);
  el.innerHTML = html;
  motionSig[sigKey] = html;
  return true;
}

if (typeof window.anime !== "function") {
  document.documentElement.classList.remove("motion-on");
  markMotionReady();
}

window.setTimeout(markMotionReady, 1600);

function noteError(message) {
  window.CinaRipAudio?.error();
  return message || "Something went wrong.";
}

function redirectToLoginIfUnauthorized(url, status) {
  if (status !== 401) return;
  if (String(url || "").includes("/api/auth/")) return;
  if (splashEl && !splashDismissed && !splashEl.hidden) return;
  location.assign("/");
}

async function getJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  redirectToLoginIfUnauthorized(url, res.status);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  redirectToLoginIfUnauthorized(url, res.status);
  if (!res.ok) {
    const error = new Error(data.error || res.statusText);
    error.payload = data;
    throw error;
  }
  return data;
}

function matchesFilter(title) {
  const q = filterInput.value.trim().toLowerCase();
  return !q || String(title || "").toLowerCase().includes(q);
}

function posterStyle(posterId, posterUrl) {
  if (posterId) return `background-image:url('/api/poster/${posterId}')`;
  if (posterUrl) return `background-image:url('${String(posterUrl).replace(/'/g, "%27")}')`;
  return "";
}

function freezerCornerButton(id, { thaw = false } = {}) {
  const key = thaw ? "thaw" : "freeze";
  const label = thaw ? "Thaw" : "Put in Freezer";
  const stateClass = thaw ? " freezer-corner--thaw" : "";
  return `<button type="button" class="freezer-corner${stateClass}" data-${key}="${escapeAttr(id)}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}">
    <img src="/icons/freezer.png" width="26" height="26" alt="" draggable="false">
  </button>`;
}

function wrapPosterMarkup(posterHtml, overlayHtml = "") {
  return `<div class="tile-scene"><div class="tile-float-wrap">${posterHtml}${overlayHtml}</div></div>`;
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function episodeCode(episode, season = 1) {
  const s = String(episode?.season || season || 1).padStart(2, "0");
  if (!episode?.episode) return `S${s}`;
  return `S${s}E${String(episode.episode).padStart(2, "0")}`;
}

function isCatalogTvItem(item) {
  return item?.kind === "tv" || /\/(?:tv-series|tv|serie|series)\//i.test(String(item?.movieUrl || ""));
}

function play(id, title) {
  playerTitle.textContent = title;
  player.src = `/api/stream/${id}`;
  playerDialog.showModal();
  motionFade(playerDialog, { fromY: 12, duration: 280, scaleFrom: 0.97 });
  window.CinaRipAudio?.onVideoOpen();
  player.play().catch(() => {
    window.CinaRipAudio?.error();
  });
}

playerDialog.addEventListener("close", () => {
  window.CinaRipAudio?.onVideoClose();
  player.pause();
  player.removeAttribute("src");
  player.load();
  clearMotionStyles(playerDialog);
});

function showIdFromHash() {
  const match = String(location.hash || "").match(/^#\/show\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function isSearchHash() {
  return String(location.hash || "").startsWith("#/search");
}

function isFreezerHash() {
  return String(location.hash || "").startsWith("#/freezer");
}

function isSettingsHash() {
  return String(location.hash || "").startsWith("#/settings");
}

function allViewEls() {
  return [viewLibrary, viewSearch, viewShow, viewFreezer, viewSettings].filter(Boolean);
}

function clearViewMotion(el) {
  if (!el) return;
  if (typeof window.anime === "function") window.anime.remove(el);
  el.classList.remove("is-leaving", "is-entering");
  clearMotionStyles(el);
}

function resetViewStage() {
  if (!viewStage) return;
  viewStage.classList.remove("is-transitioning");
  viewStage.style.removeProperty("min-height");
}

function settleViews(el) {
  viewSwitchGen += 1;
  resetViewStage();
  allViewEls().forEach((view) => {
    clearViewMotion(view);
    view.hidden = view !== el;
  });
  activeViewEl = el;
}

function showView(el) {
  settleViews(el);
}

function tabViewIndex(el) {
  const index = tabViewOrder.indexOf(el);
  return index < 0 ? 0 : index;
}

function transitionViews(to, { enterOnly = false } = {}) {
  if (!to) return;
  const from = activeViewEl;
  if (from === to) {
    if (to.hidden) settleViews(to);
    return;
  }

  const canAnimate = Boolean(
    from &&
      !from.hidden &&
      canMotion() &&
      shellMotionDone &&
      !enterOnly
  );
  if (!canAnimate) {
    settleViews(to);
    if (enterOnly && canMotion() && shellMotionDone) {
      motionFade(to, { fromY: 16, duration: 380 });
    }
    return;
  }

  const gen = ++viewSwitchGen;
  const goingRight = tabViewIndex(to) >= tabViewIndex(from);
  const outX = goingRight ? -VIEW_SLIDE_PX : VIEW_SLIDE_PX;
  const inX = goingRight ? VIEW_SLIDE_PX : -VIEW_SLIDE_PX;

  allViewEls().forEach((view) => {
    if (view === from || view === to) return;
    clearViewMotion(view);
    view.hidden = true;
  });

  if (typeof window.anime === "function") {
    window.anime.remove(from);
    window.anime.remove(to);
  }

  const fromH = from.offsetHeight;
  from.classList.add("is-leaving");
  from.classList.remove("is-entering");
  from.hidden = false;
  from.style.willChange = "transform, opacity";

  to.classList.add("is-entering");
  to.classList.remove("is-leaving");
  to.hidden = false;
  to.style.willChange = "transform, opacity";
  window.anime.set(to, { opacity: 0, translateX: inX, translateY: 0 });
  if (viewStage) {
    viewStage.classList.add("is-transitioning");
    viewStage.style.minHeight = `${Math.max(fromH, to.offsetHeight)}px`;
  }

  activeViewEl = to;

  let pending = 2;
  let settled = false;
  const settle = () => {
    if (settled || gen !== viewSwitchGen) return;
    settled = true;
    window.clearTimeout(safety);
    resetViewStage();
    clearViewMotion(from);
    from.hidden = true;
    clearViewMotion(to);
    to.hidden = false;
    startTileFloat(to.querySelectorAll(".library-card, .catalog-card"));
  };
  const finish = () => {
    pending -= 1;
    if (pending > 0) return;
    settle();
  };
  const safety = window.setTimeout(settle, VIEW_SWITCH_MS + 120);

  window.anime({
    targets: from,
    opacity: 0,
    translateX: outX,
    translateY: 0,
    duration: VIEW_SWITCH_MS,
    easing: "easeInCubic",
    complete: finish
  });
  window.anime({
    targets: to,
    opacity: 1,
    translateX: 0,
    translateY: 0,
    duration: VIEW_SWITCH_MS,
    easing: "easeOutCubic",
    complete: finish
  });
}

function tornadoLoginUrl() {
  return "https://www4.tornadomovies.co/";
}

function helperFallbackScript(nasOrigin) {
  return `(function(){var __CINARIP_NAS_ORIGIN__=${JSON.stringify(nasOrigin)};if(!/tornadomovies\\.co/i.test(location.hostname)){alert("Switch to the Tornado tab, then click this bookmark.");return;}try{localStorage.setItem("cinaripNasOrigin",__CINARIP_NAS_ORIGIN__);}catch(e){}if(document.getElementById("cinarip-finish-bar"))return;var b=document.createElement("button");b.id="cinarip-finish-bar";b.type="button";b.textContent="Finish and close for CinaRip";b.style.cssText="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;width:100%;padding:20px 16px;border:0;background:#2563eb;color:#fff;font:700 20px/1.3 system-ui,sans-serif;cursor:pointer;text-align:center";b.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();var t="";try{t=(window.grecaptcha&&grecaptcha.getResponse&&grecaptcha.getResponse())||""}catch(err){}if(!t){b.textContent="Solve the captcha first, then click here.";return}location.href=__CINARIP_NAS_ORIGIN__+"/login-bridge.html?rc="+encodeURIComponent(t)},true);(document.body||document.documentElement).appendChild(b)})();`;
}

async function wireBookmarklets() {
  const finish = document.getElementById("captcha-bookmarklet");
  if (!finish) return;
  const nasOrigin = location.origin;
  try {
    const [overlay, helper] = await Promise.all([
      fetch("/overlay-killer.js").then((res) => res.text()),
      fetch("/tornado-helper.js").then((res) => res.text())
    ]);
    const payload = `(function(){var __CINARIP_NAS_ORIGIN__=${JSON.stringify(nasOrigin)};if(!/tornadomovies\\.co/i.test(location.hostname)){alert("Switch to the Tornado tab, then click this bookmark.");return;}${overlay}\n${helper}})();`;
    finish.href = `javascript:void${encodeURIComponent(payload)}`;
  } catch {
    finish.href = `javascript:void${encodeURIComponent(helperFallbackScript(nasOrigin))}`;
  }
}

let loginPollTimer = 0;

function stopLoginPoll() {
  if (loginPollTimer) {
    clearInterval(loginPollTimer);
    loginPollTimer = 0;
  }
}

function showLoginHelper() {
  const panel = document.getElementById("login-open-panel");
  if (panel) panel.hidden = false;
  wireBookmarklets().catch(() => {});
  stopLoginPoll();
  loginPollTimer = setInterval(async () => {
    try {
      const data = await getJson("/api/tornado/status");
      if (data.loggedIn) {
        stopLoginPoll();
        if (panel) panel.hidden = true;
        accountLabel.textContent = `Signed in${data.username ? ` · ${data.username}` : ""}`;
      }
    } catch {
      // keep waiting
    }
  }, 2500);
}

function openLoginWindow(loginUrl) {
  const popup = window.open(
    loginUrl || tornadoLoginUrl(),
    "cinarip-tornado-login",
    "width=560,height=860,scrollbars=yes,resizable=yes"
  );
  if (!popup) {
    accountLabel.textContent = "Allow popups for this site, then click Open Tornado again.";
    return null;
  }
  showLoginHelper();
  accountLabel.textContent = "Copy _identity-frontend1 and advanced-frontend, then paste them here";
  return popup;
}

function recaptchaFromHash() {
  const match = String(location.hash || "").match(/[?&]rc=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function finishCaptchaLogin(recaptcha) {
  if (!recaptcha) return;
  history.replaceState(null, "", "#/settings");
  route();
  if (accountLabel) accountLabel.textContent = "Finishing sign-in…";
  try {
    const result = await postJson("/api/tornado/login", { recaptcha });
    accountLabel.textContent = result.loggedIn === true ? "Signed in" : accountLabel.textContent;
    await refreshAccount();
  } catch (error) {
    accountLabel.textContent = error.message || "Login failed";
    noteError();
  }
}

function openShow(id) {
  location.hash = `#/show/${encodeURIComponent(id)}`;
}

function closeShow() {
  location.hash = "";
}

function renderCatalogPoster(container, movie, className) {
  container.innerHTML = "";
  if (movie?.posterUrl) {
    const img = document.createElement("img");
    img.src = movie.posterUrl;
    img.alt = movie.title || "Poster";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      container.innerHTML = "";
      const fallback = document.createElement("div");
      fallback.className = className;
      fallback.textContent = movie.title || "No poster";
      container.appendChild(fallback);
    });
    container.appendChild(img);
    return;
  }
  const fallback = document.createElement("div");
  fallback.className = className;
  fallback.textContent = movie?.title || "No poster";
  container.appendChild(fallback);
}

function showCatalogResults() {
  if (catalogDetail) catalogDetail.hidden = true;
  if (searchList) searchList.hidden = false;
  if (catalogResultsHead) catalogResultsHead.hidden = !searchResults.length;
}

function showCatalogDetail() {
  if (catalogDetail) catalogDetail.hidden = false;
  if (searchList) searchList.hidden = true;
  if (catalogResultsHead) catalogResultsHead.hidden = true;
  if (catalogDetail) motionFade(catalogDetail, { fromY: 14, duration: 360 });
}

function renderSearch() {
  if (!searchResults.length) {
    stopTileFloatIn(searchList);
    searchList.innerHTML = "";
    motionSig["search:html"] = "";
    if (catalogResultsHead) catalogResultsHead.hidden = true;
    return;
  }

  const movieCount = searchCounts?.movies ?? searchResults.filter((item) => !isCatalogTvItem(item)).length;
  const tvCount = searchCounts?.tv ?? searchResults.filter((item) => isCatalogTvItem(item)).length;
  if (catalogResultsSummary) {
    catalogResultsSummary.textContent = `${searchResults.length} title${searchResults.length === 1 ? "" : "s"} · ${movieCount} movie${movieCount === 1 ? "" : "s"} · ${tvCount} TV`;
  }
  if (catalogResultsHead) catalogResultsHead.hidden = Boolean(catalogDetail && catalogDetail.hidden === false);

  stopTileFloatIn(searchList);
  searchList.innerHTML = "";
  motionSig["search:html"] = "search";
  for (const movie of searchResults) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `catalog-card${isCatalogTvItem(movie) ? " kind-tv" : " kind-movie"}`;
    card.setAttribute("role", "listitem");

    const poster = document.createElement("div");
    poster.className = "catalog-card-poster";
    renderCatalogPoster(poster, movie, "catalog-card-poster-fallback");

    const badge = document.createElement("span");
    badge.className = "catalog-card-kind";
    badge.textContent = isCatalogTvItem(movie) ? "TV" : "Movie";
    poster.appendChild(badge);

    const scene = document.createElement("div");
    scene.className = "tile-scene";
    const wrap = document.createElement("div");
    wrap.className = "tile-float-wrap";
    wrap.appendChild(poster);
    scene.appendChild(wrap);

    const name = movie.title || (isCatalogTvItem(movie) ? "TV Show" : "Movie");
    card.title = name;
    card.setAttribute("aria-label", name);
    card.append(scene);
    if (movie.year) {
      const year = document.createElement("div");
      year.className = "catalog-card-year";
      year.textContent = movie.year;
      card.appendChild(year);
    }

    card.addEventListener("click", () => openCatalogMovie(movie));
    searchList.appendChild(card);
  }
  if (catalogResultsHead && !catalogResultsHead.hidden) {
    motionFade(catalogResultsHead, { fromY: 8, duration: 320 });
  }
  bindTileGrid(searchList.querySelectorAll(".catalog-card"), {
    key: "search",
    force: true,
    stagger: 28
  });
}

function renderSeasonSelect(select, seasons, selectedSeason = null) {
  if (!select) return selectedSeason;
  select.replaceChildren();
  const list = Array.isArray(seasons) ? seasons : [];
  for (const season of list) {
    const option = document.createElement("option");
    option.value = String(season.number);
    option.textContent = season.label || `Season ${season.number}`;
    select.appendChild(option);
  }
  if (!list.length) return null;
  const preferred = list.find((season) => season.number === selectedSeason)?.number ?? list[0].number;
  select.value = String(preferred);
  return preferred;
}

function clearCatalogTvEpisodePanel(message = "No episodes scanned yet.") {
  catalogTvEpisodeOptions = [];
  if (catalogTvEpisodeSelect) catalogTvEpisodeSelect.replaceChildren();
  if (catalogTvEpisodeSummary) catalogTvEpisodeSummary.textContent = "";
  if (catalogTvEpisodeList) {
    catalogTvEpisodeList.innerHTML = `<li class="catalog-tv-empty">${message}</li>`;
  }
}

function renderCatalogTvEpisodePanel(plan = null) {
  const episodes = Array.isArray(plan?.episodes) ? plan.episodes : [];
  catalogTvEpisodeOptions = episodes;
  const season = plan?.season || getSelectedCatalogTvSeason() || 1;

  if (catalogTvEpisodeSelect) {
    catalogTvEpisodeSelect.replaceChildren();
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = episodes.length ? `All episodes (${episodes.length})` : "All episodes";
    catalogTvEpisodeSelect.appendChild(allOption);
    for (const episode of episodes) {
      const option = document.createElement("option");
      option.value = String(episode.episode || "");
      option.textContent = `${episodeCode(episode, season)} · ${episode.title || "Episode"}`;
      catalogTvEpisodeSelect.appendChild(option);
    }
    catalogTvEpisodeSelect.value = "all";
  }

  if (catalogTvEpisodeSummary) {
    catalogTvEpisodeSummary.textContent = episodes.length
      ? `Season ${season} · ${episodes.length} episode${episodes.length === 1 ? "" : "s"} ready`
      : `Season ${season} · no episodes found yet`;
  }

  if (catalogTvEpisodeList) {
    if (!episodes.length) {
      catalogTvEpisodeList.innerHTML = '<li class="catalog-tv-empty">No episodes found for this season.</li>';
    } else {
      catalogTvEpisodeList.replaceChildren();
      for (const episode of episodes) {
        const item = document.createElement("li");
        const code = document.createElement("span");
        code.className = "ep-code";
        code.textContent = episodeCode(episode, season);
        const title = document.createElement("span");
        title.className = "ep-title";
        title.textContent = episode.title || "Episode";
        item.append(code, title);
        catalogTvEpisodeList.appendChild(item);
      }
    }
  }
}

function getSelectedCatalogTvSeason() {
  const parsed = Number.parseInt(catalogTvSeasonSelect?.value, 10);
  if (parsed > 0) return parsed;
  return catalogTvSeasonOptions[0]?.number > 0 ? catalogTvSeasonOptions[0].number : 1;
}

function updateCatalogDetailActions(movie) {
  const isTv = isCatalogTvItem(movie);
  if (catalogAddQueue) {
    catalogAddQueue.textContent = isTv ? "Add Season to Queue" : "Add to Queue";
  }
  if (catalogTvPanel) catalogTvPanel.hidden = !isTv;
}

async function loadCatalogTvShow(movie, season = null) {
  const token = ++catalogTvScanToken;
  if (catalogDetailStatus) catalogDetailStatus.textContent = "Finding seasons and scanning episodes...";
  clearCatalogTvEpisodePanel("Loading seasons and episodes...");
  try {
    const params = new URLSearchParams({ url: movie.movieUrl });
    if (season) params.set("season", String(season));
    const result = await getJson(`/api/show?${params.toString()}`);
    if (token !== catalogTvScanToken) return { ok: false, cancelled: true };

    catalogTvSeasonOptions = result.seasons || [];
    renderSeasonSelect(catalogTvSeasonSelect, catalogTvSeasonOptions, result.season || season);
    tvShowPlan = result.plan || {
      showTitle: result.showTitle,
      season: result.season,
      showUrl: result.showUrl,
      posterUrl: result.posterUrl,
      episodes: result.episodes || []
    };
    renderCatalogTvEpisodePanel(tvShowPlan);
    const count = tvShowPlan.episodes?.length || 0;
    if (catalogDetailStatus) {
      catalogDetailStatus.textContent = count
        ? `${count} episode${count === 1 ? "" : "s"} found for season ${tvShowPlan.season || season || 1}.`
        : result.error || "No episodes found for this season.";
    }
    return result;
  } catch (error) {
    if (token !== catalogTvScanToken) return { ok: false, cancelled: true };
    clearCatalogTvEpisodePanel(error.message || "Could not scan this show.");
    if (catalogDetailStatus) catalogDetailStatus.textContent = noteError(error.message || "TV scan failed.");
    return { ok: false, error: error.message };
  }
}

async function openCatalogMovie(movie) {
  selectedCatalogMovie = movie;
  const isTv = isCatalogTvItem(movie);
  tvShowPlan = null;
  catalogTvScanToken += 1;
  if (catalogDetailTitle) catalogDetailTitle.textContent = movie.title || (isTv ? "TV Show" : "Movie");
  if (catalogDetailYear) {
    catalogDetailYear.textContent = [isTv ? "TV Show" : "Movie", movie.year].filter(Boolean).join(" · ");
  }
  if (catalogDetailStatus) {
    catalogDetailStatus.textContent = isTv
      ? "Loading seasons and episodes..."
      : "Ready to download or add to queue.";
  }
  renderCatalogPoster(catalogDetailPoster, movie, "catalog-detail-poster-fallback");
  updateCatalogDetailActions(movie);
  if (!isTv) {
    catalogTvSeasonOptions = [];
    if (catalogTvSeasonSelect) catalogTvSeasonSelect.replaceChildren();
    clearCatalogTvEpisodePanel();
  }
  showCatalogDetail();
  if (isTv) await loadCatalogTvShow(movie);
}

async function queueSelectedCatalog() {
  if (!selectedCatalogMovie?.movieUrl) {
    if (catalogDetailStatus) catalogDetailStatus.textContent = "Select a title from the catalog first.";
    return;
  }
  if (isCatalogTvItem(selectedCatalogMovie)) {
    const season = getSelectedCatalogTvSeason();
    if (!tvShowPlan?.episodes?.length || Number(tvShowPlan.season) !== Number(season)) {
      const scan = await loadCatalogTvShow(selectedCatalogMovie, season);
      if (!scan.ok && !tvShowPlan?.episodes?.length) return;
    }
    if (!tvShowPlan?.episodes?.length) {
      if (catalogDetailStatus) catalogDetailStatus.textContent = "Scan a TV show season first.";
      return;
    }
    try {
      const result = await postJson("/api/downloads", {
        episodes: tvShowPlan.episodes,
        showTitle: tvShowPlan.showTitle,
        posterUrl: tvShowPlan.posterUrl || selectedCatalogMovie.posterUrl
      });
      const added = result.added?.length || 0;
      if (catalogDetailStatus) {
        catalogDetailStatus.textContent = `Added ${added} episode${added === 1 ? "" : "s"} to the download queue.`;
      }
      await refreshJobs();
    } catch (error) {
      if (catalogDetailStatus) catalogDetailStatus.textContent = noteError(error.message || "Could not add episodes.");
    }
    return;
  }

  try {
    await postJson("/api/downloads", {
      movieUrl: selectedCatalogMovie.movieUrl,
      title: selectedCatalogMovie.title,
      posterUrl: selectedCatalogMovie.posterUrl
    });
    if (catalogDetailStatus) catalogDetailStatus.textContent = "Added to download queue.";
    await refreshJobs();
  } catch (error) {
    if (catalogDetailStatus) catalogDetailStatus.textContent = noteError(error.message || "Could not add to queue.");
  }
}

function compressStatusLabel(item) {
  const status = item?.compressStatus || "pending";
  if (status === "encoding") return "Encoding";
  if (status === "done") return item.originalKept ? "Compressed · original kept" : "Compressed · original discarded";
  if (status === "failed") return item.compressError ? `Failed · ${item.compressError}` : "Failed";
  if (status === "restored") return "Original restored";
  return "Waiting for encode worker";
}

function freezerCard(item, options = {}) {
  const isShow = item.kind === "tv-show" || options.isShow;
  const restore = item.originalKept
    ? `<button type="button" class="ghost freezer-btn" data-restore="${escapeAttr(item.id)}">Restore original</button>
       <button type="button" class="ghost freezer-btn" data-discard="${escapeAttr(item.id)}">Discard original</button>`
    : "";
  const name = escapeAttr(item.title);
  const poster = wrapPosterMarkup(isShow
    ? `<button type="button" class="poster" style="${posterStyle(item.posterId)}" data-show="${escapeAttr(item.id)}" title="${name}" aria-label="${name}">
          <em>Series</em>
        </button>`
    : `<button type="button" class="poster" style="${posterStyle(item.posterId)}" data-play="${item.id}" data-title="${name}" title="${name}" aria-label="${name}">
          <em data-kind="movie">Movie</em>
        </button>`, freezerCornerButton(item.id, { thaw: true }));
  return `
    <article class="library-card">
      ${poster}
      <p class="freezer-status">${escapeHtml(compressStatusLabel(item))}</p>
      ${restore}
    </article>`;
}

function renderFreezerPage(options = {}) {
  if (!freezerList) return;
  const q = (freezerFilter?.value || "").trim().toLowerCase();
  const matches = (title) => !q || String(title || "").toLowerCase().includes(q);
  const movies = (library.frozen?.movies || []).filter((item) => matches(item.title));
  const shows = (library.frozen?.shows || []).filter((show) => matches(show.title));
  const failed = [...movies, ...shows].filter((item) => item.compressStatus === "failed");
  if (freezerSummary) {
    freezerSummary.textContent = `${movies.length + shows.length} frozen`;
  }
  if (freezerFailed) {
    freezerFailed.hidden = !failed.length;
    freezerFailed.textContent = failed.length
      ? `${failed.length} encode failed — original playback was left untouched.`
      : "";
  }
  if (!movies.length && !shows.length) {
    setGridHtml(
      freezerList,
      `<p class="empty">Nothing in Freezer yet. Tap the snowflake on Library posters, then download the encode worker.</p>`,
      "freezer"
    );
    bindTileGrid([], { key: "freezer", skip: options.skipMotion });
    return;
  }
  const cards = [
    ...movies.map((item) => freezerCard(item)),
    ...shows.map((show) => freezerCard(show, { isShow: true }))
  ].join("");
  setGridHtml(freezerList, `<div class="library">${cards}</div>`, "freezer");
  bindTileGrid(freezerList.querySelectorAll(".library-card"), {
    key: "freezer",
    skip: options.skipMotion
  });
}

function libraryCard(item, options = {}) {
  const frozen = Boolean(options.frozen || item.frozen);
  const isShow = item.kind === "tv-show" || options.isShow;
  const freezeIcon = freezerCornerButton(item.id, { thaw: frozen });
  const name = escapeAttr(item.title);
  if (isShow) {
    return `
      <article class="library-card">
        ${wrapPosterMarkup(`<button type="button" class="poster" style="${posterStyle(item.posterId)}" data-show="${escapeAttr(item.id)}" title="${name}" aria-label="${name}">
          <em>Series</em>
        </button>`, freezeIcon)}
      </article>`;
  }
  return `
    <article class="library-card">
      ${wrapPosterMarkup(`<button type="button" class="poster" style="${posterStyle(item.posterId)}" data-play="${item.id}" data-title="${name}" title="${name}" aria-label="${name}">
          <em data-kind="movie">Movie</em>
        </button>`, freezeIcon)}
    </article>`;
}

function renderLibrary(options = {}) {
  const movies = (library.movies || []).filter((item) => matchesFilter(item.title));
  const shows = (library.shows || []).filter((show) => matchesFilter(show.title));
  const frozenCount = (library.frozen?.movieCount || 0) + (library.frozen?.showCount || 0);

  if (!movies.length && !shows.length && !frozenCount) {
    setGridHtml(
      libraryList,
      `<p class="empty">No titles match. If this is empty after a scan, check that Docker mounted /Public/Videos.</p>
      <section class="freezer-section freezer-empty">
        <h2>Freezer</h2>
        <p class="muted">Pack titles away, then compress them on a PC.</p>
        <a class="ghost primary-action freezer-open" href="#/freezer">Open Freezer</a>
      </section>`,
      "library"
    );
    bindTileGrid([], { key: "library", skip: options.skipMotion });
    return;
  }

  const mainCards = [...movies.map((item) => libraryCard(item)), ...shows.map((show) => libraryCard(show, { isShow: true }))].join("");
  const mainGrid = mainCards ? `<div class="library">${mainCards}</div>` : "";
  const freezerSection = `<section class="freezer-section${frozenCount ? "" : " freezer-empty"}">
        <h2>Freezer</h2>
        <p class="muted">${frozenCount ? `${frozenCount} title${frozenCount === 1 ? "" : "s"} packed away.` : "Pack titles away to save space. Compress on another machine."}</p>
        <a class="ghost primary-action freezer-open" href="#/freezer">Open Freezer</a>
      </section>`;

  setGridHtml(libraryList, `${mainGrid}${freezerSection}`, "library");
  bindTileGrid(libraryList.querySelectorAll(".library-card"), {
    key: "library",
    skip: options.skipMotion
  });
}

function findShow(showId) {
  return (
    (library.shows || []).find((item) => item.id === showId) ||
    (library.frozen?.shows || []).find((item) => item.id === showId) ||
    null
  );
}

function renderShow(show) {
  showPoster.setAttribute("style", posterStyle(show.posterId));
  showPoster.innerHTML = `<em>Series</em>`;
  showTitle.textContent = show.title;
  showMeta.textContent = show.subtitle || `${show.episodeCount || show.episodes.length} episodes`;
  document.title = show.title;
  if (showFreezerAction) {
    showFreezerAction.hidden = false;
    if (show.frozen) {
      showFreezerAction.title = "Thaw";
      showFreezerAction.setAttribute("aria-label", "Thaw");
      showFreezerAction.classList.add("freezer-corner--thaw");
      showFreezerAction.dataset.thaw = show.id;
      delete showFreezerAction.dataset.freeze;
    } else {
      showFreezerAction.title = "Put in Freezer";
      showFreezerAction.setAttribute("aria-label", "Put in Freezer");
      showFreezerAction.classList.remove("freezer-corner--thaw");
      showFreezerAction.dataset.freeze = show.id;
      delete showFreezerAction.dataset.thaw;
    }
  }

  const bySeason = new Map();
  for (const episode of show.episodes || []) {
    const season = episode.season || 1;
    if (!bySeason.has(season)) bySeason.set(season, []);
    bySeason.get(season).push(episode);
  }

  episodeList.innerHTML = [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, episodes]) => {
      const rows = episodes
        .map(
          (episode) => `
          <button type="button" class="episode" data-play="${episode.id}" data-title="${escapeAttr(`${episodeCode(episode)} · ${episode.title}`)}">
            <span class="episode-code">${episodeCode(episode)}</span>
            <span class="episode-name">${escapeHtml(episode.title)}</span>
            <span class="kind">${formatBytes(episode.size)}</span>
          </button>`
        )
        .join("");
      return `<section class="season-block">
        <h2>Season ${season}</h2>
        <div class="episodes">${rows}</div>
      </section>`;
    })
    .join("");
}

function route() {
  const searching = isSearchHash();
  const freezer = isFreezerHash();
  const settings = isSettingsHash();
  const showId = showIdFromHash();
  tabLibrary.classList.toggle("is-active", !searching && !freezer && !settings && !showId);
  tabSearch.classList.toggle("is-active", searching);
  if (tabFreezer) tabFreezer.classList.toggle("is-active", freezer);
  if (tabSettings) tabSettings.classList.toggle("is-active", settings);
  if (filterInput) filterInput.hidden = searching || freezer || settings || Boolean(showId);

  let incoming = viewLibrary;
  if (searching) {
    document.title = "CinaRip · Search";
    incoming = viewSearch;
  } else if (freezer) {
    renderFreezerPage();
    document.title = "CinaRip · Freezer";
    incoming = viewFreezer;
  } else if (settings) {
    document.title = "CinaRip · Settings";
    incoming = viewSettings;
  } else if (!showId) {
    const frozenCount = (library.frozen?.movieCount || 0) + (library.frozen?.showCount || 0);
    const total = (library.movieCount || 0) + (library.showCount || 0) + frozenCount;
    document.title = total ? `CinaRip Library · ${total} titles` : "CinaRip Library";
    incoming = viewLibrary;
  } else {
    const show = findShow(showId);
    if (!show) {
      showStatus("Series not found.", { error: true });
      closeShow();
      return;
    }
    renderShow(show);
    incoming = viewShow;
  }

  const key = searching ? "search" : freezer ? "freezer" : settings ? "settings" : showId ? `show:${showId}` : "library";
  const changed = lastRouteKey !== key;
  lastRouteKey = key;
  if (changed && settings) refreshSettingsDiagnostics().catch(() => {});
  if (changed) transitionViews(incoming, { enterOnly: incoming === viewShow });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function queueStatusLabel(item) {
  switch (item?.status) {
    case "loading":
      return "Loading";
    case "downloading":
      return item.progress ? `Downloading ${item.progress}%` : "Downloading";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return item?.passRetries ? "Retry" : "Pending";
  }
}

function formatQueueSummary(snapshot) {
  const counts = snapshot?.counts || {};
  const parts = [];
  if (counts.pending) parts.push(`${counts.pending} pending`);
  if (counts.movies) parts.push(`${counts.movies} movie${counts.movies === 1 ? "" : "s"}`);
  if (counts.episodes) parts.push(`${counts.episodes} ep${counts.episodes === 1 ? "" : "s"}`);
  if (counts.done) parts.push(`${counts.done} done`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  if (snapshot?.running) parts.push("running");
  if (parts.length) return parts.join(" · ");
  return "0 items queued";
}

function queueItemProgress(item, snapshot) {
  if (item?.status === "done") return 100;
  if (snapshot?.current?.id === item?.id && snapshot.current?.percent != null) {
    return Number(snapshot.current.percent) || 0;
  }
  return Number(item?.progress) || 0;
}

function bindQueueRemove(row, itemId) {
  const button = row.querySelector(".download-queue-remove");
  if (!button || button.dataset.bound === "1") return;
  button.dataset.bound = "1";
  button.addEventListener("click", async () => {
    try {
      await postJson("/api/downloads/remove", { id: itemId });
      await refreshJobs();
    } catch (error) {
      searchStatus.textContent = noteError(error.message || "Could not remove item.");
    }
  });
}

function fillQueueRow(row, item, snapshot) {
  const isCurrent = Boolean(snapshot?.running && item.id === snapshot.currentId);
  const kind = item.kind === "episode" ? "episode" : "movie";
  row.dataset.queueId = item.id;
  row.className = `download-queue-item status-${item.status} kind-${kind}${isCurrent ? " current" : ""}`;

  let title = row.querySelector(".download-queue-item-title");
  if (!title) {
    title = document.createElement("span");
    title.className = "download-queue-item-title";
    row.appendChild(title);
  }
  title.textContent = item.title;
  title.title = item.movieUrl || "";

  let badge = row.querySelector(".download-queue-item-status");
  let meta = row.querySelector(".download-queue-item-meta");
  let rowMeta = row.querySelector(".download-queue-item-row");
  if (!rowMeta) {
    rowMeta = document.createElement("div");
    rowMeta.className = "download-queue-item-row";
    row.appendChild(rowMeta);
  }
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "download-queue-item-status";
    rowMeta.appendChild(badge);
  } else if (badge.parentElement !== rowMeta) {
    rowMeta.appendChild(badge);
  }
  badge.textContent = queueStatusLabel(item);
  if (!meta) {
    meta = document.createElement("span");
    meta.className = "download-queue-item-meta";
    rowMeta.appendChild(meta);
  } else if (meta.parentElement !== rowMeta) {
    rowMeta.appendChild(meta);
  }
  meta.textContent = `${item.kind === "episode" ? "TV" : "Movie"} · NAS`;

  let error = row.querySelector(".download-queue-item-error");
  if (item.status === "failed" && item.error) {
    if (!error) {
      error = document.createElement("span");
      error.className = "download-queue-item-error";
      row.appendChild(error);
    }
    error.textContent = item.error;
  } else if (error) {
    error.remove();
  }

  const showMeter = item.status === "downloading" || item.status === "loading" || isCurrent;
  let meter = row.querySelector(".queue-item-meter");
  if (showMeter) {
    if (!meter) {
      meter = document.createElement("div");
      meter.className = "queue-item-meter";
      const fill = document.createElement("i");
      fill.className = "queue-item-fill";
      meter.appendChild(fill);
      row.appendChild(meter);
    }
    meter.hidden = false;
    animateMeterFill(meter.querySelector(".queue-item-fill"), queueItemProgress(item, snapshot), { duration: 420 });
  } else if (meter) {
    meter.hidden = true;
  }

  const canRemove = !isCurrent && item.status !== "downloading" && item.status !== "loading";
  let removeButton = row.querySelector(".download-queue-remove");
  if (canRemove) {
    if (!removeButton) {
      removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "download-queue-remove";
      removeButton.textContent = "×";
      removeButton.title = "Remove from queue";
      row.appendChild(removeButton);
    }
    bindQueueRemove(row, item.id);
  } else if (removeButton) {
    removeButton.remove();
  }
}

function renderDownloadQueue(snapshot) {
  const items = snapshot?.items || [];
  if (downloadQueueSummary) downloadQueueSummary.textContent = formatQueueSummary(snapshot);
  if (!downloadQueueList) return;

  if (!items.length) {
    downloadQueueList.innerHTML = "";
    const empty = document.createElement("li");
    empty.className = "download-queue-empty";
    empty.textContent = "Add titles, then click Download. Files are saved to the NAS.";
    downloadQueueList.appendChild(empty);
    seenQueueIds.clear();
    return;
  }

  const empty = downloadQueueList.querySelector(".download-queue-empty");
  if (empty) empty.remove();

  const existing = new Map(
    Array.from(downloadQueueList.querySelectorAll("[data-queue-id]")).map((row) => [row.dataset.queueId, row])
  );
  const nextIds = new Set(items.map((item) => item.id));
  const freshRows = [];

  for (const item of items) {
    let row = existing.get(item.id);
    const isNew = !row;
    if (!row) {
      row = document.createElement("li");
      downloadQueueList.appendChild(row);
      freshRows.push(row);
    }
    fillQueueRow(row, item, snapshot);
    downloadQueueList.appendChild(row);
  }

  for (const [id, row] of existing) {
    if (nextIds.has(id)) continue;
    if (!canMotion()) {
      row.remove();
      continue;
    }
    window.anime.remove(row);
    window.anime({
      targets: row,
      opacity: 0,
      translateX: 16,
      duration: 220,
      easing: "easeInCubic",
      complete() {
        row.remove();
      }
    });
  }

  seenQueueIds.clear();
  for (const item of items) seenQueueIds.add(item.id);
  if (freshRows.length) {
    motionFade(freshRows, {
      fromY: 12,
      scaleFrom: 0.98,
      duration: 380,
      easing: "easeOutCubic",
      delay: (_, i) => Math.min(i * 40, 280)
    });
  }
}

function updateQueueControls(snapshot) {
  const running = Boolean(snapshot?.running);
  const hasWork = (snapshot?.counts?.pending || 0) > 0 || (snapshot?.counts?.failed || 0) > 0;
  if (startDownloadQueueButton) startDownloadQueueButton.disabled = running || !hasWork;
  if (stopDownloadQueueButton) stopDownloadQueueButton.hidden = !running;
  if (clearDownloadQueueButton) clearDownloadQueueButton.disabled = running;
  if (downloadQueueSection) downloadQueueSection.classList.toggle("is-running", running);
}

function renderJobs(data) {
  lastQueueSnapshot = data;
  const current = data.current;
  const active = (data.items || []).filter((item) => item.status === "pending" || item.status === "loading" || item.status === "downloading");
  renderDownloadQueue(data);
  updateQueueControls(data);

  const percent = current?.percent || 0;
  const downloading = Boolean(current && (current.percent > 0 || /download|find|load/i.test(current.phase || "")));
  if (queueMeter) {
  const showQueueMeter = Boolean(current && percent > 0);
    queueMeter.hidden = !showQueueMeter;
    queueMeter.classList.toggle("is-running", downloading);
    queueMeter.classList.toggle("is-active", downloading);
    if (showQueueMeter) animateMeterFill(queueBar, percent);
  }

  if (!current && !active.length) {
    jobCard.hidden = true;
    if (jobCardVisible) clearMotionStyles(jobCard);
    jobCardVisible = false;
    return;
  }

  const appearing = !jobCardVisible;
  jobCard.hidden = false;
  jobCardVisible = true;
  jobTitle.textContent = current?.title || active[0]?.title || "Download";
  jobLabel.textContent = current ? `${percent}%` : `${active.length} queued`;
  jobPhase.textContent = current?.phase || `${active.length} item${active.length === 1 ? "" : "s"} waiting`;
  if (jobMeter) {
    jobMeter.classList.toggle("is-running", Boolean(current));
    jobMeter.classList.toggle("is-active", true);
  }
  animateMeterFill(jobBar, percent, { duration: 480 });
  if (appearing) motionFade(jobCard, { fromY: 10, duration: 360 });
}

async function refreshJobs() {
  const data = await getJson("/api/downloads");
  const wasRunning = lastQueueRunning;
  renderJobs(data);
  const items = data.items || [];
  const doneCount = items.filter((item) => item.status === "done").length;
  if (doneCount > lastDoneCount) refreshLibrary().catch(() => {});
  lastDoneCount = doneCount;

  for (const item of items) {
    if (item.status !== "failed" || heardFailedIds.has(item.id)) continue;
    heardFailedIds.add(item.id);
    if (wasRunning !== null) window.CinaRipAudio?.error();
  }

  const running = Boolean(data.running);
  const stillWorking = items.some(
    (item) => item.status === "pending" || item.status === "loading" || item.status === "downloading"
  );
  if (running) playedQueueFinish = false;
  if (wasRunning === true && !running && !stillWorking && items.length && !playedQueueFinish) {
    playedQueueFinish = true;
    window.setTimeout(() => window.CinaRipAudio?.queueFinished(), 350);
  }
  lastQueueRunning = running;
}

const ACCOUNT_STATE_KEY = "cinarip.tornado.account";

function signedInLabel(data) {
  const name = data?.username || "";
  return `Signed in${name ? ` · ${name}` : ""}`;
}

function accountErrorEl() {
  return document.getElementById("account-error");
}

function setAccountError(message) {
  const el = accountErrorEl();
  if (!el) return;
  el.textContent = message || "";
  el.hidden = !message;
}

function diagBool(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

function renderDiagList(el, rows) {
  if (!el) return;
  el.innerHTML = rows
    .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
}

function renderSessionDiag(data) {
  lastTornadoStatus = data || lastTornadoStatus;
  const sessionLabel = document.getElementById("session-label");
  const sessionDiag = document.getElementById("session-diag");
  if (!data) {
    if (sessionLabel) sessionLabel.textContent = "Unavailable";
    renderDiagList(sessionDiag, [
      ["loggedIn", "—"],
      ["hasCookies", "—"],
      ["hasIdentity", "—"],
      ["evidence", "—"],
      ["error", "—"],
      ["chromeTls", "—"],
      ["tornadoIp", "—"]
    ]);
    return;
  }
  if (sessionLabel) {
    if (data.confirmed && data.loggedIn === true) sessionLabel.textContent = signedInLabel(data);
    else if (data.confirmed && data.loggedIn === false) sessionLabel.textContent = "Not signed in";
    else if (data.evidence === "probe-failed") sessionLabel.textContent = "Unreachable";
    else sessionLabel.textContent = "Unconfirmed";
  }
  renderDiagList(sessionDiag, [
    ["loggedIn", diagBool(data.loggedIn)],
    ["hasCookies", diagBool(data.hasCookies)],
    ["hasIdentity", diagBool(data.hasIdentity)],
    ["evidence", data.evidence || "—"],
    ["error", data.error || "—"],
    ["chromeTls", diagBool(data.chromeTls)],
    ["tornadoIp", data.tornadoIp || "—"]
  ]);
}

function renderHealthDiag(health) {
  lastHealth = health || lastHealth;
  const healthLabel = document.getElementById("health-label");
  const healthDiag = document.getElementById("health-diag");
  if (!health) {
    if (healthLabel) healthLabel.textContent = "Unavailable";
    renderDiagList(healthDiag, [
      ["arch", "—"],
      ["node", "—"],
      ["memory", "—"],
      ["videoRoot", "—"],
      ["movies", "—"],
      ["shows", "—"]
    ]);
    return;
  }
  const ram = health.memoryMb != null ? `${health.memoryMb} MB` : "—";
  if (healthLabel) healthLabel.textContent = health.ok === false ? `Unreachable · ${ram}` : `Online · ${ram}`;
  renderDiagList(healthDiag, [
    ["arch", health.arch || "—"],
    ["node", health.node || "—"],
    ["memory", ram],
    ["videoRoot", health.videoRoot || "—"],
    ["movies", health.movieCount == null ? "—" : String(health.movieCount)],
    ["shows", health.showCount == null ? "—" : String(health.showCount)]
  ]);
}

async function refreshSiteAuth() {
  const label = document.getElementById("site-auth-label");
  try {
    const data = await getJson("/api/auth/session");
    siteAuth.loggedIn = Boolean(data?.loggedIn);
    if (label) label.textContent = siteAuth.loggedIn ? "Unlocked" : "Locked";
  } catch {
    if (label) label.textContent = "Unknown";
  }
}

async function refreshSettingsDiagnostics() {
  const [session, health] = await Promise.all([
    refreshAccount(),
    getJson("/api/health").catch(() => null),
    refreshSiteAuth()
  ]);
  if (health) renderHealthDiag(health);
  else if (!lastHealth) renderHealthDiag(null);
  return { session, health };
}

function persistAccountState(data) {
  if (!data || (data.loggedIn !== true && data.loggedIn !== false)) return;
  try {
    localStorage.setItem(
      ACCOUNT_STATE_KEY,
      JSON.stringify({
        loggedIn: data.loggedIn,
        username: data.username || "",
        hasCookies: Boolean(data.hasCookies),
        hasIdentity: Boolean(data.hasIdentity)
      })
    );
  } catch {
    // ignore quota / private mode
  }
}

function restoreAccountLabel() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCOUNT_STATE_KEY) || "null");
    if (saved?.loggedIn) {
      accountLabel.textContent = signedInLabel(saved);
      return;
    }
    if (saved?.hasIdentity || saved?.hasCookies) {
      accountLabel.textContent = "Restoring session…";
      return;
    }
  } catch {
    // ignore
  }
  accountLabel.textContent = "Checking…";
}

async function refreshAccount() {
  try {
    const data = await getJson("/api/tornado/status");
    if (data.confirmed && data.loggedIn === true) {
      if (accountLabel) accountLabel.textContent = signedInLabel(data);
      persistAccountState(data);
      setAccountError("");
    } else if (data.confirmed && data.loggedIn === false) {
      if (accountLabel) accountLabel.textContent = "Not signed in";
      persistAccountState(data);
      setAccountError("");
    } else {
      if (data.chromeTls === false) {
        if (accountLabel) accountLabel.textContent = "Chrome TLS missing";
      } else if (data.evidence === "probe-failed") {
        if (accountLabel) accountLabel.textContent = "Tornado unreachable";
      } else if (data.lastKnownLoggedIn || data.hasIdentity || data.hasCookies) {
        if (accountLabel && !/^Signed in/i.test(accountLabel.textContent || "")) {
          accountLabel.textContent = data.lastKnownLoggedIn ? signedInLabel(data) : "Restoring session…";
        }
      }
      setAccountError(data.error || "Could not confirm Tornado session.");
    }
    const panel = document.getElementById("login-open-panel");
    if (panel && data.loggedIn === true) {
      panel.hidden = true;
      stopLoginPoll();
    }
    renderSessionDiag(data);
    wireBookmarklets().catch(() => {});
    return data;
  } catch (error) {
    const missing = /unknown api route/i.test(error.message || "");
    if (missing) {
      if (accountLabel) accountLabel.textContent = "Server not updated";
      setAccountError(
        noteError(
          "The website loaded, but Docker is still running the old server.js. Overwrite Public/cinarip/server.js from this PC, then run: sudo docker restart cinarip"
        )
      );
    } else {
      setAccountError(noteError(error.message || "Could not reach the NAS session check."));
    }
    renderSessionDiag(null);
    return null;
  }
}

async function refreshLibrary() {
  const [health, lib] = await Promise.all([getJson("/api/health"), getJson("/api/library")]);
  library = lib;
  renderHealthDiag(health);
  if (health.videoRootExists) {
    if (statusEl?.dataset.kind === "health") hideStatus();
  } else {
    showStatus("Videos folder is not mounted", { error: true, kind: "health" });
  }

  const frozenCount = (lib.frozen?.movieCount || 0) + (lib.frozen?.showCount || 0);
  summaryEl.textContent = lib.exists
    ? `${lib.movieCount} movies · ${lib.showCount} series · ${lib.episodeCount} episodes${
        frozenCount ? ` · ${frozenCount} in Freezer` : ""
      }`
    : "Mounted folder not found. In docker-compose, bind /share/Public/Videos.";

  if (lib.storage?.ok) {
    const pct = Math.min(100, lib.storage.usedPercent || 0);
    setMeterTone(storageMeter, meterTone(pct));
    animateMeterFill(storageBar, pct);
    animateCountLabel(storageLabel, pct, "% used");
  }

  renderLibrary();
  renderFreezerPage();
  route();
}

filterInput.addEventListener("input", () => renderLibrary({ skipMotion: true }));
if (freezerFilter) freezerFilter.addEventListener("input", () => renderFreezerPage({ skipMotion: true }));

async function runFreezerAction(action, id) {
  if (!id) return;
  try {
    showStatus(action === "thaw" ? "Thawing…" : "Moving to Freezer…");
    const result = await postJson(`/api/library/${action}`, { id });
    showStatus(result.message || (action === "thaw" ? "Thawed" : "Moved to Freezer"));
    if (showIdFromHash()) closeShow();
    await refreshLibrary();
  } catch (error) {
    showStatus(noteError(error.message || "Freezer action failed"), { error: true });
  }
}

async function runFreezerOriginal(kind, id) {
  if (!id) return;
  try {
    showStatus(kind === "restore" ? "Restoring original…" : "Discarding original…");
    const result = await postJson(`/api/freezer/${kind === "restore" ? "restore-original" : "discard-original"}`, { id });
    showStatus(result.message || (kind === "restore" ? "Restored original" : "Original discarded"));
    await refreshLibrary();
  } catch (error) {
    showStatus(noteError(error.message || "Freezer action failed"), { error: true });
  }
}

libraryList.addEventListener("click", (event) => {
  const freezeButton = event.target.closest("[data-freeze]");
  if (freezeButton) {
    event.preventDefault();
    event.stopPropagation();
    runFreezerAction("freeze", freezeButton.dataset.freeze);
    return;
  }
  const thawButton = event.target.closest("[data-thaw]");
  if (thawButton) {
    event.preventDefault();
    event.stopPropagation();
    runFreezerAction("thaw", thawButton.dataset.thaw);
    return;
  }
  const showButton = event.target.closest("[data-show]");
  if (showButton) {
    openShow(showButton.dataset.show);
    return;
  }
  const playButton = event.target.closest("[data-play]");
  if (playButton) play(playButton.dataset.play, playButton.dataset.title || "Playing");
});

if (freezerList) {
  freezerList.addEventListener("click", (event) => {
    const restoreButton = event.target.closest("[data-restore]");
    if (restoreButton) {
      event.preventDefault();
      runFreezerOriginal("restore", restoreButton.dataset.restore);
      return;
    }
    const discardButton = event.target.closest("[data-discard]");
    if (discardButton) {
      event.preventDefault();
      runFreezerOriginal("discard", discardButton.dataset.discard);
      return;
    }
    const thawButton = event.target.closest("[data-thaw]");
    if (thawButton) {
      event.preventDefault();
      event.stopPropagation();
      runFreezerAction("thaw", thawButton.dataset.thaw);
      return;
    }
    const showButton = event.target.closest("[data-show]");
    if (showButton) {
      openShow(showButton.dataset.show);
      return;
    }
    const playButton = event.target.closest("[data-play]");
    if (playButton) play(playButton.dataset.play, playButton.dataset.title || "Playing");
  });
}

if (showFreezerAction) {
  showFreezerAction.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (showFreezerAction.dataset.thaw) {
      runFreezerAction("thaw", showFreezerAction.dataset.thaw);
      return;
    }
    if (showFreezerAction.dataset.freeze) runFreezerAction("freeze", showFreezerAction.dataset.freeze);
  });
}

episodeList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-play]");
  if (!button) return;
  play(button.dataset.play, button.dataset.title || "Playing");
});

document.getElementById("catalog-back-results").addEventListener("click", () => {
  selectedCatalogMovie = null;
  showCatalogResults();
  renderSearch();
});

document.getElementById("catalog-add-queue").addEventListener("click", () => {
  queueSelectedCatalog();
});

document.getElementById("catalog-queue-all").addEventListener("click", async () => {
  if (!searchResults.length) {
    searchStatus.textContent = "No search results to queue.";
    return;
  }
  try {
    const result = await postJson("/api/downloads", { movies: searchResults });
    const added = result.added?.length || 0;
    searchStatus.textContent = `Added ${added} movie${added === 1 ? "" : "s"} to queue`;
    await refreshJobs();
  } catch (error) {
    searchStatus.textContent = noteError(error.message || "Could not queue movies.");
  }
});

catalogTvSeasonSelect.addEventListener("change", async () => {
  if (!selectedCatalogMovie || !isCatalogTvItem(selectedCatalogMovie)) return;
  await loadCatalogTvShow(selectedCatalogMovie, getSelectedCatalogTvSeason());
});

catalogTvEpisodeSelect.addEventListener("change", () => {
  const value = catalogTvEpisodeSelect.value;
  const items = catalogTvEpisodeList.querySelectorAll("li");
  items.forEach((item) => item.classList.remove("is-active"));
  if (value === "all") return;
  const match = [...items].find((item) =>
    item.querySelector(".ep-code")?.textContent?.endsWith(`E${String(value).padStart(2, "0")}`)
  );
  if (match) {
    match.classList.add("is-active");
    match.scrollIntoView({ block: "nearest" });
  }
});

startDownloadQueueButton.addEventListener("click", async () => {
  try {
    const result = await postJson("/api/downloads/start");
    if (!result.ok) searchStatus.textContent = noteError(result.error || "Could not start the queue.");
    await refreshJobs();
  } catch (error) {
    searchStatus.textContent = noteError(error.message || "Could not start the queue.");
  }
});

stopDownloadQueueButton.addEventListener("click", async () => {
  try {
    await postJson("/api/downloads/stop");
    await refreshJobs();
  } catch (error) {
    searchStatus.textContent = noteError(error.message || "Could not stop the queue.");
  }
});

clearDownloadQueueButton.addEventListener("click", async () => {
  try {
    await postJson("/api/downloads/clear");
    await refreshJobs();
  } catch (error) {
    searchStatus.textContent = noteError(error.message || "Could not clear the queue.");
  }
});

document.getElementById("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = document.getElementById("search-q").value.trim();
  if (!query) return;
  searchStatus.textContent = "Searching Tornado…";
  stopTileFloatIn(searchList);
  searchList.innerHTML = "";
  motionSig["search:html"] = "";
  selectedCatalogMovie = null;
  showCatalogResults();
  try {
    const data = await getJson(`/api/search?q=${encodeURIComponent(query)}`);
    searchResults = data.movies || [];
    searchCounts = data.counts || null;
    const movieCount = searchCounts?.movies ?? searchResults.filter((item) => !isCatalogTvItem(item)).length;
    const tvCount = searchCounts?.tv ?? searchResults.filter((item) => isCatalogTvItem(item)).length;
    searchStatus.textContent = searchResults.length
      ? `${searchResults.length} title${searchResults.length === 1 ? "" : "s"} · ${movieCount} movie${movieCount === 1 ? "" : "s"} · ${tvCount} TV`
      : "No titles found.";
    renderSearch();
  } catch (error) {
    searchStatus.textContent = noteError(error.message || "Search failed.");
  }
});

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  openLoginWindow();
  accountLabel.textContent = "Copy _identity-frontend1 and advanced-frontend, then paste them here";
  showLoginHelper();
});

document.getElementById("cookie-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await postJson("/api/tornado/login", {
      cookie: document.getElementById("tornado-cookie").value.trim()
    });
    document.getElementById("tornado-cookie").value = "";
    await refreshAccount();
  } catch (error) {
    if (accountLabel) accountLabel.textContent = noteError(error.message || "Cookie save failed");
  }
});

document.getElementById("refresh-session")?.addEventListener("click", async () => {
  try {
    await refreshSettingsDiagnostics();
  } catch (error) {
    setAccountError(noteError(error.message || "Could not refresh diagnostics."));
  }
});

document.getElementById("copy-status-json")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const payload = {
    session: lastTornadoStatus,
    health: lastHealth
  };
  const text = JSON.stringify(payload, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    const previous = button?.textContent;
    if (button) button.textContent = "Copied";
    window.setTimeout(() => {
      if (button && previous) button.textContent = previous;
    }, 1400);
  } catch (error) {
    setAccountError(noteError(error.message || "Could not copy status JSON."));
  }
});

document.getElementById("back-library").addEventListener("click", closeShow);
window.addEventListener("hashchange", () => {
  route();
  finishCaptchaLogin(recaptchaFromHash());
});
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin) return;
  if (event.data?.type === "cinarip-login" && event.data.ok) {
    stopLoginPoll();
    const panel = document.getElementById("login-open-panel");
    if (panel) panel.hidden = true;
    accountLabel.textContent = "Signed in";
    refreshAccount().catch(() => {});
  }
});

function bootUiMotion() {
  const header = document.querySelector(".top");
  const view = document.querySelector(".view:not([hidden])");
  const skip = new Set(["library-list", "freezer-list", "search-list", "episode-list"]);
  const kids = view ? [...view.children].filter((el) => !skip.has(el.id)) : [];
  if (!canMotion()) {
    markMotionReady();
    shellMotionDone = true;
    return;
  }
  if (header) window.anime.set(header, { opacity: 0, translateY: 10 });
  if (kids.length) window.anime.set(kids, { opacity: 0, translateY: 16 });
  markMotionReady();
  motionFade(header, { fromY: 10, duration: 460 });
  motionFade(kids, { fromY: 16, duration: 440, delay: (_, i) => 90 + i * 70 });
  shellMotionDone = true;
}

function wireMotionPress() {
  document.addEventListener(
    "click",
    (event) => {
      if (!canMotion()) return;
      const hit = event.target.closest("button, .tab, a.ghost");
      if (!hit || hit.closest("video")) return;
      if (hit.closest(".library-card, .catalog-card")) return;
      window.anime.remove(hit);
      window.anime({
        targets: hit,
        scale: [0.95, 1],
        duration: 180,
        easing: "easeOutQuad",
        complete() {
          hit.style.removeProperty("transform");
        }
      });
    },
    true
  );
}

function hideSplashOverlay() {
  if (!splashEl) return;
  if (typeof window.anime === "function") window.anime.remove(splashEl);
  splashEl.hidden = true;
  splashEl.setAttribute("aria-hidden", "true");
  splashEl.setAttribute("aria-busy", "false");
  splashEl.style.pointerEvents = "none";
  splashEl.style.opacity = "0";
}

function suppressSplash() {
  rememberSplashDismissed();
  hideSplashOverlay();
}

function dismissSplash() {
  if (splashDismissed) return;
  rememberSplashDismissed();
  if (!splashEl || splashEl.hidden) return;
  splashEl.style.pointerEvents = "none";
  splashEl.setAttribute("aria-busy", "false");
  if (!canMotion()) {
    hideSplashOverlay();
    startTileFloat(document.querySelectorAll(".library-card, .catalog-card"));
    return;
  }
  const safety = window.setTimeout(() => {
    hideSplashOverlay();
    startTileFloat(document.querySelectorAll(".library-card, .catalog-card"));
  }, 520);
  window.anime({
    targets: splashEl,
    opacity: 0,
    duration: 420,
    easing: "easeInCubic",
    complete() {
      window.clearTimeout(safety);
      hideSplashOverlay();
      startTileFloat(document.querySelectorAll(".library-card, .catalog-card"));
    }
  });
}

function showSplashReady() {
  if (!splashEl || splashDismissed || splashEl.hidden) return;
  splashEl.setAttribute("aria-busy", "false");
  if (splashLabelEl) splashLabelEl.hidden = true;
  if (!splashReadyBtn) return;
  splashReadyBtn.hidden = false;
  splashReadyBtn.focus();
}

async function bootLibrarySplash() {
  if (splashDismissedThisSession()) {
    suppressSplash();
  }
  const started = performance.now();
  try {
    await refreshLibrary();
  } catch (error) {
    showStatus(noteError(error.message || "Could not reach the NAS library."), { error: true, kind: "health" });
  }
  if (splashDismissed) {
    hideSplashOverlay();
    return;
  }
  const remain = Math.max(0, SPLASH_MIN_MS - (performance.now() - started));
  if (remain) await new Promise((resolve) => window.setTimeout(resolve, remain));
  if (splashDismissed) {
    hideSplashOverlay();
    return;
  }
  showSplashReady();
}

window.CinaRipSplash = {
  suppress: suppressSplash
};

if (splashReadyBtn) {
  splashReadyBtn.addEventListener("click", () => {
    dismissSplash();
  });
}

wireBookmarklets().catch(() => {});
restoreAccountLabel();
if (!showIdFromHash()) route();
else if (filterInput) filterInput.hidden = true;
bootUiMotion();
wireMotionPress();
wireTileMotion();
bootLibrarySplash();
refreshAccount()
  .then(() => finishCaptchaLogin(recaptchaFromHash()))
  .catch(() => {});
refreshJobs().catch(() => {});

function pinSplashLocked() {
  const form = document.getElementById("splash-pin-form");
  return Boolean(form && !form.hidden);
}

setInterval(() => {
  if (pinSplashLocked()) return;
  refreshJobs().catch(() => {});
  if (isFreezerHash()) refreshLibrary().catch(() => {});
}, 2000);
