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
let jiggleMode = false;
let searchResults = [];
let searchCounts = null;
let selectedCatalogMovie = null;
let catalogTvSeasonOptions = [];
let catalogTvEpisodeOptions = [];
let tvShowPlan = null;
let catalogTvScanToken = 0;
let lastQueueSnapshot = { items: [], counts: {}, running: false };
let realQueueSnapshot = { items: [], counts: {}, running: false };
let lastDoneCount = 0;
let lastQueueRunning = null;
const heardFailedIds = new Set();
let playedQueueFinish = false;
const CURSED_GRAVEYARD_SIZE = 6;
const CURSED_GRAVEYARD_MIN = 4;
const CURSED_FAIL_LINES = [
  "why would you do this?",
  "it was never going to finish",
  "you shouldn't have pressed that",
  "it knows you tried",
  "this was never yours",
  "stop reaching",
  "the file remembers you",
  "no."
];
const CURSED_JOB_TITLES = [
  { title: "the last good thing", kind: "movie" },
  { title: "something you wanted", kind: "movie" },
  { title: "untitled.mkv", kind: "movie" },
  { title: "watch me", kind: "movie" },
  { title: "you left this running", kind: "movie" },
  { title: "ready to watch", kind: "movie" },
  { title: "don't open this", kind: "movie" },
  { title: "final_final_REAL", kind: "movie" },
  { title: "camrip_night.mp4", kind: "movie" },
  { title: "the one you already have", kind: "movie" },
  { title: "help.avi", kind: "movie" },
  { title: "director's cut (you aren't)", kind: "movie" },
  { title: "S01E01 · the invitation", kind: "episode" },
  { title: "S01E07 · it hears you", kind: "episode" },
  { title: "S03E13 · why would you do this", kind: "episode" },
  { title: "S02E02 · leftovers", kind: "episode" },
  { title: "S01E04 · stay in the house", kind: "episode" },
  { title: "S00E00 · unaired", kind: "episode" }
];
const cursedQueue = {
  active: false,
  running: false,
  gen: 0,
  items: [],
  current: null,
  currentId: null,
  syntheticIds: new Set(),
  failedIds: new Set(),
  timers: []
};
const cursedLibraryStats = {
  on: false,
  timer: 0,
  glitchTimer: 0,
  applying: false,
  observer: null,
  counts: null,
  lastStorageLabel: "",
  lastJobLabel: "",
  lastQueueLabel: "",
  lastSummary: ""
};
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
      startChromeFloat();
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
  if (isPunishedMode()) return;
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
  if (isPunishedMode()) return;
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
  if (!canMotion() || splashBlocksTiles() || jiggleMode || !event) return false;
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
  stopChromeFloat();
}

const LIQUID_BOX_SELECTOR = [
  ".meter-card",
  ".search-form",
  ".login-form",
  ".catalog-detail-body",
  ".catalog-results-head",
  ".show-hero",
  ".freezer-section",
  ".status-banner"
].join(",");

const LIQUID_SELECTOR = [
  ".brand-glitch",
  "#filter.header-filter",
  ".music-mute",
  ".tabs .tab",
  ".meter-card",
  ".search-form",
  "button.ghost",
  "a.ghost",
  "#freezer-filter",
  "button.episode",
  ".catalog-detail-body",
  ".catalog-results-head",
  ".show-hero",
  ".freezer-section",
  ".status-banner"
].join(",");

const LIQUID_VARS = [
  "--liquid-dur",
  "--liquid-delay",
  "--liquid-x-dur",
  "--liquid-x-delay",
  "--liquid-x-amp",
  "--liquid-y-amp",
  "--liquid-r-dur",
  "--liquid-r-delay",
  "--liquid-r-amp"
];

let chromeFloatSeq = 0;

function nestedInFloatingBox(el) {
  const parent = el?.parentElement;
  if (!parent) return false;
  if (parent.closest(".liquid-idle")) return true;
  const box = parent.closest(LIQUID_BOX_SELECTOR);
  return Boolean(box && box !== el);
}

function canChromeFloat(el) {
  if (!el) return false;
  if (el.closest("#splash, #punished-veil, #rite-fx, dialog")) return false;
  if (el.closest(".library-card, .catalog-card, .tile-float-wrap")) return false;
  if (el.classList.contains("freezer-corner")) return false;
  if (el.classList.contains("poster-delete")) return false;
  if (nestedInFloatingBox(el)) return false;
  return true;
}

function clearLiquidIdle(el) {
  if (!el?.classList?.contains("liquid-idle")) return;
  el.classList.remove("liquid-idle");
  LIQUID_VARS.forEach((name) => el.style.removeProperty(name));
  el.style.removeProperty("--press-s");
}

function stopChromeFloat(root = document) {
  const scope = root.querySelectorAll ? root : document;
  const nodes = scope.querySelectorAll ? scope.querySelectorAll(".liquid-idle") : [];
  const list = root.classList?.contains("liquid-idle") ? [root, ...nodes] : [...nodes];
  list.forEach(clearLiquidIdle);
}

function stripNestedChromeFloat(root = document) {
  const scope = root.querySelectorAll ? root : document;
  if (!scope.querySelectorAll) return;
  scope.querySelectorAll(".liquid-idle .liquid-idle").forEach(clearLiquidIdle);
  const nestedInBoxes = LIQUID_BOX_SELECTOR.split(",")
    .map((sel) => `${sel.trim()} .liquid-idle`)
    .join(", ");
  scope.querySelectorAll(nestedInBoxes).forEach(clearLiquidIdle);
}

function startChromeFloat(root = document) {
  if (!canMotion() || document.documentElement.classList.contains("is-punished")) {
    stopChromeFloat(root);
    return;
  }
  stripNestedChromeFloat(root);
  const scope = root.querySelectorAll ? root : document;
  const found = scope.querySelectorAll ? [...scope.querySelectorAll(LIQUID_SELECTOR)] : [];
  if (root.matches?.(LIQUID_SELECTOR)) found.unshift(root);
  found.forEach((el) => {
    if (el.classList.contains("liquid-idle") || !canChromeFloat(el)) return;
    const n = chromeFloatSeq++;
    const xSign = n % 2 === 0 ? 1 : -1;
    const rSign = n % 3 === 0 ? -1 : 1;
    el.classList.add("liquid-idle");
    el.style.setProperty("--liquid-dur", `${3.05 + (n % 6) * 0.4}s`);
    el.style.setProperty("--liquid-delay", `${-((n * 0.39) % 2.7)}s`);
    el.style.setProperty("--liquid-x-dur", `${5.6 + (n % 8) * 0.45}s`);
    el.style.setProperty("--liquid-x-delay", `${-((n * 0.63) % 4.5)}s`);
    el.style.setProperty("--liquid-x-amp", `${xSign * (1.6 + (n % 3) * 0.7)}px`);
    el.style.setProperty("--liquid-y-amp", `${-(2.1 + (n % 4) * 0.55)}px`);
    el.style.setProperty("--liquid-r-dur", `${7.8 + (n % 5) * 0.65}s`);
    el.style.setProperty("--liquid-r-delay", `${-((n * 0.47) % 3.6)}s`);
    if (!el.matches("input, select, textarea")) {
      el.style.setProperty("--liquid-r-amp", `${rSign * (0.22 + (n % 4) * 0.08)}deg`);
    }
  });
  stripNestedChromeFloat(root);
}

