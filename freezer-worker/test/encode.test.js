"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  durationClose,
  verifyEncoded,
  shouldEncode,
  writeSidecar,
  readSidecar,
  originalVaultPath,
  compressPlaybackFile,
  replacePlaybackWithTemp
} = require("../lib/encode");

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-encode-"));
}

function writeFile(filePath, bytes = 2048) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.alloc(bytes, 7));
}

describe("encode verify-before-replace", () => {
  it("accepts duration within 2s or 2%", () => {
    assert.equal(durationClose(100, 101.5), true);
    assert.equal(durationClose(100, 103), false);
    assert.equal(durationClose(200, 196.1), true);
  });

  it("rejects empty files, missing video, and missing audio when source had audio", () => {
    const source = { duration: 10, hasVideo: true, hasAudio: true };
    assert.equal(verifyEncoded(source, { duration: 10, hasVideo: true, hasAudio: true }, 100).ok, true);
    assert.equal(verifyEncoded(source, { duration: 10, hasVideo: true, hasAudio: true }, 0).ok, false);
    assert.equal(verifyEncoded(source, { duration: 10, hasVideo: false, hasAudio: true }, 100).ok, false);
    assert.equal(verifyEncoded(source, { duration: 10, hasVideo: true, hasAudio: false }, 100).ok, false);
    assert.match(verifyEncoded(source, { duration: 40, hasVideo: true, hasAudio: true }, 100).reason, /duration/);
  });

  it("does not re-encode a file marked done", () => {
    assert.equal(shouldEncode("/videos/Freezer/Dune.mp4", { meta: { status: "done" } }).skip, true);
    assert.equal(shouldEncode("/videos/Freezer/Dune.mp4", { meta: { status: "pending" } }).skip, false);
    assert.equal(
      shouldEncode("/videos/Freezer/Dune.original.mp4", { meta: { status: "pending" } }).skip,
      true
    );
  });

  it("skips when an original vault copy exists and there is no sidecar", () => {
    const root = makeRoot();
    const playback = path.join(root, "Freezer", "Heat.mp4");
    writeFile(playback);
    const originalAbs = originalVaultPath(root, playback);
    writeFile(originalAbs, 4096);
    const decision = shouldEncode(playback, { videoRoot: root, originalAbs, meta: null });
    assert.equal(decision.skip, true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("compressPlaybackFile safety", () => {
  it("replaces playback only after verify passes and keeps the original copy", async () => {
    const root = makeRoot();
    const playback = path.join(root, "Freezer", "Dune.mp4");
    writeFile(playback, 4096);
    const result = await compressPlaybackFile(playback, {
      videoRoot: root,
      probeFn: async () => ({ duration: 12, hasVideo: true, hasAudio: true }),
      encodeFn: async (_src, tmp) => {
        writeFile(tmp, 512);
        return { ok: true };
      }
    });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, false);
    assert.equal(fs.statSync(playback).size, 512);
    const original = originalVaultPath(root, playback);
    assert.equal(fs.existsSync(original), true);
    assert.equal(fs.statSync(original).size, 4096);
    assert.equal(readSidecar(playback).status, "done");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("leaves the original playback untouched when verify fails and deletes the temp", async () => {
    const root = makeRoot();
    const playback = path.join(root, "Freezer", "Heat.mp4");
    writeFile(playback, 4096);
    const result = await compressPlaybackFile(playback, {
      videoRoot: root,
      probeFn: async (filePath) => {
        if (String(filePath).includes(".tmp.")) {
          return { duration: 1, hasVideo: true, hasAudio: true };
        }
        return { duration: 40, hasVideo: true, hasAudio: true };
      },
      encodeFn: async (_src, tmp) => {
        writeFile(tmp, 512);
        return { ok: true };
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, "failed");
    assert.equal(fs.statSync(playback).size, 4096);
    assert.equal(fs.existsSync(`${playback}.cinarip-compress.tmp.mp4`), false);
    assert.equal(readSidecar(playback).status, "failed");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("does not encode again after a successful compress", async () => {
    const root = makeRoot();
    const playback = path.join(root, "Freezer", "Heat.mp4");
    writeFile(playback, 2048);
    writeSidecar(playback, { status: "done", originalKept: true });
    let encodes = 0;
    const result = await compressPlaybackFile(playback, {
      videoRoot: root,
      encodeFn: async () => {
        encodes += 1;
        return { ok: true };
      }
    });
    assert.equal(result.skipped, true);
    assert.equal(encodes, 0);
    assert.equal(fs.statSync(playback).size, 2048);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("does not overwrite in place when swapping in the temp file", async () => {
    const root = makeRoot();
    const src = path.join(root, "Freezer", "Clip.mp4");
    const tmp = `${src}.cinarip-compress.tmp.mp4`;
    writeFile(src, 2048);
    writeFile(tmp, 256);
    const finalPath = await replacePlaybackWithTemp(src, tmp);
    assert.equal(finalPath, src);
    assert.equal(fs.statSync(src).size, 256);
    assert.equal(fs.existsSync(tmp), false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports download, encode, and upload stages with real percents", async () => {
    const root = makeRoot();
    const playback = path.join(root, "Freezer", "Dune.mp4");
    writeFile(playback, 8192);
    const stages = [];
    await compressPlaybackFile(playback, {
      videoRoot: root,
      probeFn: async () => ({ duration: 12, hasVideo: true, hasAudio: true }),
      encodeFn: async (_src, tmp) => {
        writeFile(tmp, 1024);
        return { ok: true };
      },
      onProgress: (info) => stages.push(info.stage)
    });
    assert.equal(stages.includes("download"), true);
    assert.equal(stages.includes("encode"), true);
    assert.equal(stages.includes("upload"), true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
