"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_NAS_ORIGIN = "https://cinarip.matthewsuess.com";
const DEFAULT_SMB_HOST = "100.95.66.124";
const DEFAULT_SMB_SHARE = "Public";
const DEFAULT_SMB_VIDEOS = "Videos";
const WRITE_PROBE_NAME = ".cinarip-write-test";
const WRITE_HELP =
  "The Docker volume must be read-write. Allow the folder in Docker Desktop file sharing. A NAS SMB share must be mapped with a user who can write (not guest/read-only).";

function configFilePath(root) {
  return path.join(root, ".cinarip-worker.json");
}

function freezerConfigPath(videoRoot) {
  return path.join(videoRoot, "Freezer", ".cinarip-worker.json");
}

function normalizeNasOrigin(raw, fallback = DEFAULT_NAS_ORIGIN) {
  const text = String(raw || "").trim();
  if (!text) {
    if (!fallback) throw new Error("NAS URL is required");
    return normalizeNasOrigin(fallback, "");
  }
  const href = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)
    ? text
    : /matthewsuess\.com/i.test(text)
      ? `https://${text}`
      : `http://${text}`;
  let url;
  try {
    url = new URL(href);
  } catch {
    throw new Error("NAS URL is invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NAS URL must be http or https");
  }
  return url.origin;
}

function nasStatusUrl(origin) {
  return `${normalizeNasOrigin(origin)}/api/freezer/status`;
}

function emptyConfig() {
  return {
    nasOrigin: DEFAULT_NAS_ORIGIN,
    smbHost: DEFAULT_SMB_HOST,
    smbShare: DEFAULT_SMB_SHARE,
    smbVideos: DEFAULT_SMB_VIDEOS,
    smbUsername: "",
    smbPassword: ""
  };
}

function parseConfigFile(abs) {
  if (!abs || !fs.existsSync(abs)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function mergeConfig(base, parsed) {
  const next = { ...base };
  if (!parsed) return next;
  const origin = String(parsed.nasOrigin || parsed.origin || "").trim();
  if (origin) {
    try {
      next.nasOrigin = normalizeNasOrigin(origin);
    } catch {
      // keep previous
    }
  }
  if (parsed.smbHost != null) next.smbHost = String(parsed.smbHost).trim() || next.smbHost;
  if (parsed.smbShare != null) next.smbShare = String(parsed.smbShare).trim() || next.smbShare;
  if (parsed.smbVideos != null) next.smbVideos = String(parsed.smbVideos).trim();
  if (parsed.smbUsername != null) next.smbUsername = String(parsed.smbUsername).trim();
  if (parsed.smbPassword != null && String(parsed.smbPassword).length > 0) {
    next.smbPassword = String(parsed.smbPassword);
  }
  return next;
}

function readConfig(configRoot, videoRoot) {
  let cfg = emptyConfig();
  cfg = mergeConfig(cfg, parseConfigFile(configFilePath(configRoot)));
  if (videoRoot) cfg = mergeConfig(cfg, parseConfigFile(freezerConfigPath(videoRoot)));
  return cfg;
}

function publicConfig(cfg) {
  const full = { ...emptyConfig(), ...cfg };
  return {
    nasOrigin: full.nasOrigin,
    smbHost: full.smbHost,
    smbShare: full.smbShare,
    smbVideos: full.smbVideos,
    smbUsername: full.smbUsername,
    hasPassword: Boolean(full.smbPassword)
  };
}

function writeJson(abs, cfg) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
}

function writeConfig(configRoot, videoRoot, patch) {
  const prev = readConfig(configRoot, videoRoot);
  const next = mergeConfig(prev, patch);
  if (patch && Object.prototype.hasOwnProperty.call(patch, "smbPassword")) {
    const incoming = String(patch.smbPassword || "");
    if (incoming) next.smbPassword = incoming;
    else next.smbPassword = prev.smbPassword || "";
  }
  if (patch && patch.nasOrigin) next.nasOrigin = normalizeNasOrigin(patch.nasOrigin);
  writeJson(configFilePath(configRoot), next);
  if (videoRoot) {
    try {
      fs.mkdirSync(path.join(videoRoot, "Freezer"), { recursive: true });
      writeJson(freezerConfigPath(videoRoot), next);
    } catch {
      // share may not be writable yet
    }
  }
  return next;
}

function resolveNasOrigin(videoRoot, env = process.env, configRoot) {
  const cfgRoot = configRoot || env.CONFIG_ROOT || (videoRoot ? path.join(videoRoot, "Freezer") : "");
  const saved = readConfig(cfgRoot, videoRoot);
  const fromFile =
    parseConfigFile(cfgRoot ? configFilePath(cfgRoot) : "") ||
    parseConfigFile(videoRoot ? freezerConfigPath(videoRoot) : "");
  if (fromFile && (fromFile.nasOrigin || fromFile.origin)) return saved.nasOrigin;
  const fromStatus = String(env.NAS_STATUS_URL || "").trim();
  if (fromStatus) {
    try {
      return new URL(fromStatus).origin;
    } catch {
      // fall through
    }
  }
  const fromEnv = String(env.NAS_ORIGIN || "").trim();
  if (fromEnv) return normalizeNasOrigin(fromEnv);
  return saved.nasOrigin || DEFAULT_NAS_ORIGIN;
}

function classifyIoError(error) {
  const code = error && error.code;
  if (code === "ENOENT") return `Videos path is not mounted. ${WRITE_HELP}`;
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
    return `Videos folder is not writable. ${WRITE_HELP}`;
  }
  return (error && error.message) || `Could not use the Videos folder. ${WRITE_HELP}`;
}

