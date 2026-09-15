"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  BASE_URL,
  extractMovieIdFromUrl,
  extractDownloadIds,
  extractPageDownloadIds,
  mergeDownloadIds,
  canonicalMoviePageUrl,
  canonicalContentUrl,
  isTvShowPageUrl,
  isWatchingEpisodeUrl
} = require("./content-url");
const { parseSearchResults, parseSearchHtml } = require("./search-parse");
const { parseTvShowPage, buildTvShowPlan, dedupeEpisodes, normalizeEpisodeNumbers, guessSeasonHubUrls, guessShowHubUrls, mergeSeasonLists } = require("./tv-show-parse");
const { fileNameFromLink } = require("./download-paths");
const { findImpersonateBin, missingTlsMessage } = require("./chrome-tls");
const {
  requireRecaptcha,
  isVerificationError,
  parseCsrfFromHtml,
  isDownloadLoginWall,
  downloadLoginWallMessage,
  hasIdentityCookie,
  evaluateSessionStatus
} = require("./tornado-session");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const API_PATHS = ["getdownload", "getbutton", "getlink"];
const API_TYPES = ["true", "movie", "1", "0"];
const EFFECTIVE_MARK = "__CINARIP_EFFECTIVE__:";
const ACCEPT_JSON = "application/json, text/javascript, */*;q=0.01";
const ACCEPT_HTML = "text/html, */*;q=0.01";
const LINK_PATTERN =
  /(?:https?:)?\/\/(?:[a-z0-9-]+\.)*loadshare\.(?:org|net)\/(?:download|d|file)\/[^\s"'<>\\]+/gi;
const ATTR_LINK_PATTERN =
  /(href|src|action|content|data-href|data-url|data-src|data-file|data-link|data-download)\s*=\s*(["'])([\s\S]*?)\2/gi;
const LOADSHARE_PATH = /loadshare\.(?:org|net)\/(?:download|d|file)\//i;
const LOADSHARE_HOST_RE = /(?:[a-z0-9-]+\.)*loadshare\.(?:org|net)/gi;
const JSON_LINK_KEYS = /^(?:src|file|link|url|download|location|href|source|path)$/i;

function cookiePath() {
  return path.join(process.env.DATA_ROOT || "/data/app", "tornado-cookies.json");
}

function cookieJarPath() {
  return "/tmp/tornado-cookiejar.txt";
}

function impersonateBin() {
  return findImpersonateBin();
}

function curlChildEnv() {
  const env = { ...process.env, HOME: "/tmp" };
  env.CURL_IMPERSONATE = "chrome131";
  return env;
}

function runCurlOnce(bin, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], env: curlChildEnv() });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, timeoutMs + 2000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, error: error.message, stdout: "", stderr: "" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout: stdout.slice(0, 800),
        stderr: stderr.slice(0, 400)
      });
    });
  });
}

function pickHeader(headers, name) {
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === String(name || "").toLowerCase()) return value;
  }
  return "";
}

function chrome131Args(overrides = {}) {
  const accept =
    overrides.accept ||
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  return [
    "--ciphers",
    "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-RSA-AES128-SHA:ECDHE-RSA-AES256-SHA:AES128-GCM-SHA256:AES256-GCM-SHA384:AES128-SHA:AES256-SHA",
    "--curves",
    "X25519:P-256:P-384",
    "-H",
    'sec-ch-ua: "Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "-H",
    "sec-ch-ua-mobile: ?0",
    "-H",
    'sec-ch-ua-platform: "Windows"',
    "-H",
    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "-H",
    `Accept: ${accept}`,
    "-H",
    "Accept-Language: en-US,en;q=0.9",
    "--http1.1",
    "--tlsv1.2",
    "--tls-grease",
    "--compressed"
  ];
}

function writeCurlJar(jar) {
  const lines = ["# Netscape HTTP Cookie File"];
  for (const [name, value] of Object.entries(jar || {})) {
    if (!name || value == null) continue;
    lines.push(`.tornadomovies.co\tTRUE\t/\tTRUE\t1999999999\t${name}\t${value}`);
  }
  fs.mkdirSync(path.dirname(cookieJarPath()), { recursive: true });
  fs.writeFileSync(cookieJarPath(), `${lines.join("\n")}\n`);
}

function readCurlJar() {
  const jar = {};
  try {
    const text = fs.readFileSync(cookieJarPath(), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const parts = line.split("\t");
      if (parts.length < 7) continue;
      const name = parts[5];
      const value = parts.slice(6).join("\t");
      if (name) jar[name] = value;
    }
  } catch {
    // jar not written yet
  }
  return jar;
}

function parseHeaderDump(raw) {
  const blocks = String(raw || "").trim().split(/\r?\n\r?\n/);
  const last = blocks[blocks.length - 1] || "";
  const lines = last.split(/\r?\n/);
  const statusLine = lines.find((line) => /^HTTP\//i.test(line)) || "";
  const status = Number((statusLine.match(/\s(\d{3})\s/) || [])[1] || 0);
  const headers = {};
  const setCookie = [];
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx < 1) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (name === "set-cookie") setCookie.push(value);
    else headers[name] = value;
  }
  return { status, headers, setCookie };
}

