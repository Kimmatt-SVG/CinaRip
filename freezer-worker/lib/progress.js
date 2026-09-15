"use strict";

const fs = require("fs");
const path = require("path");

function fileSize(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() ? stat.size : 0;
  } catch {
    return 0;
  }
}

function formatBps(bps) {
  const n = Number(bps);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n.toFixed(0)} B/s`;
  const units = ["KB/s", "MB/s", "GB/s"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function parseFfmpegProgress(chunk, acc = {}) {
  const out = { ...acc };
  const text = `${acc._buf || ""}${String(chunk || "")}`;
  const lines = text.split(/\r?\n/);
  out._buf = lines.pop() || "";
  for (const line of lines) {
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === "out_time_us") out.outTimeUs = Number(value);
    else if (key === "out_time_ms") out.outTimeMs = Number(value);
    else if (key === "fps") out.fps = Number(value);
    else if (key === "speed") out.speed = value;
    else if (key === "total_size") out.totalSize = Number(value);
    else if (key === "bitrate") out.bitrate = value;
    else if (key === "frame") out.frame = Number(value);
    else if (key === "progress") out.progress = value;
  }
  const timeSec =
    Number(out.outTimeUs) > 0
      ? out.outTimeUs / 1e6
      : Number(out.outTimeMs) > 0
        ? out.outTimeMs / 1000
        : 0;
  out.outTimeSec = timeSec;
  return out;
}

function encodePercent(progress, durationSec) {
  const timeSec = Number(progress?.outTimeSec) || 0;
  const duration = Number(durationSec) || 0;
  if (duration <= 0) return timeSec > 0 ? 1 : 0;
  return Math.max(0, Math.min(100, (timeSec / duration) * 100));
}

class RateWindow {
  constructor(idleMs = 1500, windowMs = 2000) {
    this.idleMs = idleMs;
    this.windowMs = windowMs;
    this.events = [];
  }

  add(bytes, at = Date.now()) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return;
    this.events.push({ at, bytes: n });
    this.prune(at);
  }

  prune(at = Date.now()) {
    this.events = this.events.filter((event) => at - event.at <= this.windowMs);
  }

  bps(at = Date.now()) {
    this.prune(at);
    if (!this.events.length) return 0;
    const last = this.events[this.events.length - 1];
    if (at - last.at > this.idleMs) return 0;
    const first = this.events[0];
    const elapsed = Math.max(1, last.at - first.at);
    const total = this.events.reduce((sum, event) => sum + event.bytes, 0);
    if (elapsed < 80) return total * (1000 / Math.max(elapsed, 1));
    return (total * 1000) / elapsed;
  }

  reset() {
    this.events = [];
  }
}

function copyFileWithProgress(src, dest, onBytes) {
  return new Promise((resolve, reject) => {
    const total = fileSize(src);
    if (total <= 0) {
      reject(new Error("Source file is empty"));
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const rs = fs.createReadStream(src);
    const ws = fs.createWriteStream(dest);
    let copied = 0;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) {
        try {
          ws.destroy();
        } catch {
          // ignore
        }
        try {
          fs.unlinkSync(dest);
        } catch {
          // ignore
        }
        reject(error);
        return;
      }
      resolve({ copied, total });
    };
    rs.on("data", (chunk) => {
      copied += chunk.length;
      if (onBytes) onBytes({ copied, total, percent: (copied / total) * 100 });
    });
    rs.on("error", finish);
    ws.on("error", finish);
    ws.on("finish", () => finish());
    rs.pipe(ws);
  });
}

module.exports = {
  fileSize,
  formatBps,
  parseFfmpegProgress,
  encodePercent,
  RateWindow,
  copyFileWithProgress
};
