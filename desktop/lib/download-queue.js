const {
  canonicalMoviePageUrl,
  extractMovieIdFromUrl,
  normalizeMovieUrl
} = require("./movie-url-utils");
const { episodeFileLabel, canonicalContentUrl } = require("./tv-url-utils");

function titleFromMovieUrl(url) {
  try {
    const match = String(url).match(/\/movie\/([^/]+)\//i);
    if (!match) return "Movie";
    return match[1]
      .replace(/-/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return "Movie";
  }
}

function normalizePageUrl(url) {
  return canonicalContentUrl(url) || normalizeMovieUrl(url) || String(url || "").trim();
}

function sanitizeQueueItem(raw = {}) {
  const kind = raw.kind === "episode" ? "episode" : "movie";
  const movieUrl =
    kind === "episode" ? normalizePageUrl(raw.movieUrl || raw.url || "") : normalizeMovieUrl(raw.movieUrl || "");
  if (!movieUrl) return null;

  const status = ["pending", "loading", "downloading", "done", "failed"].includes(raw.status)
    ? raw.status
    : "pending";

  const item = {
    id: String(raw.id || `q-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
    kind,
    title: String(raw.title || (kind === "episode" ? "Episode" : titleFromMovieUrl(movieUrl))).trim() || "Queued item",
    movieUrl,
    destination: "nas",
    status,
    error: raw.error ? String(raw.error) : null,
    passRetries: Number(raw.passRetries) || 0,
    addedAt: Number(raw.addedAt) || Date.now()
  };

  if (kind === "episode") {
    item.showTitle = String(raw.showTitle || "TV Show").trim() || "TV Show";
    item.season = Number(raw.season) || 1;
    item.episode = Number(raw.episode) || 0;
    item.episodeTitle = String(raw.episodeTitle || "Episode").trim() || "Episode";
    item.posterUrl = raw.posterUrl || null;
  }

  return item;
}

class DownloadQueue {
  constructor() {
    this.items = [];
    this.running = false;
    this.cancelRequested = false;
    this.currentId = null;
  }

  list() {
    return this.items.map((item) => ({ ...item }));
  }

  snapshot() {
    const pending = this.items.filter((item) => item.status === "pending").length;
    const done = this.items.filter((item) => item.status === "done").length;
    const failed = this.items.filter((item) => item.status === "failed").length;
    const movies = this.items.filter((item) => item.kind !== "episode").length;
    const episodes = this.items.filter((item) => item.kind === "episode").length;

    return {
      running: this.running,
      cancelRequested: this.cancelRequested,
      currentId: this.currentId,
      items: this.list(),
      counts: {
        total: this.items.length,
        pending,
        done,
        failed,
        movies,
        episodes
      }
    };
  }

  add(movieUrl, options = {}) {
    const normalizedUrl = normalizeMovieUrl(movieUrl);
    if (!/\/movie\/[^/]+\/[^/?#]+/i.test(normalizedUrl)) {
      return {
        ok: false,
        error: "Not a valid movie page URL. Use a full link like /movie/title/movieId."
      };
    }

    if (this.items.some((item) => item.kind !== "episode" && item.movieUrl === normalizedUrl && item.status === "pending")) {
      return { ok: false, error: "Movie is already in the queue." };
    }

    const item = {
      id: `q-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      kind: "movie",
      title: options.title || titleFromMovieUrl(normalizedUrl),
      movieUrl: normalizedUrl,
      destination: "nas",
      status: "pending",
      error: null,
      passRetries: 0,
      addedAt: Date.now()
    };

    this.items.push(item);
    return { ok: true, item };
  }

  addEpisode(episode = {}, options = {}) {
    const pageUrl = normalizePageUrl(episode.url || episode.movieUrl || "");
    if (!pageUrl) {
      return { ok: false, error: "Episode is missing a URL." };
    }

    const season = Number(episode.season) || 1;
    const episodeNumber = Number(episode.episode) || 0;
    const showTitle = String(options.showTitle || episode.showTitle || "TV Show").trim() || "TV Show";
    const label = episodeFileLabel(season, episodeNumber || 1);
    const episodeTitle = String(episode.title || "Episode").trim() || "Episode";
    const title = `${showTitle} · ${label} · ${episodeTitle}`;

    if (
      this.items.some(
        (item) =>
          item.kind === "episode" &&
          item.movieUrl === pageUrl &&
          item.status === "pending"
      )
    ) {
      return { ok: false, error: "Episode is already in the queue." };
    }

    const item = {
      id: `q-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      kind: "episode",
      title,
      movieUrl: pageUrl,
      showTitle,
      season,
      episode: episodeNumber,
      episodeTitle,
      posterUrl: options.posterUrl || episode.posterUrl || null,
      destination: "nas",
      status: "pending",
      error: null,
      passRetries: 0,
      addedAt: Date.now()
    };

    this.items.push(item);
    return { ok: true, item };
  }

  addEpisodes(episodes = [], options = {}) {
    const added = [];
    const skipped = [];

    for (const episode of episodes) {
      const result = this.addEpisode(episode, options);
      if (result.ok) added.push(result.item);
      else skipped.push({ url: episode?.url, error: result.error });
    }

    return { ok: true, added, skipped };
  }

  addMany(entries = [], destination = "local") {
    const added = [];
    const skipped = [];

    for (const entry of entries) {
      const movieUrl = typeof entry === "string" ? entry : entry?.movieUrl;
      const title = typeof entry === "object" ? entry?.title : null;
      const result = this.add(movieUrl, { title, destination });
      if (result.ok) added.push(result.item);
      else skipped.push({ movieUrl, error: result.error });
    }

    return { ok: true, added, skipped };
  }

  remove(id) {
    if (this.running && this.currentId === id) {
      return { ok: false, error: "Cannot remove the item that is downloading." };
    }

    const before = this.items.length;
    this.items = this.items.filter((item) => item.id !== id);
    return { ok: true, removed: before - this.items.length };
  }

  clear() {
    if (this.running) {
      return { ok: false, error: "Stop the queue before clearing it." };
    }

    this.items = [];
    this.currentId = null;
    this.cancelRequested = false;
    return { ok: true };
  }

  setPendingDestination() {
    const normalized = "nas";
    for (const item of this.items) {
      if (item.status === "pending") item.destination = normalized;
    }
    return { ok: true, destination: normalized };
  }

  hasWork() {
    return this.items.some((item) => item.status === "pending" || item.status === "failed");
  }

  reviveFailed() {
    let count = 0;
    for (const item of this.items) {
      if (item.status !== "failed") continue;
      item.status = "pending";
      item.error = null;
      item.passRetries = 0;
      count += 1;
    }
    return count;
  }

  requeueFailed() {
    let count = 0;
    for (const item of this.items) {
      if (item.status !== "failed") continue;
      if ((item.passRetries || 0) >= 1) continue;
      item.passRetries = (item.passRetries || 0) + 1;
      item.status = "pending";
      item.error = null;
      count += 1;
    }
    if (count) this.currentId = null;
    return count;
  }

  beginRun() {
    if (this.running) {
      return { ok: false, error: "Queue is already running." };
    }

    this.reviveFailed();

    const pending = this.items.filter((item) => item.status === "pending");
    if (!pending.length) {
      return { ok: false, error: "Queue is empty." };
    }

    this.running = true;
    this.cancelRequested = false;
    this.currentId = null;
    return { ok: true, pending: pending.length };
  }

  requestCancel() {
    this.cancelRequested = true;
    return { ok: true };
  }

  finishRun() {
    this.running = false;
    this.currentId = null;
    this.cancelRequested = false;
  }

  setCurrent(id) {
    this.currentId = id;
    const item = this.items.find((entry) => entry.id === id);
    if (item) item.status = "loading";
  }

  markDownloading(id) {
    const item = this.items.find((entry) => entry.id === id);
    if (item) item.status = "downloading";
  }

  markDone(id) {
    const item = this.items.find((entry) => entry.id === id);
    if (item) {
      item.status = "done";
      item.error = null;
    }
    if (this.currentId === id) this.currentId = null;
  }

  markFailed(id, error) {
    const item = this.items.find((entry) => entry.id === id);
    if (item) {
      item.status = "failed";
      item.error = error || "Download failed";
    }
    if (this.currentId === id) this.currentId = null;
  }

  markSkipped(id, reason) {
    const item = this.items.find((entry) => entry.id === id);
    if (item) {
      item.status = "failed";
      item.error = reason || "Skipped";
    }
    if (this.currentId === id) this.currentId = null;
  }

  nextPending() {
    return this.items.find((item) => item.status === "pending") || null;
  }

  persistableItems() {
    return this.items.map((item) => ({ ...item }));
  }

  restore(rawItems = []) {
    this.running = false;
    this.cancelRequested = false;
    this.currentId = null;
    this.items = [];

    let interrupted = 0;
    const seen = new Set();

    for (const raw of Array.isArray(rawItems) ? rawItems : []) {
      const item = sanitizeQueueItem(raw);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);

      if (item.status === "loading" || item.status === "downloading") {
        item.status = "pending";
        item.error = null;
        interrupted += 1;
      }

      this.items.push(item);
    }

    return {
      ok: true,
      restored: this.items.length,
      interrupted
    };
  }
}

module.exports = {
  DownloadQueue,
  titleFromMovieUrl,
  normalizeMovieUrl,
  canonicalMoviePageUrl,
  extractMovieIdFromUrl
};