function freezerIsEmpty(freezer, io = fs) {
  try {
    return io.readdirSync(freezer).every((name) => String(name).startsWith("."));
  } catch {
    return true;
  }
}

function ensureFreezer(videoRoot, io = fs) {
  const result = {
    state: "disconnected",
    path: videoRoot,
    freezerExists: false,
    created: false,
    empty: false,
    writable: false,
    error: null
  };
  try {
    if (!io.existsSync(videoRoot)) {
      result.error = `Videos path is not mounted. ${WRITE_HELP}`;
      return result;
    }
    io.readdirSync(videoRoot);
    const freezer = path.join(videoRoot, "Freezer");
    if (!io.existsSync(freezer)) {
      io.mkdirSync(freezer, { recursive: true });
      result.created = true;
    } else if (!io.statSync(freezer).isDirectory()) {
      result.state = "error";
      result.error = "Freezer exists but is not a folder";
      return result;
    }
    result.freezerExists = true;
    const probe = path.join(freezer, WRITE_PROBE_NAME);
    io.writeFileSync(probe, "ok");
    io.unlinkSync(probe);
    result.writable = true;
    result.empty = freezerIsEmpty(freezer, io);
    if (result.created) {
      result.state = "warning";
      result.error = "Created missing Freezer/. Freeze titles from CinaRip to populate it.";
    } else if (result.empty) {
      result.state = "warning";
      result.error = "Freezer/ is empty. Freeze titles from CinaRip into this Videos path.";
    } else {
      result.state = "connected";
      result.error = null;
    }
    return result;
  } catch (error) {
    result.state = "error";
    result.error = classifyIoError(error);
    result.writable = false;
    return result;
  }
}

module.exports = {
  DEFAULT_NAS_ORIGIN,
  DEFAULT_SMB_HOST,
  DEFAULT_SMB_SHARE,
  DEFAULT_SMB_VIDEOS,
  WRITE_PROBE_NAME,
  WRITE_HELP,
  configFilePath,
  freezerConfigPath,
  normalizeNasOrigin,
  nasStatusUrl,
  emptyConfig,
  readConfig,
  writeConfig,
  writeSavedNasOrigin,
  publicConfig,
  resolveNasOrigin,
  classifyIoError,
  ensureFreezer
};

function writeSavedNasOrigin(videoRoot, origin, configRoot) {
  const root = configRoot || process.env.CONFIG_ROOT || path.join(videoRoot, "Freezer");
  return writeConfig(root, videoRoot, { nasOrigin: origin }).nasOrigin;
}