function wireTileMotion() {
  document.addEventListener("pointermove", onTilePointerMove, { passive: true });
  document.addEventListener("pointerleave", () => {
    if (activeTiltCard) leaveTile(activeTiltCard);
  });
  document.addEventListener("pointerdown", onJigglePointerDown, { capture: true });
  document.addEventListener("pointermove", onJigglePointerMove, { capture: true, passive: true });
  document.addEventListener("pointerup", onJigglePointerUp, { capture: true });
  document.addEventListener("pointercancel", onJigglePointerUp, { capture: true });
  document.addEventListener("contextmenu", (event) => {
    if (jiggleTargetCard(event.target)) event.preventDefault();
  });
  const onReduce = () => {
    if (canMotion()) {
      startTileFloat(document.querySelectorAll(".library-card, .catalog-card"));
      startChromeFloat();
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

function posterDeleteButton(id, title) {
  const name = escapeAttr(title);
  return `<button type="button" class="poster-delete" data-delete="${escapeAttr(id)}" data-title="${name}" title="Delete ${name}" aria-label="Delete ${name}">
    <span aria-hidden="true">×</span>
  </button>`;
}

function posterOverlays(id, title, { thaw = false } = {}) {
  return `${freezerCornerButton(id, { thaw })}${posterDeleteButton(id, title)}`;
}

function wrapPosterMarkup(posterHtml, overlayHtml = "") {
  return `<div class="tile-scene"><div class="tile-float-wrap">${posterHtml}${overlayHtml}</div></div>`;
}

const JIGGLE_HOLD_MS = 520;
const JIGGLE_CLICK_GUARD_MS = 480;
const JIGGLE_AMP = { n: 0 };
let jiggleEnteredAt = 0;
let jiggleHoldTimer = 0;
let jiggleHoldStart = null;
let jiggleExitGen = 0;
let suppressNextCardClick = false;
let pendingDelete = null;
let deleteConfirmGen = 0;

const deleteVeil = document.getElementById("library-delete-veil");
const deleteCopy = document.getElementById("library-delete-copy");
const deleteCancel = document.getElementById("library-delete-cancel");
const deleteConfirm = document.getElementById("library-delete-confirm");

function findLocalLibraryTitle(id) {
  const movie = (library.movies || []).find((item) => item.id === id);
  if (movie) return { kind: "movie", item: movie };
  const show = (library.shows || []).find((item) => item.id === id);
  if (show) return { kind: "tv-show", item: show };
  const frozenMovie = (library.frozen?.movies || []).find((item) => item.id === id);
  if (frozenMovie) return { kind: "movie", item: frozenMovie };
  const frozenShow = (library.frozen?.shows || []).find((item) => item.id === id);
  if (frozenShow) return { kind: "tv-show", item: frozenShow };
  return null;
}

function jiggleTargetCard(node) {
  const card = node?.closest?.(".library-card");
  if (!card) return null;
  if (!card.closest("#library-list, #freezer-list")) return null;
  return card;
}

function clearJiggleHold() {
  if (jiggleHoldTimer) {
    window.clearTimeout(jiggleHoldTimer);
    jiggleHoldTimer = 0;
  }
  jiggleHoldStart = null;
}

function jiggleWraps() {
  return document.querySelectorAll("#library-list .library-card .tile-float-wrap, #freezer-list .library-card .tile-float-wrap");
}

function applyJiggleAmp(n) {
  const value = String(n);
  document.documentElement.style.setProperty("--jiggle-amp", value);
  jiggleWraps().forEach((wrap) => wrap.style.setProperty("--jiggle-amp", value));
}

function tweenJiggleAmp(to, duration) {
  if (!canMotion()) {
    JIGGLE_AMP.n = to;
    applyJiggleAmp(to);
    return Promise.resolve();
  }
  window.anime.remove(JIGGLE_AMP);
  return window
    .anime({
      targets: JIGGLE_AMP,
      n: to,
      duration,
      easing: "easeInOutSine",
      update() {
        applyJiggleAmp(JIGGLE_AMP.n);
      }
    })
    .finished.catch(() => {});
}

function syncJiggleMode() {
  const settling = document.documentElement.classList.contains("is-jiggle-settling");
  document.documentElement.classList.toggle("is-jiggling", jiggleMode || settling);
  document.querySelectorAll("#library-list .library-card, #freezer-list .library-card").forEach((card, i) => {
    const wrap = tileFloatWrap(card);
    if (!wrap) return;
    if (!jiggleMode && !settling) {
      wrap.style.removeProperty("--jiggle-delay");
      wrap.style.removeProperty("--jiggle-dur");
      wrap.style.removeProperty("--jiggle-amp");
      return;
    }
    wrap.style.setProperty("--jiggle-delay", `${-((i * 41) % 220)}ms`);
    wrap.style.setProperty("--jiggle-dur", `${0.3 + (i % 5) * 0.028}s`);
  });
}

function enterJiggle() {
  if (jiggleMode || splashBlocksTiles()) return;
  jiggleExitGen += 1;
  jiggleMode = true;
  jiggleEnteredAt = Date.now();
  suppressNextCardClick = true;
  if (activeTiltCard) leaveTile(activeTiltCard);
  applyJiggleAmp(JIGGLE_AMP.n);
  document.documentElement.classList.remove("is-jiggle-settling");
  syncJiggleMode();
  window.requestAnimationFrame(() => {
    if (!jiggleMode) return;
    tweenJiggleAmp(1, 420);
  });
  try {
    navigator.vibrate?.(10);
  } catch {
    // ignore
  }
  const buttons = document.querySelectorAll(".poster-delete");
  if (canMotion() && buttons.length) {
    window.anime.remove(buttons);
    window.anime.set(buttons, { scale: 0.72, opacity: 0 });
    window.anime({
      targets: buttons,
      scale: 1,
      opacity: 1,
      duration: 320,
      delay: window.anime.stagger(14),
      easing: "easeOutCubic"
    });
  }
}

function exitJiggle() {
  if (!jiggleMode && !document.documentElement.classList.contains("is-jiggle-settling")) return;
  hideDeleteConfirm();
  jiggleMode = false;
  const gen = ++jiggleExitGen;
  document.documentElement.classList.add("is-jiggle-settling");
  const buttons = document.querySelectorAll(".poster-delete");
  if (canMotion() && buttons.length) {
    window.anime.remove(buttons);
    window.anime({
      targets: buttons,
      scale: 0.84,
      opacity: 0,
      duration: 260,
      easing: "easeInQuad"
    });
  }
  tweenJiggleAmp(0, 360).then(() => {
    if (gen !== jiggleExitGen) return;
    document.documentElement.classList.remove("is-jiggling", "is-jiggle-settling");
    document.documentElement.style.removeProperty("--jiggle-amp");
    syncJiggleMode();
    startTileFloat(document.querySelectorAll("#library-list .library-card, #freezer-list .library-card"));
  });
}

function hideDeleteConfirm() {
  const gen = ++deleteConfirmGen;
  pendingDelete = null;
  if (!deleteVeil || deleteVeil.hidden) return;
  const card = deleteVeil.querySelector(".library-delete-card");
  if (!canMotion()) {
    deleteVeil.hidden = true;
    return;
  }
  window.anime.remove(deleteVeil);
  if (card) window.anime.remove(card);
  deleteVeil.style.pointerEvents = "none";
  window.anime({
    targets: deleteVeil,
    opacity: 0,
    duration: 180,
    easing: "easeInQuad",
    complete() {
      if (gen !== deleteConfirmGen) return;
      deleteVeil.hidden = true;
      deleteVeil.style.removeProperty("opacity");
      deleteVeil.style.removeProperty("pointer-events");
    }
  });
  if (card) {
    window.anime({
      targets: card,
      scale: 0.94,
      translateY: 10,
      opacity: 0,
      duration: 180,
      easing: "easeInQuad"
    });
  }
}

function askDeleteTitle(id, title, card) {
  if (!id) return;
  const match = findLocalLibraryTitle(id);
  const name = title || match?.item?.title || "this title";
  const isShow = match?.kind === "tv-show";
  pendingDelete = { id, title: name, card, kind: match?.kind || "movie" };
  if (deleteCopy) {
    deleteCopy.textContent = isShow
      ? `Delete “${name}” and all of its episodes from the library? This removes the files from the NAS.`
      : `Delete “${name}” from the library? This removes the video from the NAS.`;
  }
  if (!deleteVeil) {
    confirmDeleteTitle();
    return;
  }
  deleteConfirmGen += 1;
  deleteVeil.hidden = false;
  deleteVeil.style.pointerEvents = "none";
  const panel = deleteVeil.querySelector(".library-delete-card");
  if (!canMotion()) {
    deleteVeil.style.pointerEvents = "auto";
    return;
  }
  window.anime.remove(deleteVeil);
  if (panel) window.anime.remove(panel);
  window.anime.set(deleteVeil, { opacity: 0 });
  if (panel) window.anime.set(panel, { scale: 0.94, translateY: 12, opacity: 0 });
  window.anime({
    targets: deleteVeil,
    opacity: 1,
    duration: 220,
    easing: "easeOutQuad",
    complete() {
      deleteVeil.style.pointerEvents = "auto";
    }
  });
  if (panel) {
    window.anime({
      targets: panel,
      scale: 1,
      translateY: 0,
      opacity: 1,
      duration: 340,
      easing: "easeOutCubic"
    });
  }
}

function animateRemoveCard(card) {
  if (!card) return Promise.resolve();
  card.classList.add("is-deleting");
  card.style.pointerEvents = "none";
  const scene = card.querySelector(".tile-scene") || card;
  if (!canMotion()) {
    card.remove();
    return Promise.resolve();
  }
  window.anime.remove(scene);
  return window
    .anime({
      targets: scene,
      scale: 0.12,
      opacity: 0,
      translateY: 22,
      rotateZ: -8,
      duration: 420,
      easing: "easeInCubic"
    })
    .finished.catch(() => {})
    .then(() => {
      card.remove();
    });
}

async function confirmDeleteTitle() {
  const pending = pendingDelete;
  if (!pending?.id) return;
  hideDeleteConfirm();
  try {
    showStatus("Deleting…");
    const result = await postJson("/api/library/delete", { id: pending.id });
    await animateRemoveCard(pending.card);
    showStatus(result.message || `Deleted ${pending.title}`);
    await refreshLibrary({ skipMotion: true, skipRoute: true });
    if (jiggleMode) syncJiggleMode();
    const leftover = document.querySelectorAll("#library-list .library-card, #freezer-list .library-card");
    if (!leftover.length) exitJiggle();
  } catch (error) {
    pending.card?.classList.remove("is-deleting");
    showStatus(noteError(error.message || "Could not delete that title."), { error: true });
  }
}

function onJigglePointerDown(event) {
  if (event.button != null && event.button !== 0) return;
  if (splashBlocksTiles() || jiggleMode) return;
  if (event.target.closest(".poster-delete, .freezer-corner")) return;
  const card = jiggleTargetCard(event.target);
  if (!card) return;
  const startX = event.clientX;
  const startY = event.clientY;
  jiggleHoldStart = { x: startX, y: startY };
  clearJiggleHold();
  jiggleHoldTimer = window.setTimeout(() => {
    jiggleHoldTimer = 0;
    enterJiggle();
  }, JIGGLE_HOLD_MS);
}

function onJigglePointerMove(event) {
  if (!jiggleHoldTimer || !jiggleHoldStart) return;
  const dx = event.clientX - jiggleHoldStart.x;
  const dy = event.clientY - jiggleHoldStart.y;
  if (dx * dx + dy * dy > 120) clearJiggleHold();
}

function onJigglePointerUp() {
  clearJiggleHold();
}

function handleLibraryGridClick(event) {
  const deleteButton = event.target.closest(".poster-delete");
  if (deleteButton) {
    event.preventDefault();
    event.stopPropagation();
    askDeleteTitle(deleteButton.dataset.delete, deleteButton.dataset.title, deleteButton.closest(".library-card"));
    return true;
  }
  if (jiggleMode && event.target.closest(".library-card")) {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  if (suppressNextCardClick) {
    event.preventDefault();
    event.stopPropagation();
    suppressNextCardClick = false;
    return true;
  }
  return false;
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
    startChromeFloat(to);
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
        </button>`, posterOverlays(item.id, item.title, { thaw: true }));
  return `
    <article class="library-card" data-title-id="${escapeAttr(item.id)}">
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
    syncJiggleMode();
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
  syncJiggleMode();
}

function libraryCard(item, options = {}) {
  const frozen = Boolean(options.frozen || item.frozen);
  const isShow = item.kind === "tv-show" || options.isShow;
  const overlays = posterOverlays(item.id, item.title, { thaw: frozen });
  const name = escapeAttr(item.title);
  if (isShow) {
    return `
      <article class="library-card" data-title-id="${escapeAttr(item.id)}">
        ${wrapPosterMarkup(`<button type="button" class="poster" style="${posterStyle(item.posterId)}" data-show="${escapeAttr(item.id)}" title="${name}" aria-label="${name}">
          <em>Series</em>
        </button>`, overlays)}
      </article>`;
  }
  return `
    <article class="library-card" data-title-id="${escapeAttr(item.id)}">
      ${wrapPosterMarkup(`<button type="button" class="poster" style="${posterStyle(item.posterId)}" data-play="${item.id}" data-title="${name}" title="${name}" aria-label="${name}">
          <em data-kind="movie">Movie</em>
        </button>`, overlays)}
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
    syncJiggleMode();
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
  syncJiggleMode();
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
  if (changed && jiggleMode) exitJiggle();
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

function isPunishedMode() {
  try {
    if (window.CinaRipPunished && typeof window.CinaRipPunished.isOn === "function") {
      return Boolean(window.CinaRipPunished.isOn());
    }
  } catch {
    // ignore
  }
  return document.documentElement.classList.contains("is-punished");
}

function cursedNegInt() {
  return -1 - Math.floor(Math.random() * 9999);
}

function rollCursedLibraryStats() {
  cursedLibraryStats.counts = {
    movies: cursedNegInt(),
    series: cursedNegInt(),
    episodes: cursedNegInt(),
    freezer: cursedNegInt()
  };
}

function cursedLibrarySummaryText() {
  const counts = cursedLibraryStats.counts;
  if (!counts) return "";
  return `${counts.movies} movies · ${counts.series} series · ${counts.episodes} episodes · ${counts.freezer} in Freezer`;
}

function cursedImpossiblePercent() {
  const pick = Math.random();
  if (pick < 0.1) return "-999%";
  if (pick < 0.18) return "666%";
  if (pick < 0.26) return "NaN%";
  if (pick < 0.34) return "13.37%";
  if (pick < 0.4) return "NaN";
  if (pick < 0.46) return "???%";
  if (pick < 0.52) return "undefined%";
  if (pick < 0.6) return `${-1 - Math.floor(Math.random() * 9999)}%`;
  if (pick < 0.68) return `${101 + Math.floor(Math.random() * 899)}%`;
  if (pick < 0.76) return `${(Math.random() * 240 - 80).toFixed(2)}%`;
  if (pick < 0.84) return `${Math.floor(Math.random() * 9)}.${Math.floor(Math.random() * 90 + 10)}e${Math.floor(Math.random() * 6)}%`;
  if (pick < 0.92) return `${Math.floor(Math.random() * 180) - 40}% used`;
  return `${Math.random() < 0.5 ? "-" : ""}${Math.floor(Math.random() * 999)}%`;
}

function cursedBarWidth() {
  const pick = Math.random();
  if (pick < 0.12) return 0;
  if (pick < 0.22) return 1 + Math.random() * 7;
  if (pick < 0.34) return 100 + Math.random() * 88;
  if (pick < 0.46) return 88 + Math.random() * 24;
  if (pick < 0.58) return Math.random() * 100;
  if (pick < 0.7) return 6 + Math.random() * 18;
  if (pick < 0.82) return 140 + Math.random() * 50;
  if (pick < 0.9) return 50 + Math.random() * 20;
  return Math.random() < 0.5 ? 2 : 97;
}

function markCursedKeep(el) {
  if (el) el.setAttribute("data-cursed-keep", "");
}

function stampCursedFill(fill, width) {
  if (!fill) return;
  const state = meterStates.get(fill);
  if (state && typeof window.anime === "function") window.anime.remove(state);
  const next = Number(width);
  const cssWidth = Number.isFinite(next) ? Math.max(0, next) : Math.random() * 160;
  fill.style.width = `${cssWidth.toFixed(2)}%`;
  fill.style.transition = "none";
  if (state) state.value = Math.min(100, cssWidth);
  else meterStates.set(fill, { value: Math.min(100, cssWidth) });
  const meter = fill.closest(".plasma-meter, .queue-item-meter");
  if (meter) meter.classList.toggle("is-cursed-overflow", cssWidth > 100);
}

function cursedStatsWereOverwritten() {
  if (storageLabel && storageLabel.textContent !== cursedLibraryStats.lastStorageLabel) return true;
  if (jobLabel && cursedLibraryStats.lastJobLabel && jobLabel.textContent !== cursedLibraryStats.lastJobLabel) return true;
  if (downloadQueueSummary && cursedLibraryStats.lastQueueLabel && downloadQueueSummary.textContent !== cursedLibraryStats.lastQueueLabel) return true;
  if (summaryEl && cursedLibraryStats.counts && summaryEl.textContent !== cursedLibraryStats.lastSummary) return true;
  return false;
}

function paintCursedCounts() {
  if (!isPunishedMode()) return;
  if (!cursedLibraryStats.counts) rollCursedLibraryStats();
  cursedLibraryStats.applying = true;
  try {
    markCursedKeep(summaryEl);
    if (summaryEl) {
      const text = cursedLibrarySummaryText();
      summaryEl.textContent = text;
      cursedLibraryStats.lastSummary = text;
    }
  } finally {
    cursedLibraryStats.applying = false;
  }
}

function paintCursedGlitch() {
  if (!isPunishedMode()) return;
  cursedLibraryStats.applying = true;
  try {
    markCursedKeep(storageLabel);
    markCursedKeep(jobLabel);
    markCursedKeep(downloadQueueSummary);
    if (storageLabel) {
      if (typeof window.anime === "function" && storageLabel._count) window.anime.remove(storageLabel._count);
      const text = cursedImpossiblePercent();
      storageLabel.textContent = text;
      cursedLibraryStats.lastStorageLabel = text;
      if (storageLabel._count) storageLabel._count.value = -999;
    }
    if (jobLabel) {
      const text = cursedImpossiblePercent();
      jobLabel.textContent = text;
      cursedLibraryStats.lastJobLabel = text;
    }
    if (downloadQueueSummary) {
      const text = cursedImpossiblePercent();
      downloadQueueSummary.textContent = text;
      cursedLibraryStats.lastQueueLabel = text;
    }
    if (storageMeter) setMeterTone(storageMeter, "critical");
    if (jobMeter) {
      jobMeter.classList.add("is-running", "is-active");
      setMeterTone(jobMeter, "critical");
    }
    if (queueMeter) {
      queueMeter.hidden = false;
      queueMeter.classList.add("is-running", "is-active");
      setMeterTone(queueMeter, "critical");
    }
    if (jobCard) {
      jobCard.hidden = false;
      jobCardVisible = true;
    }
    stampCursedFill(storageBar, cursedBarWidth());
    stampCursedFill(jobBar, cursedBarWidth());
    stampCursedFill(queueBar, cursedBarWidth());
    document.querySelectorAll(".queue-item-fill").forEach((fill) => stampCursedFill(fill, cursedBarWidth()));
  } finally {
    cursedLibraryStats.applying = false;
  }
}

function scheduleCursedGlitch() {
  if (cursedLibraryStats.glitchTimer) window.clearTimeout(cursedLibraryStats.glitchTimer);
  const reduced = reduceMotionMq.matches;
  const wait = reduced ? 140 + Math.floor(Math.random() * 90) : 48 + Math.floor(Math.random() * 90);
  cursedLibraryStats.glitchTimer = window.setTimeout(() => {
    cursedLibraryStats.glitchTimer = 0;
    if (!isPunishedMode()) {
      stopCursedLibraryStats();
      return;
    }
    paintCursedGlitch();
    scheduleCursedGlitch();
  }, wait);
}

function scheduleCursedLibraryReroll() {
  if (cursedLibraryStats.timer) window.clearTimeout(cursedLibraryStats.timer);
  cursedLibraryStats.timer = window.setTimeout(() => {
    cursedLibraryStats.timer = 0;
    if (!isPunishedMode()) {
      stopCursedLibraryStats();
      return;
    }
    rollCursedLibraryStats();
    paintCursedCounts();
    scheduleCursedLibraryReroll();
  }, 2800 + Math.floor(Math.random() * 3400));
}

function startCursedLibraryStats() {
  markCursedKeep(storageLabel);
  markCursedKeep(summaryEl);
  markCursedKeep(jobLabel);
  markCursedKeep(downloadQueueSummary);
  if (!cursedLibraryStats.on) {
    cursedLibraryStats.on = true;
    rollCursedLibraryStats();
    scheduleCursedLibraryReroll();
    scheduleCursedGlitch();
  }
  paintCursedCounts();
  paintCursedGlitch();
  if (!cursedLibraryStats.observer && typeof MutationObserver === "function") {
    cursedLibraryStats.observer = new MutationObserver(() => {
      if (cursedLibraryStats.applying || !cursedLibraryStats.on || !isPunishedMode()) return;
      if (!cursedStatsWereOverwritten()) return;
      paintCursedCounts();
      paintCursedGlitch();
    });
    const opts = { characterData: true, childList: true, subtree: true };
    [storageLabel, summaryEl, jobLabel, downloadQueueSummary].forEach((el) => {
      if (el) cursedLibraryStats.observer.observe(el, opts);
    });
  }
}

function stopCursedLibraryStats() {
  if (cursedLibraryStats.timer) {
    window.clearTimeout(cursedLibraryStats.timer);
    cursedLibraryStats.timer = 0;
  }
  if (cursedLibraryStats.glitchTimer) {
    window.clearTimeout(cursedLibraryStats.glitchTimer);
    cursedLibraryStats.glitchTimer = 0;
  }
  const wasOn = cursedLibraryStats.on;
  cursedLibraryStats.on = false;
  cursedLibraryStats.counts = null;
  cursedLibraryStats.lastStorageLabel = "";
  cursedLibraryStats.lastJobLabel = "";
  cursedLibraryStats.lastQueueLabel = "";
  cursedLibraryStats.lastSummary = "";
  document.querySelectorAll(".is-cursed-overflow").forEach((el) => el.classList.remove("is-cursed-overflow"));
  [storageBar, jobBar, queueBar].forEach((fill) => {
    if (fill) fill.style.removeProperty("transition");
  });
  document.querySelectorAll(".queue-item-fill").forEach((fill) => fill.style.removeProperty("transition"));
  if (wasOn) {
    if (storageLabel && storageLabel._count) storageLabel._count.value = 0;
    refreshLibrary({ skipRoute: true, skipMotion: true }).catch(() => {});
    refreshJobs().catch(() => {});
  }
}

function syncCursedLibraryStats() {
  if (isPunishedMode()) startCursedLibraryStats();
  else if (cursedLibraryStats.on) stopCursedLibraryStats();
}

function pickCursedFailLine() {
  if (Math.random() < 0.42) return CURSED_FAIL_LINES[0];
  return CURSED_FAIL_LINES[1 + Math.floor(Math.random() * (CURSED_FAIL_LINES.length - 1))];
}

function recountQueueItems(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    total: list.length,
    pending: list.filter((item) => item.status === "pending").length,
    done: list.filter((item) => item.status === "done").length,
    failed: list.filter((item) => item.status === "failed").length,
    movies: list.filter((item) => item.kind !== "episode").length,
    episodes: list.filter((item) => item.kind === "episode").length
  };
}

function shuffleCursedSpecs() {
  const copy = CURSED_JOB_TITLES.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

function makeCursedGraveItem(spec, index) {
  const id = `cursed-grave-${index}-${Math.random().toString(16).slice(2, 6)}`;
  cursedQueue.syntheticIds.add(id);
  cursedQueue.failedIds.add(id);
  heardFailedIds.add(id);
  const kind = spec.kind === "episode" ? "episode" : "movie";
  const item = {
    id,
    kind,
    title: spec.title,
    movieUrl: `/movie/cursed/${index}`,
    destination: "nas",
    status: "failed",
    error: pickCursedFailLine(),
    passRetries: 1 + Math.floor(Math.random() * 6),
    addedAt: Date.now() - Math.floor(Math.random() * 86400000),
    progress: 28 + Math.floor(Math.random() * 67),
    qualityLabel: "1080p",
    posterUrl: null
  };
  if (kind === "episode") {
    item.showTitle = String(spec.title.split(" · ")[0] || "TV Show");
    item.season = 1;
    item.episode = index + 1;
    item.episodeTitle = spec.title;
  }
  return item;
}

function buildCursedGraveyard() {
  const specs = shuffleCursedSpecs();
  const items = [];
  for (let i = 0; i < CURSED_GRAVEYARD_SIZE; i += 1) {
    const spec = specs[i % specs.length];
    const title = i >= specs.length ? `${spec.title} (${i + 1})` : spec.title;
    items.push(makeCursedGraveItem({ ...spec, title }, i));
  }
  const pinned = items[Math.floor(Math.random() * items.length)];
  if (pinned) pinned.error = "why would you do this?";
  return items;
}

function ensureCursedGraveyard() {
  if (!isPunishedMode()) return;
  if (cursedQueue.running && cursedQueue.items.length) {
    cursedQueue.active = true;
    return;
  }
  const failedCount = cursedQueue.items.filter((item) => item.status === "failed").length;
  const tooMany = cursedQueue.items.length > CURSED_GRAVEYARD_SIZE;
  if (cursedQueue.active && failedCount >= CURSED_GRAVEYARD_MIN && !tooMany) return;
  cursedQueue.syntheticIds.clear();
  cursedQueue.failedIds.clear();
  cursedQueue.items = buildCursedGraveyard();
  cursedQueue.active = true;
  cursedQueue.current = null;
  cursedQueue.currentId = null;
}

function refillCursedGraveyard() {
  cursedQueue.running = false;
  cursedQueue.gen += 1;
  stopCursedTimers();
  cursedQueue.syntheticIds.clear();
  cursedQueue.failedIds.clear();
  cursedQueue.items = buildCursedGraveyard();
  cursedQueue.active = true;
  cursedQueue.current = null;
  cursedQueue.currentId = null;
  paintCursedQueue();
}

function pickCursedHopeItem() {
  ensureCursedGraveyard();
  const failed = cursedQueue.items.filter((item) => item.status === "failed");
  const item = failed[Math.floor(Math.random() * failed.length)] || cursedQueue.items[0];
  if (!item) return null;
  heardFailedIds.delete(item.id);
  cursedQueue.failedIds.delete(item.id);
  item.status = "pending";
  item.error = null;
  item.progress = 0;
  cursedQueue.items = [item, ...cursedQueue.items.filter((row) => row.id !== item.id)];
  return item;
}

function stopCursedTimers() {
  cursedQueue.timers.splice(0).forEach((id) => window.clearTimeout(id));
}

function dropCursedQueue() {
  cursedQueue.gen += 1;
  cursedQueue.active = false;
  cursedQueue.running = false;
  cursedQueue.items = [];
  cursedQueue.current = null;
  cursedQueue.currentId = null;
  cursedQueue.syntheticIds.clear();
  cursedQueue.failedIds.clear();
  stopCursedTimers();
}

function buildCursedSnapshot() {
  return {
    running: cursedQueue.running,
    cancelRequested: false,
    currentId: cursedQueue.currentId,
    current: cursedQueue.current,
    items: cursedQueue.items.map((item) => ({ ...item })),
    counts: recountQueueItems(cursedQueue.items)
  };
}

function paintCursedQueue() {
  const snapshot = buildCursedSnapshot();
  lastQueueSnapshot = snapshot;
  renderJobs(snapshot);
}

function restoreRealQueue() {
  dropCursedQueue();
  renderJobs(realQueueSnapshot);
}

function syncCursedQueue() {
  if (isPunishedMode()) {
    ensureCursedGraveyard();
    paintCursedQueue();
    return;
  }
  if (!cursedQueue.active) {
    updateQueueControls(lastQueueSnapshot);
    return;
  }
  restoreRealQueue();
  refreshJobs().catch(() => {});
}

function cursedWait(ms, gen) {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      cursedQueue.timers = cursedQueue.timers.filter((id) => id !== timer);
      resolve(cursedQueue.gen === gen && cursedQueue.running && isPunishedMode());
    }, ms);
    cursedQueue.timers.push(timer);
  });
}

function failCursedItem(item, { silent = false } = {}) {
  if (!item) return;
  item.status = "failed";
  item.error = pickCursedFailLine();
  item.progress = Math.max(Number(item.progress) || 0, 76);
  cursedQueue.failedIds.add(item.id);
  if (silent) {
    heardFailedIds.add(item.id);
    return;
  }
  if (!heardFailedIds.has(item.id)) {
    heardFailedIds.add(item.id);
    window.CinaRipAudio?.error();
  }
}

async function runCursedItem(item, gen) {
  item.status = "loading";
  item.progress = 8;
  cursedQueue.currentId = item.id;
  cursedQueue.current = { id: item.id, title: item.title, phase: "Finding LoadShare link...", percent: 8 };
  paintCursedQueue();
  if (!(await cursedWait(760 + Math.floor(Math.random() * 520), gen))) return;

  item.status = "downloading";
  item.progress = 16;
  cursedQueue.current = { id: item.id, title: item.title, phase: "Downloading 1080p...", percent: 16 };
  paintCursedQueue();

  const peak = 74 + Math.floor(Math.random() * 9);
  while (item.progress < peak) {
    if (!(await cursedWait(170 + Math.floor(Math.random() * 170), gen))) return;
    item.progress = Math.min(peak, item.progress + 3 + Math.floor(Math.random() * 5));
    const phase = item.progress >= 62 && item.progress < 70 ? "Writing to NAS..." : "Downloading 1080p...";
    cursedQueue.current = { id: item.id, title: item.title, phase, percent: item.progress };
    paintCursedQueue();
  }

  if (!(await cursedWait(680 + Math.floor(Math.random() * 460), gen))) return;
  failCursedItem(item);
  cursedQueue.currentId = null;
  cursedQueue.current = null;
  paintCursedQueue();
  await cursedWait(240, gen);
}

async function startCursedQueue() {
  if (cursedQueue.running || !isPunishedMode()) return;
  ensureCursedGraveyard();
  const hope = pickCursedHopeItem();
  if (!hope) return;
  cursedQueue.running = true;
  cursedQueue.gen += 1;
  const gen = cursedQueue.gen;
  stopCursedTimers();
  cursedQueue.active = true;
  playedQueueFinish = true;
  paintCursedQueue();
  await runCursedItem(hope, gen);
  if (cursedQueue.gen !== gen) return;
  cursedQueue.running = false;
  cursedQueue.current = null;
  cursedQueue.currentId = null;
  ensureCursedGraveyard();
  paintCursedQueue();
}

function stopCursedQueue() {
  const current = cursedQueue.items.find((item) => item.id === cursedQueue.currentId);
  cursedQueue.running = false;
  cursedQueue.gen += 1;
  stopCursedTimers();
  if (current && current.status !== "failed") failCursedItem(current);
  cursedQueue.current = null;
  cursedQueue.currentId = null;
  ensureCursedGraveyard();
  paintCursedQueue();
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
    if (isPunishedMode() && cursedQueue.syntheticIds.has(itemId)) {
      cursedQueue.items = cursedQueue.items.filter((item) => item.id !== itemId);
      cursedQueue.syntheticIds.delete(itemId);
      cursedQueue.failedIds.delete(itemId);
      if (cursedQueue.currentId === itemId) {
        cursedQueue.currentId = null;
        cursedQueue.current = null;
        cursedQueue.running = false;
        cursedQueue.gen += 1;
        stopCursedTimers();
      }
      if (cursedQueue.items.filter((item) => item.status === "failed").length < CURSED_GRAVEYARD_MIN) {
        ensureCursedGraveyard();
      }
      paintCursedQueue();
      return;
    }
    if (cursedQueue.active) return;
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

  const showMeter =
    item.status === "downloading" ||
    item.status === "loading" ||
    isCurrent ||
    isPunishedMode() ||
    (isPunishedMode() && item.status === "failed" && Number(item.progress) > 0);
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
    const fill = meter.querySelector(".queue-item-fill");
    if (isPunishedMode()) stampCursedFill(fill, cursedBarWidth());
    else animateMeterFill(fill, queueItemProgress(item, snapshot), { duration: 420 });
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
  if (downloadQueueSummary && !isPunishedMode()) downloadQueueSummary.textContent = formatQueueSummary(snapshot);
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
  } else {
    startChromeFloat(downloadQueueList);
  }
}

function updateQueueControls(snapshot) {
  const running = Boolean(snapshot?.running);
  const hasWork = (snapshot?.counts?.pending || 0) > 0 || (snapshot?.counts?.failed || 0) > 0;
  const cursedCanStart = isPunishedMode() && !running;
  if (startDownloadQueueButton) startDownloadQueueButton.disabled = running || !(hasWork || cursedCanStart);
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
  if (isPunishedMode()) {
    if (queueMeter) {
      queueMeter.hidden = false;
      queueMeter.classList.add("is-running", "is-active");
    }
    jobCard.hidden = false;
    jobCardVisible = true;
    if (jobMeter) {
      jobMeter.classList.add("is-running", "is-active");
    }
    if (current || active.length) {
      jobTitle.textContent = current?.title || active[0]?.title || "Download";
      jobPhase.textContent = current?.phase || `${active.length} item${active.length === 1 ? "" : "s"} waiting`;
    }
    return;
  }
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
  if (!isPunishedMode() && cursedQueue.active) dropCursedQueue();
  const data = await getJson("/api/downloads");
  realQueueSnapshot = data;
  const items = data.items || [];
  const doneCount = items.filter((item) => item.status === "done").length;
  if (doneCount > lastDoneCount) refreshLibrary().catch(() => {});
  lastDoneCount = doneCount;

  if (isPunishedMode()) {
    if (!cursedQueue.running) ensureCursedGraveyard();
    paintCursedQueue();
    lastQueueRunning = cursedQueue.running;
    return;
  }

  const wasRunning = lastQueueRunning;
  renderJobs(data);
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

async function refreshLibrary(options = {}) {
  const [health, lib] = await Promise.all([getJson("/api/health"), getJson("/api/library")]);
  library = lib;
  renderHealthDiag(health);
  if (health.videoRootExists) {
    if (statusEl?.dataset.kind === "health") hideStatus();
  } else {
    showStatus("Videos folder is not mounted", { error: true, kind: "health" });
  }

  const frozenCount = (lib.frozen?.movieCount || 0) + (lib.frozen?.showCount || 0);
  if (isPunishedMode()) {
    startCursedLibraryStats();
  } else {
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
  }

  renderLibrary({ skipMotion: options.skipMotion });
  renderFreezerPage({ skipMotion: options.skipMotion });
  if (!options.skipRoute) route();
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
  if (handleLibraryGridClick(event)) return;
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
    if (handleLibraryGridClick(event)) return;
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
  if (isPunishedMode()) {
    startCursedQueue().catch(() => {});
    return;
  }
  try {
    const result = await postJson("/api/downloads/start");
    if (!result.ok) searchStatus.textContent = noteError(result.error || "Could not start the queue.");
    await refreshJobs();
  } catch (error) {
    searchStatus.textContent = noteError(error.message || "Could not start the queue.");
  }
});

stopDownloadQueueButton.addEventListener("click", async () => {
  if (cursedQueue.running) {
    stopCursedQueue();
    return;
  }
  try {
    await postJson("/api/downloads/stop");
    await refreshJobs();
  } catch (error) {
    searchStatus.textContent = noteError(error.message || "Could not stop the queue.");
  }
});

clearDownloadQueueButton.addEventListener("click", async () => {
  if (isPunishedMode()) {
    refillCursedGraveyard();
    return;
  }
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
if (deleteCancel) deleteCancel.addEventListener("click", () => hideDeleteConfirm());
if (deleteConfirm) deleteConfirm.addEventListener("click", () => confirmDeleteTitle());
if (deleteVeil) {
  deleteVeil.addEventListener("click", (event) => {
    if (event.target === deleteVeil) hideDeleteConfirm();
  });
}
document.addEventListener("click", (event) => {
  if (!jiggleMode) return;
  if (pendingDelete || (deleteVeil && !deleteVeil.hidden)) return;
  if (Date.now() - jiggleEnteredAt < JIGGLE_CLICK_GUARD_MS) return;
  if (event.target.closest(".library-card, .poster-delete, .library-delete-veil")) return;
  exitJiggle();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (pendingDelete || (deleteVeil && !deleteVeil.hidden)) {
    event.preventDefault();
    hideDeleteConfirm();
    return;
  }
  if (jiggleMode) {
    event.preventDefault();
    exitJiggle();
  }
});
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
  window.setTimeout(() => startChromeFloat(), 720);
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
      if (hit.classList.contains("liquid-idle")) {
        const state = { s: 0.95 };
        hit.style.setProperty("--press-s", "0.95");
        window.anime.remove(state);
        window.anime({
          targets: state,
          s: 1,
          duration: 180,
          easing: "easeOutQuad",
          update() {
            hit.style.setProperty("--press-s", String(state.s));
          },
          complete() {
            hit.style.setProperty("--press-s", "1");
          }
        });
        return;
      }
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
  if (typeof window.anime === "function") {
    window.anime.remove(splashEl);
    const inner = splashEl.querySelector(".splash-inner");
    if (inner) window.anime.remove(inner);
  }
  splashEl.hidden = true;
  splashEl.setAttribute("aria-hidden", "true");
  splashEl.setAttribute("aria-busy", "false");
  splashEl.style.pointerEvents = "none";
  splashEl.style.opacity = "0";
  splashEl.style.visibility = "hidden";
  const inner = splashEl.querySelector(".splash-inner");
  if (inner) {
    inner.style.removeProperty("opacity");
    inner.style.removeProperty("transform");
    inner.style.removeProperty("will-change");
  }
}

function pinSplashLocked() {
  return document.documentElement.classList.contains("is-pin-locked");
}

function splashInner() {
  return splashEl?.querySelector(".splash-inner") || null;
}

function forgetSplashDismissed() {
  splashDismissed = false;
  try {
    sessionStorage.removeItem(SPLASH_SESSION_KEY);
  } catch {
    // ignore quota / private mode
  }
}

function afterSplashGone(options = {}) {
  startTileFloat(document.querySelectorAll(".library-card, .catalog-card"));
  startChromeFloat();
  if (options.refresh === false) return;
  refreshLibrary().catch((error) => {
    showStatus(noteError(error.message || "Could not reach the NAS library."), { error: true, kind: "health" });
  });
  refreshJobs().catch(() => {});
  refreshAccount().catch(() => {});
}

function suppressSplash() {
  if (pinSplashLocked()) return;
  rememberSplashDismissed();
  hideSplashOverlay();
}

function dismissSplash(options = {}) {
  if (pinSplashLocked()) return Promise.resolve();
  if (splashDismissed && splashEl?.hidden) return Promise.resolve();
  rememberSplashDismissed();
  siteAuth.loggedIn = true;
  const refresh = options.refresh !== false;
  if (!splashEl || splashEl.hidden) {
    afterSplashGone({ refresh });
    return Promise.resolve();
  }
  splashEl.style.pointerEvents = "none";
  splashEl.setAttribute("aria-busy", "false");
  const inner = splashInner();
  if (!canMotion()) {
    hideSplashOverlay();
    afterSplashGone({ refresh });
    return Promise.resolve();
  }
  if (typeof window.anime === "function") {
    window.anime.remove(splashEl);
    if (inner) window.anime.remove(inner);
  }
  splashEl.style.willChange = "opacity";
  if (inner) inner.style.willChange = "opacity, transform";
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(safety);
      hideSplashOverlay();
      afterSplashGone({ refresh });
      resolve();
    };
    const safety = window.setTimeout(finish, 780);
    if (inner) {
      window.anime({
        targets: inner,
        opacity: 0,
        scale: 0.94,
        translateY: -18,
        duration: 460,
        easing: "easeInCubic"
      });
    }
    window.anime({
      targets: splashEl,
      opacity: 0,
      duration: 620,
      easing: "easeInCubic",
      complete: finish
    });
  });
}

function presentPinSplash(options = {}) {
  if (!splashEl) return Promise.resolve();
  forgetSplashDismissed();
  siteAuth.loggedIn = false;
  const pinInput = document.getElementById("splash-pin");
  const pinForm = document.getElementById("splash-pin-form");
  if (pinForm) pinForm.reset();
  if (pinInput) {
    pinInput.value = "";
    pinInput.classList.remove("has-value");
  }
  const authError = document.getElementById("splash-auth-error");
  if (authError) {
    authError.textContent = "";
    authError.hidden = true;
  }
  const animate = options.animate === true;
  const inner = splashInner();
  if (animate && canMotion()) {
    splashEl.style.opacity = "0";
    if (inner) {
      inner.style.opacity = "0";
      inner.style.transform = "translateY(22px) scale(0.92)";
    }
  }
  splashEl.hidden = false;
  splashEl.removeAttribute("aria-hidden");
  splashEl.setAttribute("aria-busy", "false");
  splashEl.style.visibility = "visible";
  splashEl.style.display = "";
  splashEl.style.pointerEvents = "auto";
  if (!animate || !canMotion()) {
    splashEl.style.opacity = "1";
    if (inner) {
      inner.style.removeProperty("opacity");
      inner.style.removeProperty("transform");
    }
    document.getElementById("splash-pin")?.focus();
    return Promise.resolve();
  }
  if (typeof window.anime === "function") {
    window.anime.remove(splashEl);
    if (inner) window.anime.remove(inner);
  }
  window.anime.set(splashEl, { opacity: 0 });
  if (inner) window.anime.set(inner, { opacity: 0, scale: 0.92, translateY: 22 });
  splashEl.style.willChange = "opacity";
  if (inner) inner.style.willChange = "opacity, transform";
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(safety);
      splashEl.style.removeProperty("will-change");
      if (inner) {
        inner.style.removeProperty("will-change");
        inner.style.removeProperty("opacity");
        inner.style.removeProperty("transform");
      }
      document.getElementById("splash-pin")?.focus();
      resolve();
    };
    const safety = window.setTimeout(finish, 860);
    window.anime({
      targets: splashEl,
      opacity: 1,
      duration: 560,
      easing: "easeOutCubic"
    });
    if (!inner) {
      window.setTimeout(finish, 560);
      return;
    }
    window.anime({
      targets: inner,
      opacity: 1,
      scale: 1,
      translateY: 0,
      duration: 680,
      delay: 40,
      easing: "easeOutCubic",
      complete: finish
    });
  });
}

async function bootLibrarySplash() {
  try {
    const session = await getJson("/api/auth/session");
    siteAuth.loggedIn = Boolean(session?.loggedIn);
  } catch {
    siteAuth.loggedIn = false;
  }

  if (!siteAuth.loggedIn) {
    splashDismissed = false;
    return;
  }

  const started = performance.now();
  try {
    await refreshLibrary();
  } catch (error) {
    showStatus(noteError(error.message || "Could not reach the NAS library."), { error: true, kind: "health" });
  }
  if (splashDismissed || splashDismissedThisSession()) {
    suppressSplash();
    return;
  }
  const remain = Math.max(0, SPLASH_MIN_MS - (performance.now() - started));
  if (remain) await new Promise((resolve) => window.setTimeout(resolve, remain));
  if (pinSplashLocked()) return;
  dismissSplash({ refresh: false });
}

window.CinaRipSplash = {
  suppress: suppressSplash,
  enter: dismissSplash,
  lock: presentPinSplash
};

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

new MutationObserver(() => {
  syncCursedLibraryStats();
  syncCursedQueue();
}).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

syncCursedLibraryStats();
syncCursedQueue();

setInterval(() => {
  if (pinSplashLocked()) return;
  refreshJobs().catch(() => {});
  if (isFreezerHash()) refreshLibrary().catch(() => {});
}, 2000);