function collectLocationHeaders(raw) {
  const locations = [];
  const seen = new Set();
  const add = (value) => {
    const text = String(value || "").trim().replace(/^["']|["']$/g, "");
    if (!text || seen.has(text)) return;
    seen.add(text);
    locations.push(text);
  };
  for (const match of String(raw || "").matchAll(/^(?:Location|X-Redirect|X-Location|Content-Location):\s*(.+)$/gim)) {
    add(match[1]);
  }
  for (const match of String(raw || "").matchAll(/^Refresh:\s*(.+)$/gim)) {
    const value = String(match[1] || "").trim();
    const urlMatch = value.match(/url\s*=\s*([^\s;]+)/i);
    add(urlMatch ? urlMatch[1] : value);
  }
  return locations;
}

function splitHeadersAndBody(raw) {
  let text = String(raw || "").replace(/\r\n/g, "\n");
  let effectiveUrl = "";
  const markAt = text.lastIndexOf(EFFECTIVE_MARK);
  if (markAt >= 0) {
    const after = text.slice(markAt + EFFECTIVE_MARK.length);
    const nl = after.indexOf("\n");
    effectiveUrl = (nl >= 0 ? after.slice(0, nl) : after).trim();
    text = text.slice(0, markAt).replace(/\n+$/, "");
  }
  const locations = collectLocationHeaders(text);
  const matches = [...text.matchAll(/^HTTP\/\d/gm)];
  const start = matches.length ? matches[matches.length - 1].index : 0;
  const rest = text.slice(start);
  const blank = rest.indexOf("\n\n");
  if (blank < 0) return { headerDump: rest, body: "", effectiveUrl, locations };
  return {
    headerDump: rest.slice(0, blank),
    body: rest.slice(blank + 2),
    effectiveUrl,
    locations
  };
}

function runChromeCurl({
  url,
  method = "GET",
  headers = {},
  body = "",
  follow = true,
  cookieJar = "",
  ipv4
} = {}) {
  const bin = impersonateBin();
  if (!bin) {
    return Promise.reject(
      new Error(
        missingTlsMessage()
      )
    );
  }

  const callerAccept = pickHeader(headers, "Accept");
  const args = [...chrome131Args({ accept: callerAccept || undefined })];
  const forceIpv4 = ipv4 === true || (ipv4 !== false && shouldForceIpv4(url));
  const forceIpv6 = !forceIpv4 && prefersIpv6(url);
  if (forceIpv4) args.push("-4");
  else if (forceIpv6) args.push("-6");
  args.push("-sS", "--max-time", "45", "-i", "--max-redirs", "8");
  args.push("-w", `\n${EFFECTIVE_MARK}%{url_effective}`);
  if (cookieJar) {
    args.push("-b", cookieJar, "-c", cookieJar);
  }
  if (follow) args.push("-L");
  if (method && method !== "GET") args.push("-X", method);

  for (const [name, value] of Object.entries(headers)) {
    if (!name || value == null) continue;
    if (/^(user-agent|accept-encoding)$/i.test(name)) continue;
    if (/^accept$/i.test(name)) continue;
    args.push("-H", `${name}: ${value}`);
  }

  if (body) args.push("--data-binary", "@-");
  args.push(url);

  const stdin = body ? "pipe" : "ignore";
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: [stdin, "pipe", "pipe"],
      env: curlChildEnv()
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(error.message || "Could not start Chrome TLS client"));
    });
    child.on("close", (code) => {
      const { headerDump, body: responseBody, effectiveUrl, locations } = splitHeadersAndBody(stdout);
      const parsed = parseHeaderDump(headerDump);
      const payload = {
        status: parsed.status || 0,
        body: responseBody,
        headers: parsed.headers,
        setCookie: parsed.setCookie,
        effectiveUrl: effectiveUrl || "",
        locations: locations || [],
        forcedIpv4: forceIpv4
      };
      if (code !== 0) {
        const recoverable =
          payload.status > 0 ||
          payload.locations.length > 0 ||
          /loadshare\.(?:org|net)/i.test(payload.body || "") ||
          /loadshare\.(?:org|net)/i.test(payload.effectiveUrl || "");
        if (recoverable) {
          resolve(payload);
          return;
        }
        const detail = (stderr || stdout).trim().slice(0, 300);
        reject(
          new Error(`Tornado request failed (exit ${code})${detail ? `: ${detail}` : ""}`)
        );
        return;
      }
      resolve(payload);
    });
    if (body) child.stdin.end(body);
  });
}

function curlToFile({ url, outputPath, headers = {}, cookieJar = "", ipv4 } = {}) {
  const bin = impersonateBin();
  if (!bin) {
    return Promise.reject(new Error(missingTlsMessage()));
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const callerAccept = pickHeader(headers, "Accept");
  const args = [...chrome131Args({ accept: callerAccept || "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" })];
  const forceIpv4 = ipv4 === true || (ipv4 !== false && shouldForceIpv4(url));
  const forceIpv6 = !forceIpv4 && prefersIpv6(url);
  if (forceIpv4) args.push("-4");
  else if (forceIpv6) args.push("-6");
  args.push("-sS", "--fail", "--max-time", "45", "--max-redirs", "8", "-L", "-o", outputPath);
  if (cookieJar) {
    args.push("-b", cookieJar, "-c", cookieJar);
  }
  for (const [name, value] of Object.entries(headers)) {
    if (!name || value == null) continue;
    if (/^(user-agent|accept-encoding)$/i.test(name)) continue;
    if (/^accept$/i.test(name)) continue;
    args.push("-H", `${name}: ${value}`);
  }
  args.push(url);

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "ignore", "pipe"],
      env: curlChildEnv()
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(error.message || "Could not start Chrome TLS client"));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        try {
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size < 32) fs.unlinkSync(outputPath);
        } catch {
          // ignore
        }
        const detail = stderr.trim().slice(0, 300);
        reject(new Error(`Artwork download failed (exit ${code})${detail ? `: ${detail}` : ""}`));
        return;
      }
      resolve({ ok: true, outputPath });
    });
  });
}

