const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { prepareNasAccess } = require("./nas-auth");

const DEFAULTS = {
  portalUrl: "",
  videoFolder: ""
};

function userConfigPath() {
  return path.join(app.getPath("userData"), "nas-config.json");
}

function configPath() {
  try {
    const userConfig = userConfigPath();
    if (fs.existsSync(userConfig)) return userConfig;
  } catch {
    // app may not be ready yet
  }

  const projectConfig = path.join(__dirname, "..", "nas-config.json");
  if (fs.existsSync(projectConfig)) return projectConfig;

  const resourceConfig = path.join(process.resourcesPath || "", "nas-config.json");
  if (process.resourcesPath && fs.existsSync(resourceConfig)) return resourceConfig;

  return projectConfig;
}

function loadNasConfig() {
  const merged = { ...DEFAULTS };

  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.portalUrl) merged.portalUrl = parsed.portalUrl;
    if (parsed.videoFolder) merged.videoFolder = parsed.videoFolder;
  } catch {
    // Use defaults when config file is missing or invalid.
  }

  if (process.env.NAS_PORTAL_URL) merged.portalUrl = process.env.NAS_PORTAL_URL;
  if (process.env.NAS_VIDEO_FOLDER) merged.videoFolder = process.env.NAS_VIDEO_FOLDER;

  return merged;
}

function saveNasConfig({ portalUrl, videoFolder } = {}) {
  const current = loadNasConfig();
  const next = {
    portalUrl:
      portalUrl !== undefined ? String(portalUrl || "").trim() : current.portalUrl,
    videoFolder:
      videoFolder !== undefined ? String(videoFolder || "").trim() : current.videoFolder
  };

  fs.mkdirSync(path.dirname(userConfigPath()), { recursive: true });
  fs.writeFileSync(userConfigPath(), JSON.stringify(next, null, 2));
  return loadNasConfig();
}

function isUncPath(folderPath) {
  return typeof folderPath === "string" && folderPath.startsWith("\\\\");
}

function ensureNasFolder(folderPath) {
  if (!folderPath || typeof folderPath !== "string") {
    return {
      ok: false,
      path: folderPath || "",
      error:
        "No NAS video folder is configured. Open Settings and choose a NAS videos folder."
    };
  }

  if (isUncPath(folderPath)) {
    return prepareNasAccess(folderPath);
  }

  try {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    fs.accessSync(folderPath, fs.constants.W_OK);
    return { ok: true, path: folderPath };
  } catch (error) {
    return {
      ok: false,
      path: folderPath,
      error: `Could not write to folder "${folderPath}". (${error.message})`
    };
  }
}

module.exports = {
  loadNasConfig,
  saveNasConfig,
  ensureNasFolder
};
