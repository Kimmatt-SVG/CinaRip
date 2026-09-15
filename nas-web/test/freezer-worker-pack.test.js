"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildWorkerZip, getWorkerFiles, PACK_NAMES } = require("../lib/freezer-worker-pack");

describe("freezer worker zip pack", () => {
  it("builds a zip that includes the worker UI, Dockerfile, and compose file", () => {
    const files = getWorkerFiles();
    const names = files.map((file) => file.name.replace(/\\/g, "/"));
    for (const name of PACK_NAMES) {
      assert.equal(names.includes(`cinarip-freezer-worker/${name}`), true, name);
    }
    assert.equal(names.some((name) => name.endsWith("public/index.html")), true);
    assert.equal(names.some((name) => name.endsWith("lib/progress.js")), true);
    const zip = buildWorkerZip();
    assert.ok(zip.length > 100);
    assert.equal(zip.slice(0, 2).toString("utf8"), "PK");
    const asText = zip.toString("utf8");
    assert.match(asText, /Start Freezer/);
    assert.match(asText, /Cool Down/);
    assert.doesNotMatch(asText, /node_modules/);
  });
});
