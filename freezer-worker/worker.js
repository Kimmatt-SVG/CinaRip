"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { compressPlaybackFile, shouldEncode, readSidecar } = require("./lib/encode");
const { scanFreezer, queueBuckets } = require("./lib/scan");
const { RateWindow, formatBps } = require("./lib/progress");
const {
  DEFAULT_NAS_ORIGIN,
  nasStatusUrl,
  resolveNasOrigin,
  readConfig,
  writeConfig,
  publicConfig,
  ensureFreezer
} = require("./lib/nas-config");
const { mountCifs, videosRootFromMount } = require("./lib/nas-mount");

const PORT = Number(process.env.PORT) || 8791;
const FALLBACK_VIDEO_ROOT = path.resolve(process.env.VIDEO_ROOT || "/videos");
const CONFIG_ROOT = path.resolve(process.env.CONFIG_ROOT || "/config");
const NAS_MOUNT_POINT = path.resolve(process.env.NAS_MOUNT_POINT || "/mnt/nas");
let VIDEO_ROOT = FALLBACK_VIDEO_ROOT;
const SCAN_MS = Number(process.env.SCAN_MS) || 4000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

let running = false;
let cooling = false;
let loopBusy = false;
let current = null;
let lastDownloadBytes = 0;
let lastUploadBytes = 0;
const downloadRate = new RateWindow();
const uploadRate = new RateWindow();
let nasOrigin = DEFAULT_NAS_ORIGIN;
let nasConnection = {
  state: "disconnected",
  origin: DEFAULT_NAS_ORIGIN,
  url: nasStatusUrl(DEFAULT_NAS_ORIGIN),
  error: null
};

function applyNasOrigin(origin) {
  nasOrigin = origin;
  nasConnection = {
    ...nasConnection,
    origin,
    url: nasStatusUrl(origin)
  };
}

let smbConnection = {
  state: "unconfigured",
  mounted: false,
  error: null
};

function loadNasOrigin() {
  applyNasOrigin(resolveNasOrigin(VIDEO_ROOT, process.env, CONFIG_ROOT));
}

