"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  DEFAULT_NAS_ORIGIN,
  DEFAULT_SMB_HOST,
  normalizeNasOrigin,
  nasStatusUrl,
  resolveNasOrigin,
  writeSavedNasOrigin,
  writeConfig,
  readConfig,
  publicConfig,
  ensureFreezer,
  classifyIoError,
  WRITE_HELP
} = require("../lib/nas-config");

describe("nas-config", () => {
  it("defaults to the public CinaRip origin", () => {
    assert.equal(DEFAULT_NAS_ORIGIN, "https://cinarip.matthewsuess.com");
    assert.equal(DEFAULT_SMB_HOST, "100.95.66.124");
    assert.equal(normalizeNasOrigin(""), DEFAULT_NAS_ORIGIN);
    assert.equal(nasStatusUrl(""), "https://cinarip.matthewsuess.com/api/freezer/status");
  });

  it("accepts host:port without a scheme", () => {
    assert.equal(normalizeNasOrigin("100.95.66.124:8787"), "http://100.95.66.124:8787");
    assert.equal(normalizeNasOrigin("cinarip.matthewsuess.com"), "https://cinarip.matthewsuess.com");
  });

  it("prefers a saved UI origin over env", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-nas-cfg-"));
    fs.mkdirSync(path.join(root, "Freezer"));
    writeSavedNasOrigin(root, "http://terranovacloud:8787");
    assert.equal(
      resolveNasOrigin(root, {
        NAS_ORIGIN: "https://cinarip.matthewsuess.com",
        NAS_STATUS_URL: "https://cinarip.matthewsuess.com/api/freezer/status"
      }),
      "http://terranovacloud:8787"
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("uses env then the public default when nothing is saved", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-nas-cfg-"));
    assert.equal(
      resolveNasOrigin(root, { NAS_ORIGIN: "http://example.nas:8787" }),
      "http://example.nas:8787"
    );
    assert.equal(resolveNasOrigin(root, {}), DEFAULT_NAS_ORIGIN);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("saves SMB login without exposing the password in publicConfig", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-nas-smb-"));
    const cfgRoot = path.join(root, "config");
    writeConfig(cfgRoot, path.join(root, "videos"), {
      smbHost: "100.95.66.124",
      smbShare: "Public",
      smbVideos: "Videos",
      smbUsername: "Matthew",
      smbPassword: "secret-pass"
    });
    const saved = readConfig(cfgRoot, path.join(root, "videos"));
    assert.equal(saved.smbUsername, "Matthew");
    assert.equal(saved.smbPassword, "secret-pass");
    const pub = publicConfig(saved);
    assert.equal(pub.hasPassword, true);
    assert.equal(pub.smbPassword, undefined);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps the previous password when the field is left blank", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-nas-keep-"));
    const cfgRoot = path.join(root, "config");
    writeConfig(cfgRoot, null, { smbUsername: "Matthew", smbPassword: "one" });
    writeConfig(cfgRoot, null, { smbUsername: "Matthew" });
    assert.equal(readConfig(cfgRoot, null).smbPassword, "one");
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("ensureFreezer write probe", () => {
  it("creates Freezer/ and proves it is writable", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-ensure-"));
    const status = ensureFreezer(root);
    assert.equal(status.freezerExists, true);
    assert.equal(status.created, true);
    assert.equal(status.writable, true);
    assert.equal(fs.existsSync(path.join(root, "Freezer", ".cinarip-write-test")), false);
    assert.equal(status.state, "warning");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports a writable error when the write probe fails", () => {
    const err = new Error("denied");
    err.code = "EACCES";
    const fakeFs = {
      existsSync: () => true,
      readdirSync: () => [],
      mkdirSync: () => {},
      statSync: () => ({ isDirectory: () => true }),
      writeFileSync: () => {
        throw err;
      },
      unlinkSync: () => {}
    };
    const status = ensureFreezer("/videos", fakeFs);
    assert.equal(status.state, "error");
    assert.equal(status.writable, false);
    assert.match(status.error, /not writable/);
    assert.match(status.error, /Docker Desktop/);
  });

  it("classifies missing and permission errors", () => {
    const missing = new Error("gone");
    missing.code = "ENOENT";
    assert.match(classifyIoError(missing), /not mounted/);
    const denied = new Error("denied");
    denied.code = "EACCES";
    assert.match(classifyIoError(denied), /not writable/);
    assert.match(WRITE_HELP, /write/);
  });
});
