const fs = require("fs");
const path = require("path");

function existingAncestor(folderPath) {
  let current = String(folderPath || "").trim();
  if (!current) return "";

  for (let i = 0; i < 12; i++) {
    try {
      if (fs.existsSync(current)) return current;
    } catch {
      // Keep walking toward the root.
    }
    const parent = path.dirname(current);
    if (!parent || parent === current) break;
    current = parent;
  }

  return folderPath;
}

function getFolderStorage(folderPath) {
  const target = String(folderPath || "").trim();
  if (!target) {
    return { ok: false, error: "No folder set" };
  }

  try {
    const probePath = existingAncestor(target);
    const stats = fs.statfsSync(probePath);
    const blockSize = Number(stats.bsize) || 0;
    const total = Number(stats.blocks) * blockSize;
    const available = Number(stats.bavail ?? stats.bfree) * blockSize;

    if (!Number.isFinite(total) || total <= 0) {
      return { ok: false, path: target, error: "Could not read folder capacity" };
    }

    const used = Math.max(0, total - Math.max(0, available));
    return {
      ok: true,
      path: target,
      total,
      available: Math.max(0, available),
      used,
      usedPercent: (used / total) * 100
    };
  } catch (error) {
    return {
      ok: false,
      path: target,
      error: error.message || "Could not read folder storage"
    };
  }
}

module.exports = {
  getFolderStorage
};
