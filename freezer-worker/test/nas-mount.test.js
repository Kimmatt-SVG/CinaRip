"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { smbUnc, videosRootFromMount, classifySmbError, mountCifs } = require("../lib/nas-mount");

describe("nas-mount", () => {
  it("builds UNC and Videos subpath", () => {
    assert.equal(smbUnc("100.95.66.124", "Public"), "//100.95.66.124/Public");
    assert.match(videosRootFromMount("/mnt/nas", "Videos"), /Videos$/);
  });

  it("maps mount error 13 to wrong password", () => {
    assert.match(classifySmbError("mount error(13): Permission denied"), /Wrong NAS username or password/);
  });

  it("requires username and password before mount", () => {
    const result = mountCifs({
      host: "100.95.66.124",
      share: "Public",
      username: "",
      password: "",
      target: "/mnt/nas",
      configRoot: "/tmp"
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /username and password/);
  });

  it("does not put the password on the mount command line", () => {
    let args;
    const spawn = (cmd, argv) => {
      if (cmd === "mount") args = argv;
      return { status: 0, stdout: "", stderr: "" };
    };
    const writes = [];
    const io = {
      mkdirSync: () => {},
      writeFileSync: (file, data) => writes.push({ file, data })
    };
    const result = mountCifs(
      {
        host: "100.95.66.124",
        share: "Public",
        username: "Matthew",
        password: "super-secret",
        target: "/mnt/nas",
        configRoot: "/config"
      },
      spawn,
      io
    );
    assert.equal(result.ok, true);
    assert.equal(String(args).includes("super-secret"), false);
    assert.match(writes[0].data, /password=super-secret/);
  });
});