function applyShareMount() {
  const cfg = readConfig(CONFIG_ROOT, VIDEO_ROOT);
  if (!cfg.smbUsername || !cfg.smbPassword) {
    smbConnection = { state: "unconfigured", mounted: false, error: "Save NAS share username and password to mount the library." };
    VIDEO_ROOT = FALLBACK_VIDEO_ROOT;
    return smbConnection;
  }
  const mounted = mountCifs({
    host: cfg.smbHost,
    share: cfg.smbShare,
    username: cfg.smbUsername,
    password: cfg.smbPassword,
    target: NAS_MOUNT_POINT,
    configRoot: CONFIG_ROOT
  });
  if (!mounted.ok) {
    smbConnection = { state: "error", mounted: false, error: mounted.error };
    VIDEO_ROOT = FALLBACK_VIDEO_ROOT;
    return smbConnection;
  }
  VIDEO_ROOT = videosRootFromMount(NAS_MOUNT_POINT, cfg.smbVideos);
  smbConnection = { state: "connected", mounted: true, error: null };
  return smbConnection;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function isInside(root, target) {
  const rel = path.relative(root, target);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function readBody(req, limit = 200_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function mountStatus(videoRoot = VIDEO_ROOT, io = fs) {
  return ensureFreezer(videoRoot, io);
}

function ratesPayload() {
  const downloadBps = downloadRate.bps();
  const uploadBps = uploadRate.bps();
  return {
    downloadBps,
    uploadBps,
    downloadLabel: formatBps(downloadBps),
    uploadLabel: formatBps(uploadBps)
  };
}

function statusPayload() {
  const scan = scanFreezer(VIDEO_ROOT);
  const queues = queueBuckets(scan, current?.rel);
  const mount = mountStatus();
  return {
    ok: true,
    running,
    cooling: Boolean(cooling || current),
    videoRoot: VIDEO_ROOT,
    freezerExists: mount.freezerExists,
    connection: {
      mount,
      nas: nasConnection,
      smb: smbConnection,
      settings: publicConfig(readConfig(CONFIG_ROOT, VIDEO_ROOT))
    },
    rates: ratesPayload(),
    current,
    catalog: {
      movies: scan.movies,
      shows: scan.shows
    },
    pending: queues.pending,
    encoding: queues.encoding,
    failed: queues.failed
  };
}

function nextPendingFile(scan) {
  for (const file of scan.files) {
    const decision = shouldEncode(file.abs, {
      videoRoot: VIDEO_ROOT,
      meta: readSidecar(file.abs)
    });
    if (!decision.skip) return file;
  }
  return null;
}

function applyJobProgress(job, info) {
  if (info.stage === "download") {
    const done = Number(info.bytesDone) || 0;
    const delta = done - lastDownloadBytes;
    if (delta > 0) downloadRate.add(delta);
    lastDownloadBytes = done;
    lastUploadBytes = 0;
  } else if (info.stage === "upload") {
    const done = Number(info.bytesDone) || 0;
    const delta = done - lastUploadBytes;
    if (delta > 0) uploadRate.add(delta);
    lastUploadBytes = done;
    lastDownloadBytes = 0;
  } else {
    lastDownloadBytes = 0;
    lastUploadBytes = 0;
  }
  current = {
    id: job.id,
    title: job.title,
    rel: job.rel,
    kind: job.kind || "movie",
    episodeCount: job.episodeCount,
    posterRel: job.posterRel,
    stage: info.stage,
    percent: Number(info.percent) || 0,
    bytesDone: Number(info.bytesDone) || 0,
    bytesTotal: Number(info.bytesTotal) || 0,
    outTimeSec: Number(info.outTimeSec) || 0,
    durationSec: Number(info.durationSec) || 0,
    fps: Number(info.fps) || 0,
    speed: info.speed || ""
  };
}

async function pingNas() {
  const origin = nasOrigin || resolveNasOrigin(VIDEO_ROOT);
  applyNasOrigin(origin);
  try {
    const health = new URL("/api/health", origin);
    const client = health.protocol === "https:" ? https : http;
    await new Promise((resolve) => {
      const req = client.request(health, { method: "GET" }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            nasConnection = { state: "connected", origin, url: nasStatusUrl(origin), error: null };
          } else {
            nasConnection = {
              state: "error",
              origin,
              url: nasStatusUrl(origin),
              error: `NAS responded ${res.statusCode}`
            };
          }
          resolve();
        });
      });
      req.on("error", (error) => {
        nasConnection = {
          state: "disconnected",
          origin,
          url: nasStatusUrl(origin),
          error: error.message || "NAS unreachable"
        };
        resolve();
      });
      req.setTimeout(4000, () => {
        req.destroy();
        nasConnection = { state: "disconnected", origin, url: nasStatusUrl(origin), error: "NAS timed out" };
        resolve();
      });
      req.end();
    });
  } catch (error) {
    nasConnection = {
      state: "error",
      origin,
      url: nasStatusUrl(origin),
      error: error.message || "NAS URL invalid"
    };
  }
}

async function notifyNas() {
  const origin = nasOrigin || resolveNasOrigin(VIDEO_ROOT);
  try {
    const url = new URL(nasStatusUrl(origin));
    const body = JSON.stringify({ ok: true, source: "freezer-worker", current, running, cooling });
    const client = url.protocol === "https:" ? https : http;
    await new Promise((resolve) => {
      const req = client.request(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
        },
        (res) => {
          res.resume();
          res.on("end", resolve);
        }
      );
      req.on("error", () => resolve());
      req.setTimeout(4000, () => {
        req.destroy();
        resolve();
      });
      req.end(body);
    });
  } catch {
    // optional
  }
}

async function encodeLoop() {
  if (loopBusy) return;
  loopBusy = true;
  try {
    while (running) {
      const scan = scanFreezer(VIDEO_ROOT);
      const job = nextPendingFile(scan);
      if (!job) {
        cooling = false;
        current = null;
        lastDownloadBytes = 0;
        lastUploadBytes = 0;
        await new Promise((resolve) => setTimeout(resolve, SCAN_MS));
        continue;
      }
      cooling = true;
      lastDownloadBytes = 0;
      lastUploadBytes = 0;
      current = { id: job.id, title: job.title, rel: job.rel, kind: job.kind || "movie", stage: "download", percent: 0 };
      await compressPlaybackFile(job.abs, {
        videoRoot: VIDEO_ROOT,
        onProgress: (info) => applyJobProgress(job, info)
      });
      current = null;
      lastDownloadBytes = 0;
      lastUploadBytes = 0;
      await notifyNas();
    }
  } finally {
    cooling = false;
    current = null;
    loopBusy = false;
  }
}

function startFreezer() {
  running = true;
  encodeLoop().catch(() => {
    running = false;
  });
  return { ok: true, running: true, action: "start" };
}

