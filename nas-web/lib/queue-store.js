"use strict";

const fs = require("fs");
const path = require("path");

const STORE_VERSION = 1;

function defaultStorePath() {
  return path.join(process.env.DATA_ROOT || "/data/app", "download-queue.json");
}

function atomicWriteJson(filePath, value) {
  const directory = path.dirname(filePath);
  const tempPath = `${filePath}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;

  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(tempPath, payload, "utf8");
  try {
    fs.renameSync(tempPath, filePath);
  } catch {
    fs.copyFileSync(tempPath, filePath);
    fs.unlinkSync(tempPath);
  }
}

function loadQueueState(filePath = defaultStorePath()) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const items = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    return {
      ok: true,
      version: Number(raw?.version) || STORE_VERSION,
      savedAt: Number(raw?.savedAt) || 0,
      items
    };
  } catch {
    return { ok: true, version: STORE_VERSION, savedAt: 0, items: [] };
  }
}

function saveQueueState(items = [], filePath = defaultStorePath()) {
  atomicWriteJson(filePath, {
    version: STORE_VERSION,
    savedAt: Date.now(),
    items: Array.isArray(items) ? items : []
  });
  return { ok: true, path: filePath, count: Array.isArray(items) ? items.length : 0 };
}

module.exports = {
  STORE_VERSION,
  defaultStorePath,
  loadQueueState,
  saveQueueState
};
