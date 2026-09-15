"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { mountStatus } = require("../worker");
const { ensureFreezer } = require("../lib/nas-config");

describe("mountStatus creates Freezer/", () => {
  it("creates missing Freezer/ and returns a warning instead of a hard error", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-mount-"));
    const freezer = path.join(root, "Freezer");
    assert.equal(fs.existsSync(freezer), false);
    const status = mountStatus(root);
    assert.equal(fs.existsSync(freezer) && fs.statSync(freezer).isDirectory(), true);
    assert.equal(status.freezerExists, true);
    assert.equal(status.created, true);
    assert.equal(status.empty, true);
    assert.equal(status.state, "warning");
    assert.match(status.error, /Created missing Freezer/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("warns when Freezer/ already exists but is empty", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-mount-"));
    fs.mkdirSync(path.join(root, "Freezer"));
    const status = mountStatus(root);
    assert.equal(status.created, false);
    assert.equal(status.empty, true);
    assert.equal(status.state, "warning");
    assert.match(status.error, /empty/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports connected when Freezer/ has titles", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-mount-"));
    const freezer = path.join(root, "Freezer");
    fs.mkdirSync(freezer);
    fs.writeFileSync(path.join(freezer, "Movie.mp4"), Buffer.alloc(32));
    const status = mountStatus(root);
    assert.equal(status.state, "connected");
    assert.equal(status.freezerExists, true);
    assert.equal(status.empty, false);
    assert.equal(status.error, null);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("stays disconnected when Videos is not mounted", () => {
    const missing = path.join(os.tmpdir(), "cinarip-mount-missing-" + Date.now());
    const status = mountStatus(missing);
    assert.equal(status.state, "disconnected");
    assert.equal(status.freezerExists, false);
    assert.match(status.error, /not mounted/);
  });

  it("proves Freezer/ is writable and does not leave the probe file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-mount-"));
    const status = mountStatus(root);
    assert.equal(status.writable, true);
    assert.equal(fs.existsSync(path.join(root, "Freezer", ".cinarip-write-test")), false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports error when Videos is not writable", () => {
    const err = new Error("EACCES");
    err.code = "EACCES";
    const status = ensureFreezer("/videos", {
      existsSync: (target) => String(target).replace(/\\/g, "/") === "/videos",
      readdirSync: () => [],
      mkdirSync: () => {
        throw err;
      },
      statSync: () => ({ isDirectory: () => true }),
      writeFileSync: () => {},
      unlinkSync: () => {}
    });
    assert.equal(status.state, "error");
    assert.match(status.error, /not writable/);
  });
});