function coolDown() {
  running = true;
  cooling = true;
  encodeLoop().catch(() => {
    running = false;
    cooling = false;
  });
  return { ok: true, running: true, cooling: true, action: "cool-down" };
}

function serveStatic(res, urlPath) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const abs = path.resolve(PUBLIC_DIR, rel);
  if (!isInside(PUBLIC_DIR, abs) && abs !== path.join(PUBLIC_DIR, "index.html")) {
    sendText(res, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    sendText(res, 404, "Not found");
    return;
  }
  const ext = path.extname(abs).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(abs).pipe(res);
}

function servePoster(res, rel) {
  const abs = path.resolve(VIDEO_ROOT, ...toPosixSafe(rel));
  if (!isInside(VIDEO_ROOT, abs) && abs !== VIDEO_ROOT) {
    sendText(res, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    sendText(res, 404, "Not found");
    return;
  }
  const ext = path.extname(abs).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
    sendText(res, 404, "Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "image/jpeg",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(abs).pipe(res);
}

function toPosixSafe(rel) {
  return String(rel || "")
    .split(/[/\\]/)
    .filter((part) => part && part !== "." && part !== "..");
}

async function handle(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (pathname === "/api/status" && req.method === "GET") {
    sendJson(res, 200, statusPayload());
    return;
  }
  if (pathname === "/api/health" && req.method === "GET") {
    const mount = mountStatus();
    sendJson(res, 200, {
      ok: true,
      app: "CinaRip Freezer Worker",
      running,
      cooling,
      freezerExists: mount.freezerExists,
      connection: { mount, nas: nasConnection, smb: smbConnection }
    });
    return;
  }
  if (pathname === "/api/start" && req.method === "POST") {
    await readBody(req).catch(() => "");
    sendJson(res, 200, { ...startFreezer(), ...statusPayload() });
    return;
  }
  if (pathname === "/api/cool-down" && req.method === "POST") {
    await readBody(req).catch(() => "");
    sendJson(res, 200, { ...coolDown(), ...statusPayload() });
    return;
  }
  if (pathname === "/api/poster" && req.method === "GET") {
    servePoster(res, url.searchParams.get("rel") || "");
    return;
  }
  if (pathname === "/api/nas" && req.method === "POST") {
    const raw = await readBody(req).catch(() => "");
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      sendJson(res, 400, { ok: false, error: "NAS URL JSON was invalid" });
      return;
    }
    try {
      const patch = {
        nasOrigin: body.origin || body.url || body.nasOrigin,
        smbHost: body.host || body.smbHost,
        smbShare: body.share || body.smbShare,
        smbVideos: body.videosPath != null ? body.videosPath : body.smbVideos,
        smbUsername: body.username != null ? body.username : body.smbUsername
      };
      if (body.password || body.smbPassword) patch.smbPassword = body.password || body.smbPassword;
      const cfg = writeConfig(CONFIG_ROOT, VIDEO_ROOT, patch);
      applyNasOrigin(cfg.nasOrigin);
      applyShareMount();
      mountStatus();
      await pingNas();
      sendJson(res, 200, { ok: true, origin: cfg.nasOrigin, ...statusPayload() });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Could not save NAS settings" });
    }
    return;
  }
  if (pathname.startsWith("/api/")) {
    sendJson(res, 404, { ok: false, error: "Unknown API route", path: pathname });
    return;
  }
  serveStatic(res, pathname);
}

function start() {
  applyShareMount();
  const mount = mountStatus();
  loadNasOrigin();
  pingNas().catch(() => {});
  setInterval(() => {
    pingNas().catch(() => {});
  }, 5000);
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      sendJson(res, 500, { ok: false, error: error.message || "Server error" });
    });
  });
  server.listen(PORT, "0.0.0.0", () => {
    const cfg = readConfig(CONFIG_ROOT, VIDEO_ROOT);
    console.log(`CinaRip Freezer Worker listening on ${PORT}`);
    console.log(`Videos: ${VIDEO_ROOT} freezer=${mount.freezerExists} created=${mount.created} writable=${mount.writable} state=${mount.state}`);
    console.log(`NAS HTTP: ${nasOrigin}`);
    console.log(`NAS share: ${cfg.smbHost}/${cfg.smbShare}/${cfg.smbVideos} user=${cfg.smbUsername || "(none)"}`);
    console.log("Open the worker page, then click Start Freezer or Cool Down. Encoding does not start by itself.");
  });
}

if (require.main === module) start();

module.exports = { startFreezer, coolDown, statusPayload, VIDEO_ROOT, mountStatus, loadNasOrigin };
