"use strict";

const fs = require("fs");
const path = require("path");

const root = __dirname;

function stripModule(source) {
  let text = String(source).replace(/^\uFEFF/, "");
  text = text.replace(/^["']use strict["'];\r?\n/, "");
  const drop = [
    /const fs = require\("fs"\);\r?\n/,
    /const http = require\("http"\);\r?\n/,
    /const https = require\("https"\);\r?\n/,
    /const \{ URL \} = require\("url"\);\r?\n/,
    /const \{ Transform \} = require\("stream"\);\r?\n/,
    /const \{ pipeline \} = require\("stream\/promises"\);\r?\n/,
    /const path = require\("path"\);\r?\n/,
    /const \{ spawn \} = require\("child_process"\);\r?\n/,
    /const \{[\s\S]*?\} = require\("\.\/(?:content-url|search-parse|tv-show-parse|download-queue|download-paths|queue-store|chrome-tls|tornado-session|tornado|http-download|artwork|freezer|freezer-worker-pack|pin-auth|library-delete)"\);\r?\n/g
  ];
  for (const pattern of drop) text = text.replace(pattern, "");
  text = text.replace(/\r?\nmodule\.exports = \{[\s\S]*?\};\s*$/, "\n");
  return text.trim();
}

function iife(exportsList, body) {
  return `const { ${exportsList} } = (() => {\n${body}\n  return { ${exportsList} };\n})();\n`;
}

const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const portAt = server.indexOf("\nconst PORT = Number(process.env.PORT)");
if (portAt < 0) {
  console.error("Could not find PORT marker in server.js");
  process.exit(1);
}
const rest = server.slice(portAt + 1);

const contentUrl = stripModule(fs.readFileSync(path.join(root, "lib", "content-url.js"), "utf8"));
const downloadPaths = stripModule(fs.readFileSync(path.join(root, "lib", "download-paths.js"), "utf8"));
const searchParse = stripModule(fs.readFileSync(path.join(root, "lib", "search-parse.js"), "utf8"));
const tvShowParse = stripModule(fs.readFileSync(path.join(root, "lib", "tv-show-parse.js"), "utf8"));
const downloadQueue = stripModule(fs.readFileSync(path.join(root, "lib", "download-queue.js"), "utf8"));
const queueStore = stripModule(fs.readFileSync(path.join(root, "lib", "queue-store.js"), "utf8"));
const chromeTls = stripModule(fs.readFileSync(path.join(root, "lib", "chrome-tls.js"), "utf8"));
const tornadoSession = stripModule(fs.readFileSync(path.join(root, "lib", "tornado-session.js"), "utf8"));
const httpDl = stripModule(fs.readFileSync(path.join(root, "lib", "http-download.js"), "utf8"));
const tornado = stripModule(fs.readFileSync(path.join(root, "lib", "tornado.js"), "utf8"));
const artwork = stripModule(fs.readFileSync(path.join(root, "lib", "artwork.js"), "utf8"));
const freezer = stripModule(fs.readFileSync(path.join(root, "lib", "freezer.js"), "utf8"));
const freezerWorkerPack = stripModule(fs.readFileSync(path.join(root, "lib", "freezer-worker-pack.js"), "utf8"));
const downloads = stripModule(fs.readFileSync(path.join(root, "lib", "downloads.js"), "utf8"));
const pinAuth = stripModule(fs.readFileSync(path.join(root, "lib", "pin-auth.js"), "utf8"));
const libraryDelete = stripModule(fs.readFileSync(path.join(root, "lib", "library-delete.js"), "utf8"));

function workerPackJson() {
  const dir = path.join(root, "..", "freezer-worker");
  const names = [
    "Dockerfile",
    "docker-compose.yml",
    "docker-entrypoint.sh",
    "README.md",
    "package.json",
    "worker.js",
    "lib/encode.js",
    "lib/scan.js",
    "lib/progress.js",
    "lib/nas-config.js",
    "lib/nas-mount.js",
    "public/index.html",
    "public/app.js",
    "public/styles.css"
  ];
  return names.map((name) => ({
    name: `cinarip-freezer-worker/${name}`,
    encoding: "utf8",
    data: fs.readFileSync(path.join(dir, name), "utf8")
  }));
}

const prelude = `"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");

${iife(
  "BASE_URL, decodeHtml, normalizeHref, classifyContentUrl, canonicalMoviePageUrl, canonicalContentUrl, normalizeMovieUrl, extractMovieIdFromUrl, extractEpisodeWatchId, extractDownloadIds, extractPageDownloadIds, mergeDownloadIds, titleFromUrl, titleFromMovieUrl, isCatalogTvItem, isTvShowPageUrl, isWatchingEpisodeUrl, episodeFileLabel, safeShowFolderName, showBaseSlugFromUrl, seasonNumberFromUrl, parseTornadoSeriesUrl, toSeasonHubUrl, slugMatchesCurrentShow, catalogCounts",
  contentUrl
)}
${iife("fileNameFromLink, episodeFileName, movieOutputPath, episodeOutputPath", downloadPaths)}
${iife("parseSearchResults, parseSearchHtml", searchParse)}
${iife("parseTvShowPage, buildTvShowPlan, extractPosterUrl, readShowMeta, dedupeEpisodes, normalizeEpisodeNumbers, guessSeasonHubUrls, guessShowHubUrls, mergeSeasonLists", tvShowParse)}
${iife("DownloadQueue", downloadQueue)}
${iife("loadQueueState, saveQueueState, defaultStorePath", queueStore)}
${iife("downloadHttpFile", httpDl)}
${iife("findImpersonateBin, missingTlsMessage", chromeTls)}
${iife("requireRecaptcha, isVerificationError, parseCsrfFromHtml, isDownloadLoginWall, downloadLoginWallMessage, hasIdentityCookie, evaluateSessionStatus", tornadoSession)}
${iife("TornadoClient", tornado)}
${iife("posterPathForVideo, mediaServerPosterPath, pickArtworkUrlFromHtml, showFolderFromEpisodePath, saveArtworkFromUrl, saveShowPoster", artwork)}
globalThis.CINARIP_FREEZER_WORKER_FILES = ${JSON.stringify(workerPackJson())};
${iife("toPosixRel, isFrozenRel, isOriginalVideoName, isTempEncodeName, classifyLibraryRel, classifyLibraryRels, freezerMovieDest, thawMovieDest, freezerShowDest, thawShowDest, freezerDestForRel, thawDestForRel, sidecarPathsForVideo, movePath, moveVideoWithSidecars, compressInfoForVideo, compressInfoForRels, freezeMovie, thawMovie, freezeShow, thawShow, restoreOriginal, discardOriginal, writableNasError", freezer)}
${iife("buildWorkerZip, getWorkerFiles", freezerWorkerPack)}
${iife("DownloadRunner", downloads)}
${iife("SESSION_COOKIE_NAME, DEFAULT_SESSION_TTL_SEC, loadDotEnv, parseEnv, logAuthStartup, publicAuthConfig, publicSessionJson, cookieHeader, appendSetCookie, sessionFromRequest, buildSessionCookie, isPublicPath, wantsHtml, loginRedirectLocation, verifyPinAttempt, clearAuthCookies", pinAuth)}
${iife("deleteVideoRel, deleteVideoRels", libraryDelete)}
`;

fs.writeFileSync(path.join(root, "server.js"), `${prelude}\n${rest}`);
console.log("Wrote bundled server.js", fs.statSync(path.join(root, "server.js")).size, "bytes");
