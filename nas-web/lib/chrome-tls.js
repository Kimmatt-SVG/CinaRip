"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_DIRS = ["/opt/curl-impersonate-host", "/opt/curl-impersonate"];

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function listImpersonateFiles(dir, readDir, isFileFn) {
  try {
    return readDir(dir)
      .filter((name) => /^(curl-impersonate|curl_chrome)/i.test(name))
      .map((name) => path.join(dir, name))
      .filter((file) => isFileFn(file));
  } catch {
    return [];
  }
}

function pickPreferred(files) {
  return (
    files.find((file) => /curl-impersonate$/i.test(file)) ||
    files.find((file) => /chrome131/i.test(file)) ||
    files[0] ||
    ""
  );
}

function findImpersonateBin(options = {}) {
  const env = options.env || process.env;
  const isFileFn = options.isFile || isFile;
  const readDir = options.readDir || ((dir) => fs.readdirSync(dir));
  const dirs = options.dirs || DEFAULT_DIRS;

  const named = [
    env.CURL_IMPERSONATE_BIN,
    ...dirs.flatMap((dir) => [path.join(dir, "curl-impersonate"), path.join(dir, "curl_chrome131")]),
    "/usr/local/bin/curl_chrome131"
  ].filter(Boolean);

  const fromNamed = named.find((file) => isFileFn(file));
  if (fromNamed) return fromNamed;

  for (const dir of dirs) {
    const preferred = pickPreferred(listImpersonateFiles(dir, readDir, isFileFn));
    if (preferred) return preferred;
  }
  return "";
}

function missingTlsMessage() {
  return (
    "Chrome TLS (curl-impersonate) is missing. An empty curl-bin folder was covering the image binary. " +
    "Copy docker-compose.yml, then on the NAS run: sudo docker compose up -d --build"
  );
}

module.exports = {
  findImpersonateBin,
  missingTlsMessage,
  DEFAULT_DIRS
};
