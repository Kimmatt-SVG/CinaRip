"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { absFromRel, deleteVideoRel, deleteVideoRels } = require("../lib/library-delete");

describe("library delete", () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-delete-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("rejects empty and escaped paths", () => {
    assert.throws(() => absFromRel(root, ""), /Missing library path/);
    assert.throws(() => absFromRel(root, "../secret.mp4"), /outside the video library/);
  });

  it("deletes a movie, poster, and compress sidecar, then prunes the empty folder", () => {
    const dir = path.join(root, "Movies", "Narnia");
    fs.mkdirSync(dir, { recursive: true });
    const video = path.join(dir, "narnia.mp4");
    fs.writeFileSync(video, "movie");
    fs.writeFileSync(path.join(dir, "narnia-poster.jpg"), "poster");
    fs.writeFileSync(`${video}.cinarip-compress.json`, "{}");
    const result = deleteVideoRel(root, "Movies/Narnia/narnia.mp4");
    assert.equal(result.ok, true);
    assert.ok(result.removed.includes("Movies/Narnia/narnia.mp4"));
    assert.equal(fs.existsSync(video), false);
    assert.equal(fs.existsSync(path.join(root, "Movies", "Narnia")), false);
  });

  it("keeps a shared folder when another title remains", () => {
    const dir = path.join(root, "TV Shows", "Show", "Season 01");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "s01e01.mp4"), "a");
    fs.writeFileSync(path.join(dir, "s01e02.mp4"), "b");
    deleteVideoRel(root, "TV Shows/Show/Season 01/s01e01.mp4");
    assert.equal(fs.existsSync(path.join(dir, "s01e02.mp4")), true);
    assert.equal(fs.existsSync(dir), true);
  });

  it("deletes every rel in a show batch", () => {
    const dir = path.join(root, "TV Shows", "Show", "Season 01");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "s01e01.mp4"), "a");
    fs.writeFileSync(path.join(dir, "s01e02.mp4"), "b");
    fs.writeFileSync(path.join(root, "TV Shows", "Show", "poster.jpg"), "p");
    const result = deleteVideoRels(root, [
      "TV Shows/Show/Season 01/s01e01.mp4",
      "TV Shows/Show/Season 01/s01e02.mp4"
    ]);
    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(path.join(root, "TV Shows", "Show")), false);
  });
});
