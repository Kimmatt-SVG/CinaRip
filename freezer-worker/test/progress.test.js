"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseFfmpegProgress, encodePercent, RateWindow, copyFileWithProgress, formatBps } = require("../lib/progress");

describe("ffmpeg progress parsing", () => {
  it("reads out_time, fps, and percent from -progress pipe lines", () => {
    const parsed = parseFfmpegProgress(
      "out_time_us=5000000\nfps=23.98\nspeed=1.2x\nprogress=continue\n"
    );
    assert.equal(parsed.outTimeSec, 5);
    assert.equal(parsed.fps, 23.98);
    assert.equal(encodePercent(parsed, 10), 50);
  });
});

describe("transfer rates and copy progress", () => {
  it("reports 0 after idle instead of a stale speed", () => {
    const rate = new RateWindow(1500, 2000);
    rate.add(2_000_000, 1000);
    rate.add(2_000_000, 1500);
    assert.ok(rate.bps(1600) > 0);
    assert.equal(rate.bps(4000), 0);
    assert.equal(formatBps(0), "—");
  });

  it("copies with real byte counts", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-copy-"));
    const src = path.join(root, "src.bin");
    const dest = path.join(root, "dest.bin");
    fs.writeFileSync(src, Buffer.alloc(4096, 3));
    const samples = [];
    await copyFileWithProgress(src, dest, (xfer) => samples.push(xfer));
    assert.equal(fs.statSync(dest).size, 4096);
    assert.ok(samples.length);
    assert.equal(samples[samples.length - 1].copied, 4096);
    assert.equal(samples[samples.length - 1].percent, 100);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
