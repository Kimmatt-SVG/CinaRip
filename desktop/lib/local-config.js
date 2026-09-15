const fs = require("fs");
const path = require("path");
const { app } = require("electron");

function configPath() {
  return path.join(app.getPath("userData"), "local-config.json");
}

function defaultLocalVideoFolder() {
  let outputFolder = "Movies";
  try {
    const { getActiveProfile } = require("./site-profiles");
    outputFolder = getActiveProfile().outputFolder || "Movies";
  } catch {
    // Keep default Movies folder.
  }
  return path.join(app.getPath("videos"), outputFolder);
}

function loadLocalConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), "utf8"));
    return {
      videoFolder: typeof raw.videoFolder === "string" ? raw.videoFolder.trim() : ""
    };
  } catch {
    return { videoFolder: "" };
  }
}

function saveLocalConfig({ videoFolder }) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(
    configPath(),
    JSON.stringify(
      {
        videoFolder: String(videoFolder || "").trim()
      },
      null,
      2
    )
  );
  return loadLocalConfig();
}

function ensureLocalFolder(folderPath) {
  if (!folderPath || typeof folderPath !== "string") {
    return { ok: true, path: defaultLocalVideoFolder(), usedDefault: true };
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
      error: `Could not write to local folder "${folderPath}". (${error.message})`
    };
  }
}

function configuredLocalVideoFolder() {
  if (process.env.HLS_CAPTURE_OUTPUT_DIR) {
    return path.resolve(process.env.HLS_CAPTURE_OUTPUT_DIR);
  }
  const saved = loadLocalConfig().videoFolder;
  return saved ? path.resolve(saved) : "";
}

module.exports = {
  defaultLocalVideoFolder,
  loadLocalConfig,
  saveLocalConfig,
  ensureLocalFolder,
  configuredLocalVideoFolder
};
