"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { verifyEncoded, shouldEncode, compressPlaybackFile, readSidecar } = require("../../freezer-worker/lib/encode");

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-nas-encode-"));
}

function writeFile(filePath, bytes = 2048) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.alloc(bytes, 7));
}

describe("worker encode rules used by NAS Freezer", () => {
  it("verifies before replace and rejects a bad duration", () => {
    const source = { duration: 50, hasVideo: true, hasAudio: true };
    assert.equal(verifyEncoded(source, { duration: 50.5, hasVideo: true, hasAudio: true }, 800).ok, true);
    assert.equal(verifyEncoded(source, { duration: 10, hasVideo: true, hasAudio: true }, 800).ok, false);
  });

  it("does not re-encode already compressed files", () => {
    assert.equal(shouldEncode("Freezer/Dune.mp4", { meta: { status: "done" } }).skip, true);
  });

  it("failed encode leaves the playback original in place", async () => {
    const root = makeRoot();
    const playback = path.join(root, "Freezer", "Heat.mp4");
    writeFile(playback, 4096);
    const result = await compressPlaybackFile(playback, {
      videoRoot: root,
      encodeFn: async () => ({ ok: false, reason: "ffmpeg exploded" })
    });
    assert.equal(result.ok, false);
    assert.equal(fs.statSync(playback).size, 4096);
    assert.equal(readSidecar(playback).status, "failed");
    fs.rmSync(root, { recursive: true, force: true });
  });
});