function credsPath() {
  return path.join(process.env.DATA_ROOT || "/data/app", "tornado-credentials.json");
}

function statusCachePath() {
  return path.join(process.env.DATA_ROOT || "/data/app", "tornado-session-status.json");
}

let memoryLastKnown = null;

function readLastKnown() {
  if (memoryLastKnown && typeof memoryLastKnown.loggedIn === "boolean") return memoryLastKnown;
  const saved = loadJson(statusCachePath(), null);
  if (saved && typeof saved.loggedIn === "boolean") {
    memoryLastKnown = saved;
    return saved;
  }
  return null;
}

function writeLastKnown(entry) {
  if (!entry || typeof entry.loggedIn !== "boolean") return;
  memoryLastKnown = entry;
  try {
    saveJson(statusCachePath(), entry);
  } catch {
    // tests or a missing DATA_ROOT should not break status checks
  }
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function absorbCookies(jar, response) {
  const raw = response.headers.getSetCookie?.() || [];
  const fallback = response.headers.get("set-cookie");
  const list = raw.length ? raw : fallback ? [fallback] : [];
  for (const line of list) {
    const part = String(line).split(";")[0];
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    jar[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function expandCapturedText(text) {
  return decodeHtml(String(text || ""))
    .replace(/\\u002f/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\u003a/gi, ":")
    .replace(/\\\//g, "/");
}

function hostnameOf(url) {
  try {
    const text = String(url || "").trim();
    if (!text) return "";
    return new URL(text.startsWith("//") ? `https:${text}` : text, BASE_URL).hostname || "";
  } catch {
    return "";
  }
}

function isLoadshareHostName(host) {
  return /(?:^|\.)loadshare\.(?:org|net)$/i.test(String(host || ""));
}

function isTornadoHostName(host) {
  return /tornado/i.test(String(host || ""));
}

function tornadoIpMode() {
  const mode = String(process.env.TORNADO_IP || "4").trim().toLowerCase();
  if (mode === "6" || mode === "ipv6") return "6";
  if (mode === "auto") return "auto";
  return "4";
}

function tornadoIpFlag() {
  return tornadoIpMode() === "6" ? "-6" : "-4";
}

function shouldForceIpv4(url) {
  const host = hostnameOf(url);
  if (isLoadshareHostName(host) || /ip6/i.test(host)) return false;
  if (tornadoIpMode() === "6" || tornadoIpMode() === "auto") return false;
  if (!host) return true;
  return true;
}

function prefersIpv6(url) {
  const host = hostnameOf(url);
  if (/ip6/i.test(host)) return true;
  if (tornadoIpMode() === "6" && isTornadoHostName(host)) return true;
  return false;
}

function collectLoadshareHosts(text, bucket) {
  const target = bucket || new Set();
  const matches = expandCapturedText(text).match(LOADSHARE_HOST_RE) || [];
  for (const host of matches) target.add(String(host).toLowerCase());
  return target;
}

function sanitizeUrl(url) {
  try {
    let text = expandCapturedText(url).trim();
    if (!text) return "";
    if (text.startsWith("//")) text = `https:${text}`;
    else if (/^(?:[a-z0-9-]+\.)*loadshare\.(?:org|net)\//i.test(text)) text = `https://${text}`;
    const parsed = new URL(text, BASE_URL);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function parseQuality(url) {
  const text = String(url || "");
  const pathMatch = text.match(/\/(2160|1440|1080|720|480|360)(?:\?|&|$|\/)/i);
  if (pathMatch) return Number(pathMatch[1]);
  const nameMatch = text.match(/[?&]name=[^&]*_(\d{3,4})/i);
  if (nameMatch) return Number(nameMatch[1]);
  const labelMatch = text.match(/(?:^|[?&/_-])(4k|uhd|2160p|1440p|1080p|720p)(?:[?&/_-]|$)/i);
  if (labelMatch) {
    const label = labelMatch[1].toLowerCase();
    if (label === "4k" || label === "uhd" || label === "2160p") return 2160;
    if (label === "1440p") return 1440;
    if (label === "1080p") return 1080;
    if (label === "720p") return 720;
  }
  return 0;
}

function qualityLabel(height) {
  if (height >= 2160) return "4K";
  if (height >= 1440) return "1440p";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height) return `${height}p`;
  return "direct";
}

function isLoadshareDownloadUrl(url) {
  return Boolean(url && LOADSHARE_PATH.test(url));
}

function addLoadshareLink(url, bucket) {
  const clean = sanitizeUrl(url);
  if (clean && isLoadshareDownloadUrl(clean)) bucket.add(clean);
  return clean;
}

function attrCandidate(name, value) {
  const text = String(value || "").trim();
  if (/^content$/i.test(name) || /^\d+\s*;/i.test(text) || /url\s*=/i.test(text)) {
    const urlMatch = text.match(/url\s*=\s*([^\s;]+)/i);
    if (urlMatch) return urlMatch[1].replace(/^["']|["']$/g, "");
  }
  return text;
}

function collectLinks(text, bucket) {
  const target = bucket || new Set();
  const expanded = expandCapturedText(text);
  const matches = expanded.match(LINK_PATTERN) || [];
  for (const url of matches) addLoadshareLink(url, target);
  ATTR_LINK_PATTERN.lastIndex = 0;
  let attr;
  while ((attr = ATTR_LINK_PATTERN.exec(expanded)) !== null) {
    addLoadshareLink(attrCandidate(attr[1], attr[3]), target);
  }
  return target;
}

function collectLinksFromJson(data, bucket, key = "") {
  if (data == null) return;
  if (typeof data === "string") {
    collectLinks(data, bucket);
    if (JSON_LINK_KEYS.test(key)) addLoadshareLink(data, bucket);
    return;
  }
  if (Array.isArray(data)) {
    for (const entry of data) collectLinksFromJson(entry, bucket, key);
    return;
  }
  if (typeof data === "object") {
    for (const [nextKey, value] of Object.entries(data)) {
      collectLinksFromJson(value, bucket, nextKey);
    }
  }
}

function collectMetaRefreshUrls(html) {
  const urls = [];
  const decoded = expandCapturedText(html);
  const re =
    /<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["']([^"']+)["'][^>]*>|<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*http-equiv\s*=\s*["']?refresh["'][^>]*>/gi;
  let match;
  while ((match = re.exec(decoded))) {
    const content = match[1] || match[2] || "";
    const urlMatch = content.match(/url\s*=\s*([^\s;]+)/i);
    if (urlMatch) urls.push(urlMatch[1].replace(/^["']|["']$/g, ""));
  }
  return urls;
}

function parseDownloadForms(html) {
  const forms = [];
  const decoded = expandCapturedText(html);
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match;
  while ((match = formRe.exec(decoded))) {
    const attrs = match[1] || "";
    const inner = match[2] || "";
    const action = (attrs.match(/\baction\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    if (!action || !/loadshare\.(?:org|net)/i.test(action)) continue;
    const method = ((attrs.match(/\bmethod\s*=\s*["']([^"']+)["']/i) || [])[1] || "get").toLowerCase();
    const fields = {};
    const inputRe = /<input\b[^>]*>/gi;
    let input;
    while ((input = inputRe.exec(inner))) {
      const tag = input[0];
      const type = ((tag.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || "text").toLowerCase();
      if (/^(?:submit|button|image|file)$/i.test(type)) continue;
      const name = (tag.match(/\bname\s*=\s*["']([^"']+)["']/i) || [])[1];
      const value = (tag.match(/\bvalue\s*=\s*["']([^"']*)["']/i) || [])[1] || "";
      if (name) fields[name] = decodeHtml(value);
    }
    forms.push({
      action: action.trim(),
      method: method === "post" ? "post" : "get",
      fields
    });
  }
  return forms;
}

function formToDownloadUrl(form) {
  if (!form?.action) return "";
  const action = sanitizeUrl(form.action);
  if (!action) return "";
  if (form.method === "get" && form.fields && Object.keys(form.fields).length) {
    let url = action;
    let known;
    try {
      known = new URL(action);
    } catch {
      known = null;
    }
    for (const [name, value] of Object.entries(form.fields)) {
      if (!name || (known && known.searchParams.has(name))) continue;
      const sep = url.includes("?") ? "&" : "?";
      url += `${sep}${encodeURIComponent(name)}=${String(value)}`;
    }
    return url;
  }
  return action;
}

function ingestCapturedText(text, bucket, hostBucket) {
  collectLinks(text, bucket);
  for (const url of collectMetaRefreshUrls(text)) addLoadshareLink(url, bucket);
  for (const form of parseDownloadForms(text)) addLoadshareLink(formToDownloadUrl(form), bucket);
  if (hostBucket) collectLoadshareHosts(text, hostBucket);
  try {
    collectLinksFromJson(JSON.parse(String(text || "")), bucket);
  } catch {
    // HTML or non-JSON text is expected.
  }
}

function nestedApiPaths(html) {
  const matches =
    String(html || "").match(/\/(?:getdownload|getbutton|getlink|getplayer|getlinks)\/[^\s"'<>?]+/gi) || [];
  return [...new Set(matches.map((entry) => entry.replace(/&amp;/gi, "&")))];
}

function parseAjaxUrlsFromHtml(html) {
  const urls = new Set();
  const patterns = [
    /url\s*:\s*['"]([^'"]+)['"]/gi,
    /\.get\(\s*['"]([^'"]+)['"]/gi,
    /\.post\(\s*['"]([^'"]+)['"]/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(String(html || ""))) !== null) {
      const value = String(match[1] || "").replace(/&amp;/gi, "&").trim();
      if (value && /getdownload|getbutton|getlink|download|loadshare/i.test(value)) {
        urls.add(value);
      }
    }
  }
  return [...urls];
}

function nestedDownloadUrls(html) {
  return [...new Set([...nestedApiPaths(html), ...parseAjaxUrlsFromHtml(html)])];
}

function acceptForApiPath(apiPath) {
  return /getdownload/i.test(String(apiPath || "")) ? ACCEPT_JSON : ACCEPT_HTML;
}

function shortPreview(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function appendQueryParam(urlPath, name, value) {
  if (!name || value == null || value === "") return urlPath;
  try {
    const parsed = new URL(String(urlPath), BASE_URL);
    if (parsed.searchParams.has(name)) return urlPath;
    parsed.searchParams.set(name, String(value));
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const sep = String(urlPath).includes("?") ? "&" : "?";
    return `${urlPath}${sep}${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  }
}

function withCsrfQuery(urlPath, csrf) {
  if (!csrf?.token || !/getdownload|getbutton|getlink/i.test(String(urlPath))) {
    return urlPath;
  }
  return appendQueryParam(urlPath, csrf.param || "_csrf", csrf.token);
}

function extractMovieId(url) {
  return extractMovieIdFromUrl(url);
}

function canonicalMovieUrl(url) {
  return canonicalMoviePageUrl(url);
}

class TornadoClient {
  constructor() {
    this.jar = loadJson(cookiePath(), {});
  }

  persist() {
    saveJson(cookiePath(), this.jar);
  }

  hasSession() {
    return Object.keys(this.jar).length > 0;
  }

  credentials() {
    const saved = loadJson(credsPath(), {});
    return {
      username: saved.username || "",
      hasPassword: Boolean(saved.password)
    };
  }

  saveCredentials({ username, password }) {
    const existing = loadJson(credsPath(), {});
    saveJson(credsPath(), {
      username: String(username || existing.username || "").trim(),
      password: password ? String(password) : existing.password || ""
    });
  }

  setCookieHeader(raw) {
    for (const part of String(raw || "").split(";")) {
      const eq = part.indexOf("=");
      if (eq < 1) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (name) this.jar[name] = value;
    }
    this.persist();
  }

  async request(urlPath, options = {}) {
    const url = new URL(urlPath, BASE_URL);
    const headers = { ...(options.headers || {}) };
    writeCurlJar(this.jar);
    const result = await runChromeCurl({
      url: url.toString(),
      method: options.method || "GET",
      headers,
      body: options.body || "",
      follow: options.follow !== false,
      cookieJar: cookieJarPath(),
      ipv4: options.ipv4
    });
    Object.assign(this.jar, readCurlJar());
    for (const line of result.setCookie || []) {
      const part = String(line).split(";")[0];
      const eq = part.indexOf("=");
      if (eq < 1) continue;
      this.jar[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
    this.persist();
    return result;
  }

  async probe() {
    const bin = impersonateBin();
    if (!bin) return { ok: false, error: "Chrome TLS binary missing", bin: "" };
    const google = await runCurlOnce(
      bin,
      ["-4", "-sS", "-I", "--max-time", "10", "https://www.google.com"],
      10000
    );
    const tornado = await runCurlOnce(
      bin,
      [...chrome131Args(), tornadoIpFlag(), "-sS", "-I", "--max-time", "20", `${BASE_URL}/tornado-1`],
      20000
    );
    return { ok: tornado.ok, bin, google, tornado };
  }

  async sessionStatus() {
    const creds = this.credentials();
    const lastKnown = readLastKnown();
    const hasCookies = this.hasSession();
    const hasIdentity = hasIdentityCookie(this.jar);
    const base = {
      username: creds.username,
      hasPassword: creds.hasPassword,
      hasCookies,
      hasIdentity,
      lastKnownLoggedIn: typeof lastKnown?.loggedIn === "boolean" ? lastKnown.loggedIn : null,
      chromeTls: Boolean(impersonateBin()),
      loginUrl: this.loginUrl()
    };

    const finish = (evaluated, ok, error) => {
      if (evaluated.confirmed && typeof evaluated.loggedIn === "boolean") {
        writeLastKnown({
          loggedIn: evaluated.loggedIn,
          username: creds.username || "",
          at: Date.now()
        });
      }
      return {
        ok,
        loggedIn: evaluated.loggedIn,
        confirmed: Boolean(evaluated.confirmed),
        evidence: evaluated.evidence || "",
        username: creds.username,
        hasPassword: creds.hasPassword,
        hasCookies,
        hasIdentity: evaluated.hasIdentity || hasIdentity,
        lastKnownLoggedIn: base.lastKnownLoggedIn,
        chromeTls: base.chromeTls,
        loginUrl: base.loginUrl,
        error
      };
    };

    const evaluateBody = (html, status, error) =>
      evaluateSessionStatus({
        html,
        status,
        jar: this.jar,
        lastKnown: lastKnown?.loggedIn,
        error
      });

    try {
      const home = await this.text("/tornado-1");
      let evaluated = evaluateBody(home.body, home.status);
      if (!evaluated.confirmed) {
        try {
          const profile = await this.text("/user/profile");
          const profileEval = evaluateBody(profile.body, profile.status);
          if (profileEval.confirmed) evaluated = profileEval;
        } catch (profileError) {
          const retry = evaluateBody("", 0, profileError.message || "profile probe failed");
          if (retry.loggedIn != null && evaluated.loggedIn == null) evaluated = retry;
        }
      }
      return finish(
        evaluated,
        evaluated.confirmed,
        evaluated.confirmed ? undefined : "Could not confirm Tornado session."
      );
    } catch (error) {
      const message = error.message || "Could not reach Tornado.";
      const evaluated = evaluateBody("", 0, message);
      return finish(
        evaluated,
        false,
        !impersonateBin()
          ? missingTlsMessage()
          : /fetch failed|ECONNRESET/i.test(message)
            ? "Tornado reset the connection. Confirm docker-compose.yml uses network_mode: host, then: sudo docker compose up -d"
            : message
      );
    }
  }

  async downloadToFile(urlPath, outputPath, options = {}) {
    const url = /^https?:\/\//i.test(String(urlPath || ""))
      ? String(urlPath)
      : new URL(urlPath, BASE_URL).toString();
    writeCurlJar(this.jar);
    const result = await curlToFile({
      url,
      outputPath,
      headers: options.headers || {},
      cookieJar: cookieJarPath(),
      ipv4: options.ipv4
    });
    Object.assign(this.jar, readCurlJar());
    this.persist();
    return result;
  }

  async text(urlPath, options) {
    const response = await this.request(urlPath, options);
    const abs = (() => {
      try {
        return new URL(urlPath, BASE_URL).toString();
      } catch {
        return String(urlPath || "");
      }
    })();
    return {
      status: response.status,
      body: response.body || "",
      effectiveUrl: response.effectiveUrl || "",
      locations: response.locations || [],
      headers: response.headers || {},
      forcedIpv4:
        typeof response.forcedIpv4 === "boolean"
          ? response.forcedIpv4
          : shouldForceIpv4(response.effectiveUrl || abs)
    };
  }

  loginUrl() {
    return `${BASE_URL}/`;
  }

  async login(username, password, recaptcha = "") {
    const blocked = requireRecaptcha(recaptcha);
    if (blocked) return blocked;

    const saved = this.credentials();
    const email = String(username || saved.username || "").trim();
    const pass = password || loadJson(credsPath(), {}).password || "";
    if (!email || !pass) {
      return {
        ok: false,
        error:
          "NAS has no saved Tornado password. Paste _identity-frontend1 and advanced-frontend from Chrome DevTools instead."
      };
    }
    this.saveCredentials({ username: email, password: pass });

    await this.request("/user/login", {
      method: "GET",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${BASE_URL}/`
      }
    }).catch(() => ({}));

    const home = await this.text("/tornado-1");
    const homeCsrf = parseCsrfFromHtml(home.body);

    const loginPage = await this.text("/user/premiummembership");
    const pageCsrf = parseCsrfFromHtml(loginPage.body);
    const pageToken = pageCsrf.token || homeCsrf.token;
    const pageParam = pageCsrf.token ? pageCsrf.param : homeCsrf.param;

    const params = new URLSearchParams();
    params.set("SignupForm[email]", email);
    params.set("SignupForm[password]", pass);
    params.set("SignupForm[reCaptcha]", String(recaptcha || ""));
    params.set("SignupForm[rememberMe]", "1");
    params.set("notification", "false");
    if (pageParam && pageToken) params.set(pageParam, pageToken);

    const response = await this.request("/user/login", {
      method: "POST",
      follow: false,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-Token": pageToken,
        Referer: `${BASE_URL}/user/premiummembership`,
        Origin: BASE_URL
      },
      body: params.toString()
    });
    const body = response.body || "";
    let data = null;
    try {
      data = JSON.parse(body);
    } catch {
      data = null;
    }

    if (data?.response === false) {
      const message = data.msg || data.error || "Tornado login failed.";
      const verification = isVerificationError(message);
      return {
        ok: false,
        needsCaptcha: verification || true,
        error: verification
          ? "Verification code incorrect. Paste _identity-frontend1 and advanced-frontend from Chrome DevTools → Application → Cookies instead of using Tornado's Login."
          : message,
        loginUrl: this.loginUrl()
      };
    }
    if (data?.response === true) {
      writeLastKnown({ loggedIn: true, username: email, at: Date.now() });
      return { ok: true, loggedIn: true };
    }
    const check = await this.sessionStatus();
    if (check.loggedIn) return { ok: true, loggedIn: true };
    return {
      ok: false,
      needsCaptcha: true,
      error: recaptcha
        ? data?.msg || "Login did not stick. Solve the captcha again, then send it back."
        : "Tornado needs the captcha completed in your browser.",
      loginUrl: this.loginUrl()
    };
  }

  async search(query) {
    const q = String(query || "").trim();
    if (!q) return { ok: false, error: "Enter a search." };
    if (!this.hasSession()) {
      await this.text("/tornado-1").catch(() => {});
    }
    const encoded = encodeURIComponent(q);
    const result = await this.text(`/search_all/~${encoded}~`, {
      headers: { Referer: `${BASE_URL}/tornado-1` }
    });
    if (result.status >= 400) {
      return { ok: false, error: `Search failed (HTTP ${result.status}).` };
    }
    const parsed = parseSearchResults(result.body);
    const movies = parsed.movies.slice(0, 40);
    if (!movies.length && parsed.warning) {
      return { ok: false, error: parsed.warning, query: q };
    }
    return {
      ok: true,
      movies,
      counts: {
        total: movies.length,
        movies: movies.filter((item) => item.kind !== "tv").length,
        tv: movies.filter((item) => item.kind === "tv").length
      },
      query: q
    };
  }

  async fetchShow(showUrl, season = null) {
    const canonical = canonicalContentUrl(showUrl) || String(showUrl || "").trim();
    if (!canonical || !isTvShowPageUrl(canonical)) {
      return { ok: false, error: "Not a TV show page URL." };
    }

    const first = await this.text(canonical, {
      headers: { Referer: `${BASE_URL}/tornado-1` }
    });
    let scan = parseTvShowPage(first.body, canonical, { season });
    const targetSeason = Number.parseInt(season, 10) || scan.season || 1;

    for (const hubUrl of guessShowHubUrls(canonical).filter((url) => url && url !== canonical)) {
      let hubPage;
      try {
        hubPage = await this.text(hubUrl, { headers: { Referer: canonical } });
      } catch {
        continue;
      }
      if (Number(hubPage?.status) >= 400 || !hubPage?.body || String(hubPage.body).length < 80) continue;
      const hubScan = parseTvShowPage(hubPage.body, hubUrl, { season: targetSeason });
      scan = {
        ...scan,
        showTitle: scan.showTitle || hubScan.showTitle,
        posterUrl: scan.posterUrl || hubScan.posterUrl,
        seasons: mergeSeasonLists(scan.seasons, hubScan.seasons)
      };
      if ((hubScan.seasons || []).length > 1) break;
    }

    const seasonInfo = (scan.seasons || []).find((entry) => Number(entry.number) === Number(targetSeason));
    const candidates = guessSeasonHubUrls(canonical, targetSeason, seasonInfo?.url || "").filter(
      (url) => url && url !== canonical
    );

    for (const seasonUrl of candidates) {
      let second;
      try {
        second = await this.text(seasonUrl, { headers: { Referer: canonical } });
      } catch {
        continue;
      }
      if (Number(second?.status) >= 400) continue;
      if (!second?.body || String(second.body).length < 80) continue;
      const seasonScan = parseTvShowPage(second.body, seasonUrl, { season: targetSeason });
      const episodes = normalizeEpisodeNumbers(
        dedupeEpisodes([...(scan.episodes || []), ...(seasonScan.episodes || [])]),
        targetSeason
      );
      scan = {
        ...seasonScan,
        showTitle: seasonScan.showTitle || scan.showTitle,
        posterUrl: seasonScan.posterUrl || scan.posterUrl,
        seasons: mergeSeasonLists(scan.seasons, seasonScan.seasons),
        episodes,
        episodeCount: episodes.length
      };
      if (episodes.length) break;
    }

    const episodes = normalizeEpisodeNumbers(dedupeEpisodes(scan.episodes || []), scan.season || targetSeason);
    scan = { ...scan, episodes, episodeCount: episodes.length };

    if (!scan.episodes?.length) {
      scan.error =
        scan.error ||
        "No episodes found for this season. Open the show again after signing in, or pick another season.";
    }

    const plan = buildTvShowPlan(scan);
    return {
      ok: true,
      ...scan,
      plan,
      seasonCount: (scan.seasons || []).length
    };
  }

  async findDirectLink(movieUrl) {
    const canonical =
      canonicalMovieUrl(movieUrl) || canonicalContentUrl(movieUrl) || String(movieUrl || "").trim();
    if (!canonical) {
      return { ok: false, error: "Invalid movie or episode URL." };
    }

    const page = await this.text(canonical, {
      headers: { Referer: `${BASE_URL}/tornado-1` }
    });
    const csrf = parseCsrfFromHtml(page.body);
    const downloadIds = mergeDownloadIds(extractPageDownloadIds(page.body), extractDownloadIds(canonical));
    if (!canonical || !downloadIds.length) {
      return { ok: false, error: "Invalid movie or episode URL." };
    }

    const links = new Set();
    const loadshareHosts = new Set();
    ingestCapturedText(page.body, links, loadshareHosts);
    const pageIsLoginWall = isDownloadLoginWall(page.body);

    const apiHeaders = {
      Referer: canonical,
      Origin: BASE_URL,
      "X-Requested-With": "XMLHttpRequest"
    };
    if (csrf.token) apiHeaders["X-CSRF-Token"] = csrf.token;

    let lastPath = canonical;
    let lastStatus = page.status || 0;
    let lastPreview = shortPreview(page.body);
    let lastForcedIpv4 = shouldForceIpv4(canonical);
    let lastEffectiveHost = hostnameOf(page.effectiveUrl || canonical);
    const fetched = new Set();

    const noteResult = (urlPath, result) => {
      lastPath = urlPath;
      lastStatus = result.status || 0;
      lastPreview = shortPreview(result.body);
      lastForcedIpv4 =
        typeof result.forcedIpv4 === "boolean" ? result.forcedIpv4 : shouldForceIpv4(result.effectiveUrl || urlPath);
      lastEffectiveHost = hostnameOf(result.effectiveUrl || urlPath) || lastEffectiveHost;
      collectLoadshareHosts(result.body, loadshareHosts);
      collectLoadshareHosts(result.effectiveUrl, loadshareHosts);
      for (const location of result.locations || []) collectLoadshareHosts(location, loadshareHosts);
      for (const value of Object.values(result.headers || {})) collectLoadshareHosts(value, loadshareHosts);
    };

    const ingestHeaders = (headers, extraLocations) => {
      for (const location of extraLocations || []) {
        collectLinks(location, links);
        addLoadshareLink(location, links);
        collectLoadshareHosts(location, loadshareHosts);
      }
      const headerMap = headers || {};
      for (const [name, value] of Object.entries(headerMap)) {
        if (!value) continue;
        if (/^(?:location|x-redirect|x-location|content-location)$/i.test(name)) {
          collectLinks(value, links);
          addLoadshareLink(value, links);
        } else if (/^refresh$/i.test(name)) {
          const urlMatch = String(value).match(/url\s*=\s*([^\s;]+)/i);
          addLoadshareLink(urlMatch ? urlMatch[1] : value, links);
        }
        collectLoadshareHosts(value, loadshareHosts);
      }
    };

    const ingest = async (urlPath, accept, extra = {}) => {
      collectLinks(urlPath, links);
      const requested = withCsrfQuery(urlPath, csrf);
      if (fetched.has(`${extra.method || "GET"} ${requested}`)) return "";
      fetched.add(`${extra.method || "GET"} ${requested}`);
      try {
        const abs = new URL(requested, BASE_URL);
        const loadshare = isLoadshareHostName(abs.hostname);
        const headers = {
          ...(loadshare ? { Referer: canonical } : apiHeaders),
          Accept: accept || acceptForApiPath(urlPath)
        };
        if (String(extra.method || "").toUpperCase() === "POST") {
          headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
        }
        const result = await this.text(requested, {
          headers,
          follow: extra.follow === true,
          ipv4: extra.ipv4,
          method: extra.method,
          body: extra.body
        });
        noteResult(urlPath, result);
        ingestCapturedText(result.body, links, loadshareHosts);
        collectLinks(result.effectiveUrl, links);
        addLoadshareLink(result.effectiveUrl, links);
        ingestHeaders(result.headers, result.locations);
        const forms = parseDownloadForms(result.body);
        for (const form of forms) {
          const built = formToDownloadUrl(form);
          const merged = formToDownloadUrl({ ...form, method: "get" });
          addLoadshareLink(built, links);
          addLoadshareLink(merged, links);
          collectLoadshareHosts(form.action, loadshareHosts);
          if (
            form.method === "post" &&
            !isLoadshareDownloadUrl(built) &&
            !isLoadshareDownloadUrl(merged)
          ) {
            await ingest(form.action, ACCEPT_HTML, {
              follow: false,
              ipv4: false,
              method: "POST",
              body: new URLSearchParams(form.fields).toString()
            });
          }
        }
        if (extra.follow !== true) {
          for (const location of result.locations || []) {
            const locClean = sanitizeUrl(location);
            const host = hostnameOf(locClean || location);
            if (!locClean || isLoadshareDownloadUrl(locClean) || isLoadshareHostName(host)) continue;
            if (!isTornadoHostName(host)) continue;
            let nextPath = locClean;
            try {
              const loc = new URL(locClean);
              nextPath = `${loc.pathname}${loc.search}`;
            } catch {
              nextPath = locClean;
            }
            await ingest(nextPath, acceptForApiPath(nextPath));
          }
        }
        return result.body;
      } catch (error) {
        lastPath = urlPath;
        lastPreview = shortPreview(error.message);
        return "";
      }
    };

    for (const nested of nestedDownloadUrls(page.body)) {
      collectLinks(nested, links);
      const nestedClean = sanitizeUrl(nested);
      if (nestedClean && isLoadshareDownloadUrl(nestedClean)) continue;
      await ingest(nested, acceptForApiPath(nested));
    }

    outer: for (const downloadId of downloadIds) {
      for (const type of API_TYPES) {
        for (const apiPath of API_PATHS) {
          const apiPathUrl = `/${apiPath}/${downloadId}/${type}`;
          const body = await ingest(apiPathUrl, acceptForApiPath(apiPath));
          for (const nested of nestedDownloadUrls(body)) {
            collectLinks(nested, links);
            const nestedClean = sanitizeUrl(nested);
            if (nestedClean && isLoadshareDownloadUrl(nestedClean)) continue;
            await ingest(nested, acceptForApiPath(nested));
          }
          if ([...links].some((url) => parseQuality(url) >= 1080)) break outer;
        }
      }
    }

    const ranked = [...links]
      .map((url) => {
        const height = parseQuality(url);
        return { url, height, qualityLabel: qualityLabel(height) };
      })
      .sort((a, b) => b.height - a.height);

    if (!ranked.length) {
      let loggedIn = null;
      try {
        const session = await this.sessionStatus();
        loggedIn = session.loggedIn;
      } catch {
        loggedIn = hasIdentityCookie(this.jar) ? null : false;
      }
      if (pageIsLoginWall || loggedIn === false) {
        return { ok: false, error: downloadLoginWallMessage() };
      }
      const hostNote = loadshareHosts.size
        ? [...loadshareHosts].slice(0, 3).join(",")
        : "no";
      return {
        ok: false,
        error: `No LoadShare download link found. ids=${downloadIds.join(",")} last=${lastPath} HTTP ${lastStatus} preview=${lastPreview} loggedIn=${loggedIn} loadshareHost=${hostNote} ipv4=${lastForcedIpv4 ? "yes" : "no"} effectiveHost=${lastEffectiveHost || "n/a"}`
      };
    }

    const best = ranked[0];
    return {
      ok: true,
      movieUrl: canonical,
      movieId: downloadIds[0],
      best,
      links: ranked.slice(0, 8)
    };
  }
}

module.exports = {
  TornadoClient,
  extractMovieId,
  canonicalMovieUrl,
  fileNameFromLink,
  qualityLabel,
  parseSearchHtml,
  parseSearchResults,
  parseTvShowPage,
  isWatchingEpisodeUrl,
  parseAjaxUrlsFromHtml,
  collectLinks,
  nestedApiPaths,
  nestedDownloadUrls,
  splitHeadersAndBody,
  acceptForApiPath,
  shouldForceIpv4,
  prefersIpv6,
  parseDownloadForms,
  formToDownloadUrl,
  collectLoadshareHosts,
  LINK_PATTERN
};
