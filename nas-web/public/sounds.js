(() => {
  const SELECT_SRC = "/sounds/Select.mp3";
  const ERROR_SRC = "/sounds/error.mp3";
  const QUEUE_DONE_SRC = "/sounds/queuefinished.mp3";
  const LIBRARY_SRC = "/sounds/librarysfx.mp3";
  const ADD_QUEUE_SRC = "/sounds/add-to-queue.mp3";
  const READY_SRC = "/sounds/ready-to-watch.mp3";
  const MUSIC_SRC = "/sounds/abyssal-starry-sky-slowed.mp3?v=4";

  const MUSIC_VOLUME = 0.34;
  const SELECT_GAIN = 2.8;
  const ERROR_GAIN = 3.0;
  const QUEUE_GAIN = 3.0;
  const LIBRARY_GAIN = 2.8;
  const ADD_QUEUE_GAIN = 2.8;
  const READY_GAIN = 2.8;
  const FADE_OUT_MS = 2400;
  const FADE_IN_MS = 1800;

  const MUSIC_MUTE_KEY = "cinarip.music.muted";
  const AMBIENT_RATE = 0.65;
  const AMBIENT_SCALE = 1.25;

  let unlocked = false;
  let videoOpen = false;
  let musicMuted = false;
  let music = null;
  let audioCtx = null;
  let fadeToken = 0;
  let lastSelectAt = 0;
  let ambientLayoutTick = 0;
  const sfxBuffers = Object.create(null);
  const sfxFetches = Object.create(null);

  function ambientVideo() {
    return document.getElementById("ambient-video");
  }

  function applyAmbientRate(el) {
    if (!el) return;
    el.loop = true;
    if (el.playbackRate !== AMBIENT_RATE) {
      try {
        el.playbackRate = AMBIENT_RATE;
      } catch {
        // Some engines throw if rate isn't ready yet; play() handler retries.
      }
    }
  }

  function layoutAmbientVideo() {
    const el = ambientVideo();
    if (!el) return;
    const vv = window.visualViewport;
    const vw = Math.max(
      window.innerWidth || 0,
      document.documentElement ? document.documentElement.clientWidth : 0,
      vv && vv.width ? vv.width : 0
    );
    const vh = Math.max(
      window.innerHeight || 0,
      document.documentElement ? document.documentElement.clientHeight : 0,
      vv && vv.height ? vv.height : 0
    );
    el.style.width = `${Math.ceil(vw)}px`;
    el.style.height = `${Math.ceil(vh)}px`;
    el.style.maxWidth = "none";
    el.style.maxHeight = "none";
    el.style.transform = `scale(${AMBIENT_SCALE})`;
  }

  function scheduleAmbientLayout() {
    if (ambientLayoutTick) return;
    ambientLayoutTick = requestAnimationFrame(() => {
      ambientLayoutTick = 0;
      layoutAmbientVideo();
    });
  }

  function setAmbientPlaying(shouldPlay) {
    const el = ambientVideo();
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.loop = true;
    layoutAmbientVideo();
    applyAmbientRate(el);
    if (shouldPlay) {
      const play = el.play();
      if (play && typeof play.then === "function") {
        play.then(() => applyAmbientRate(el)).catch(() => {});
      }
      applyAmbientRate(el);
      return;
    }
    el.pause();
    applyAmbientRate(el);
  }

  function getAudioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function clonePlay(src, gainValue) {
    const clip = new Audio(src);
    clip.preload = "auto";
    clip.volume = 1;
    const ctx = getAudioContext();
    if (ctx) {
      const source = ctx.createMediaElementSource(clip);
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      source.connect(gain);
      gain.connect(ctx.destination);
      clip.addEventListener("ended", () => {
        source.disconnect();
        gain.disconnect();
      }, { once: true });
    }
    const play = clip.play();
    if (play && typeof play.catch === "function") play.catch(() => {});
  }

  function fetchSfx(src) {
    if (!sfxFetches[src]) {
      sfxFetches[src] = fetch(src).then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.arrayBuffer();
      });
    }
    return sfxFetches[src];
  }

  function decodeSfx(src, key) {
    if (sfxBuffers[key]) return Promise.resolve(sfxBuffers[key]);
    const ctx = getAudioContext();
    if (!ctx) return Promise.resolve(null);
    return fetchSfx(src)
      .then((bytes) => ctx.decodeAudioData(bytes.slice(0)))
      .then((buffer) => {
        sfxBuffers[key] = buffer;
        return buffer;
      })
      .catch(() => null);
  }

  function playSfx(src, key, gainValue) {
    const ctx = getAudioContext();
    const buffer = sfxBuffers[key];
    if (ctx && buffer) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
      return;
    }
    clonePlay(src, gainValue);
    decodeSfx(src, key);
  }

  function preloadSfx() {
    decodeSfx(SELECT_SRC, "select");
    decodeSfx(ERROR_SRC, "error");
    decodeSfx(QUEUE_DONE_SRC, "queue");
    decodeSfx(LIBRARY_SRC, "library");
    decodeSfx(ADD_QUEUE_SRC, "addQueue");
    decodeSfx(READY_SRC, "ready");
  }

  function ensureMusic() {
    if (music) return music;
    music = document.getElementById("bgm");
    if (!music) {
      music = new Audio();
      music.src = MUSIC_SRC;
      try {
        music.load();
      } catch {
        // Ignore engines that reject load() before a src is ready.
      }
    } else if (!music.getAttribute("src") && !music.src) {
      music.src = MUSIC_SRC;
    }
    music.preload = "auto";
    music.loop = true;
    music.volume = 0;
    return music;
  }

  function fadeTo(target, durationMs) {
    const el = ensureMusic();
    const token = ++fadeToken;
    const from = el.volume;
    const startedAt = performance.now();
    if (target > 0 && el.paused) {
      const play = el.play();
      if (play && typeof play.catch === "function") play.catch(() => {});
    }
    function frame(now) {
      if (token !== fadeToken) return;
      const t = Math.min(1, (now - startedAt) / Math.max(1, durationMs));
      const eased = t * t * (3 - 2 * t);
      el.volume = Math.max(0, Math.min(1, from + (target - from) * eased));
      if (t < 1) {
        requestAnimationFrame(frame);
        return;
      }
      el.volume = target;
      if (target <= 0.001) {
        el.volume = 0;
      }
    }
    requestAnimationFrame(frame);
  }

  function startMusicIfIdle() {
    if (!unlocked || videoOpen || musicMuted) return;
    fadeTo(MUSIC_VOLUME, FADE_IN_MS);
  }

  function syncMuteButton() {
    const btn = document.getElementById("music-mute");
    if (!btn) return;
    const label = musicMuted ? "Unmute music" : "Mute music";
    btn.classList.toggle("is-muted", musicMuted);
    btn.setAttribute("aria-pressed", musicMuted ? "true" : "false");
    btn.setAttribute("aria-label", label);
    btn.title = label;
    const img = btn.querySelector("img");
    if (img) {
      img.src = musicMuted ? "/icons/music-off.png" : "/icons/music-on.png";
    }
  }

  function setMusicMuted(muted) {
    musicMuted = Boolean(muted);
    try {
      localStorage.setItem(MUSIC_MUTE_KEY, musicMuted ? "1" : "0");
    } catch {
      // ignore quota / private mode
    }
    syncMuteButton();
    unlock();
    if (musicMuted) {
      fadeTo(0, FADE_OUT_MS);
      return;
    }
    if (!videoOpen) fadeTo(MUSIC_VOLUME, FADE_IN_MS);
  }

  function restoreMute() {
    try {
      musicMuted = localStorage.getItem(MUSIC_MUTE_KEY) === "1";
    } catch {
      musicMuted = false;
    }
    syncMuteButton();
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    ensureMusic();
    getAudioContext();
    preloadSfx();
    if (!videoOpen) setAmbientPlaying(true);
  }

  function playUiSfx(src, key, gainValue) {
    unlock();
    const now = Date.now();
    if (now - lastSelectAt < 40) return;
    lastSelectAt = now;
    playSfx(src, key, gainValue);
  }

  function select() {
    playUiSfx(SELECT_SRC, "select", SELECT_GAIN);
  }

  function library() {
    playUiSfx(LIBRARY_SRC, "library", LIBRARY_GAIN);
  }

  function addToQueue() {
    playUiSfx(ADD_QUEUE_SRC, "addQueue", ADD_QUEUE_GAIN);
  }

  function readyToWatch() {
    playUiSfx(READY_SRC, "ready", READY_GAIN);
  }

  function error() {
    unlock();
    playSfx(ERROR_SRC, "error", ERROR_GAIN);
  }

  function queueFinished() {
    unlock();
    playSfx(QUEUE_DONE_SRC, "queue", QUEUE_GAIN);
  }

  function isLibraryTabHit(target) {
    return Boolean(target && target.closest && target.closest("#tab-library"));
  }

  function isReadyToWatchHit(target) {
    return Boolean(target && target.closest && target.closest("#splash-ready"));
  }

  function isAddToQueueHit(target) {
    if (!target || !target.closest) return false;
    if (target.closest("#catalog-add-queue, #catalog-queue-all, [data-sfx='add-queue']")) {
      return true;
    }
    const el = target.closest("button, a, [role='button']");
    if (!el) return false;
    const id = (el.id || "").toLowerCase();
    if (id.includes("add-queue") || id.includes("queue-all") || id.includes("add-to-queue")) {
      return true;
    }
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    return /^add(?:\s+\w+)*\s+to\s+queue$/i.test(text);
  }

  function onVideoOpen() {
    videoOpen = true;
    unlock();
    setAmbientPlaying(false);
    fadeTo(0, FADE_OUT_MS);
  }

  function onVideoClose() {
    videoOpen = false;
    if (!unlocked) return;
    setAmbientPlaying(true);
    if (!musicMuted) fadeTo(MUSIC_VOLUME, FADE_IN_MS);
  }

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      const playHit = target.closest && target.closest("[data-play]");
      const muteHit = target.closest && target.closest("#music-mute");
      unlock();
      if (target.closest && target.closest("video")) return;
      if (isLibraryTabHit(target)) {
        library();
      } else if (isAddToQueueHit(target)) {
        addToQueue();
      } else if (isReadyToWatchHit(target)) {
        readyToWatch();
      } else {
        select();
      }
      if (!videoOpen && !playHit && !muteHit) startMusicIfIdle();
    },
    true
  );

  const muteButton = document.getElementById("music-mute");
  if (muteButton) {
    muteButton.addEventListener("click", () => {
      setMusicMuted(!musicMuted);
    });
  }
  restoreMute();
  ensureMusic();
  fetchSfx(SELECT_SRC);
  fetchSfx(ERROR_SRC);
  fetchSfx(QUEUE_DONE_SRC);
  fetchSfx(LIBRARY_SRC);
  fetchSfx(ADD_QUEUE_SRC);
  fetchSfx(READY_SRC);
  const ambientEl = ambientVideo();
  if (ambientEl) {
    const syncAmbient = () => {
      applyAmbientRate(ambientEl);
      layoutAmbientVideo();
    };
    ambientEl.addEventListener("play", syncAmbient);
    ambientEl.addEventListener("playing", syncAmbient);
    ambientEl.addEventListener("loadedmetadata", syncAmbient);
    ambientEl.addEventListener("canplay", () => {
      syncAmbient();
      if (!videoOpen) setAmbientPlaying(true);
    });
  }
  window.addEventListener("resize", scheduleAmbientLayout);
  window.addEventListener("orientationchange", scheduleAmbientLayout);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleAmbientLayout);
    window.visualViewport.addEventListener("scroll", scheduleAmbientLayout);
  }
  setAmbientPlaying(true);

  window.CinaRipAudio = {
    unlock,
    select,
    library,
    addToQueue,
    readyToWatch,
    error,
    queueFinished,
    onVideoOpen,
    onVideoClose,
    setMusicMuted
  };
})();
