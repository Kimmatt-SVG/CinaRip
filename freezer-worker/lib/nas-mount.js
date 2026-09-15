"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function smbUnc(host, share) {
  const h = String(host || "").trim();
  const s = String(share || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (!h || !s) throw new Error("NAS host and share are required");
  return `//${h}/${s}`;
}

function videosRootFromMount(mountPoint, videosPath) {
  const sub = String(videosPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (!sub) return mountPoint;
  return path.join(mountPoint, ...sub.split("/").filter(Boolean));
}

function classifySmbError(stderr, status) {
  const text = `${stderr || ""} ${status == null ? "" : status}`;
  if (/error\(13\)|permission denied|logon unsuccessful|access denied|nt_status_logon_failure|nt_status_access_denied/i.test(text)) {
    return "Wrong NAS username or password";
  }
  if (/error\(2\)|error\(6\)|no such file|host is down|not found|nt_status_bad_network_name/i.test(text)) {
    return "NAS share was not found";
  }
  if (/error\(115\)|timed out|could not resolve/i.test(text)) {
    return "NAS host timed out or is unreachable";
  }
  const trimmed = String(stderr || "").trim();
  return trimmed ? trimmed.slice(0, 240) : "Could not mount the NAS share";
}

function writeCredentialFile(configRoot, username, password, io = fs) {
  const abs = path.join(configRoot, ".smbcredentials");
  io.mkdirSync(configRoot, { recursive: true });
  io.writeFileSync(abs, `username=${username}\npassword=${password}\n`, { mode: 0o600 });
  return abs;
}

function mountCifs(options, spawn = spawnSync, io = fs) {
  const host = String(options.host || "").trim();
  const share = String(options.share || "").trim();
  const username = String(options.username || "").trim();
  const password = String(options.password || "");
  const target = options.target;
  const configRoot = options.configRoot;
  if (!username || !password) {
    return { ok: false, mounted: false, error: "Enter NAS username and password" };
  }
  io.mkdirSync(target, { recursive: true });
  spawn("umount", ["-l", target], { encoding: "utf8" });
  const credFile = writeCredentialFile(configRoot, username, password, io);
  const unc = smbUnc(host, share);
  const result = spawn(
    "mount",
    [
      "-t",
      "cifs",
      unc,
      target,
      "-o",
      `credentials=${credFile},vers=3.0,uid=0,gid=0,file_mode=0777,dir_mode=0777,iocharset=utf8,nounix,noserverino`
    ],
    { encoding: "utf8" }
  );
  if (result.error && result.error.code === "ENOENT") {
    return { ok: false, mounted: false, error: "cifs-utils is not installed in this image" };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      mounted: false,
      error: classifySmbError(`${result.stderr || ""} ${result.stdout || ""}`, result.status)
    };
  }
  return { ok: true, mounted: true, unc, target, error: null };
}

module.exports = {
  smbUnc,
  videosRootFromMount,
  classifySmbError,
  writeCredentialFile,
  mountCifs
};
