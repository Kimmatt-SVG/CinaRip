"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findImpersonateBin, missingTlsMessage } = require("../lib/chrome-tls");

describe("Chrome TLS binary lookup", () => {
  it("returns empty when nothing exists", () => {
    const bin = findImpersonateBin({
      env: {},
      dirs: ["/tmp/missing-a", "/tmp/missing-b"],
      isFile: () => false,
      readDir: () => {
        throw new Error("ENOENT");
      }
    });
    assert.equal(bin, "");
  });

  it("does not treat a directory as the binary", () => {
    const bin = findImpersonateBin({
      env: { CURL_IMPERSONATE_BIN: "/opt/curl-impersonate" },
      dirs: ["/opt/curl-impersonate"],
      isFile: () => false,
      readDir: () => [".gitkeep"]
    });
    assert.equal(bin, "");
  });

  it("prefers a host overlay file over the image path", () => {
    const host = path.join("/opt/curl-impersonate-host", "curl-impersonate");
    const image = path.join("/opt/curl-impersonate", "curl-impersonate");
    const files = new Set([host, image]);
    const bin = findImpersonateBin({
      env: {},
      dirs: [path.join("/opt/curl-impersonate-host"), path.join("/opt/curl-impersonate")],
      isFile: (file) => files.has(file),
      readDir: () => []
    });
    assert.equal(bin, host);
  });

  it("uses CURL_IMPERSONATE_BIN when it is a real file", () => {
    const bin = findImpersonateBin({
      env: { CURL_IMPERSONATE_BIN: "/custom/curl-impersonate" },
      dirs: ["/opt/curl-impersonate"],
      isFile: (file) => file === "/custom/curl-impersonate",
      readDir: () => []
    });
    assert.equal(bin, "/custom/curl-impersonate");
  });

  it("finds curl_chrome131 in the image directory", () => {
    const chrome = path.join("/opt/curl-impersonate", "curl_chrome131");
    const bin = findImpersonateBin({
      env: {},
      dirs: [path.join("/opt/curl-impersonate")],
      isFile: (file) => file === chrome,
      readDir: (dir) => (dir === path.join("/opt/curl-impersonate") ? ["curl_chrome131"] : [])
    });
    assert.equal(bin, chrome);
  });

  it("discovers binaries in a real temp folder even when env points at a directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-tls-"));
    const binary = path.join(dir, "curl-impersonate");
    fs.writeFileSync(binary, "#!/bin/sh\n");
    try {
      const bin = findImpersonateBin({
        env: { CURL_IMPERSONATE_BIN: dir },
        dirs: [dir]
      });
      assert.equal(bin, binary);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("explains the empty curl-bin overlay in the missing-binary message", () => {
    assert.match(missingTlsMessage(), /curl-bin/);
    assert.match(missingTlsMessage(), /docker compose up -d --build/);
  });
});
