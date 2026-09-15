"use strict";

const fs = require("fs");
const path = require("path");

const PACK_NAMES = [
  "Dockerfile",
  "docker-compose.yml",
  "docker-entrypoint.sh",
  "README.md",
  "package.json",
  "worker.js",
  "lib/encode.js",
  "lib/scan.js",
  "lib/progress.js",
  "lib/nas-config.js",
  "lib/nas-mount.js",
  "public/index.html",
  "public/app.js",
  "public/styles.css"
];

function crc32(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

function dosDateTime(date = new Date()) {
  const dosTime = (date.getSeconds() >> 1) | (date.getMinutes() << 5) | (date.getHours() << 11);
  const dosDate = date.getDate() | ((date.getMonth() + 1) << 5) | ((date.getFullYear() - 1980) << 9);
  return { dosTime, dosDate };
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime();
  for (const file of files) {
    const name = Buffer.from(String(file.name || "").replace(/\\/g, "/"), "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || "", "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const localFile = Buffer.concat([local, name, data]);
    localParts.push(localFile);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([central, name]));
    offset += localFile.length;
  }
  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDir, eocd]);
}

function resolveWorkerDir() {
  const env = String(process.env.FREEZER_WORKER_DIR || "").trim();
  const candidates = [
    env,
    path.join(__dirname, "freezer-worker"),
    path.join(__dirname, "..", "freezer-worker"),
    path.join(__dirname, "..", "..", "freezer-worker")
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "Dockerfile")) && fs.existsSync(path.join(dir, "worker.js"))) return dir;
  }
  return null;
}

function filesFromDisk() {
  const dir = resolveWorkerDir();
  if (!dir) throw new Error("Encode worker package files were not found on this NAS.");
  return PACK_NAMES.map((name) => {
    const abs = path.join(dir, name);
    if (!fs.existsSync(abs)) throw new Error(`Missing worker file: ${name}`);
    return {
      name: `cinarip-freezer-worker/${name}`,
      data: fs.readFileSync(abs)
    };
  });
}

function inlinedWorkerFiles() {
  const packed = globalThis.CINARIP_FREEZER_WORKER_FILES;
  return Array.isArray(packed) ? packed : null;
}

function getWorkerFiles() {
  const packed = inlinedWorkerFiles();
  if (packed) {
    return packed.map((file) => ({
      name: file.name,
      data: Buffer.from(file.data, file.encoding === "base64" ? "base64" : "utf8")
    }));
  }
  return filesFromDisk();
}

function buildWorkerZip() {
  return buildZip(getWorkerFiles());
}

module.exports = {
  PACK_NAMES,
  crc32,
  buildZip,
  resolveWorkerDir,
  getWorkerFiles,
  buildWorkerZip
};
