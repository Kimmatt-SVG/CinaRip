const fs = require("fs");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function isLoadshareHostname(hostname) {
  return /(?:^|\.)loadshare\.(?:org|net)$/i.test(String(hostname || ""));
}

function downloadSocketOptions(urlOrParsed) {
  let hostname = "";
  try {
    hostname =
      typeof urlOrParsed === "string"
        ? new URL(urlOrParsed).hostname
        : String(urlOrParsed?.hostname || "");
  } catch {
    hostname = "";
  }
  if (/ip6/i.test(hostname)) {
    return { family: 6 };
  }
  if (isLoadshareHostname(hostname)) {
    return { autoSelectFamily: true };
  }
  return {};
}

function headersToNet(headers = []) {
  const result = {};
  for (const header of headers) {
    if (!header?.name || header?.value == null) continue;
    result[header.name] = header.value;
  }
  if (!result["User-Agent"] && !result["user-agent"]) {
    result["User-Agent"] = DEFAULT_USER_AGENT;
  }
  if (!result.Accept) {
    result.Accept = "*/*";
  }
  if (!result.Connection) {
    result.Connection = "keep-alive";
  }
  return result;
}

function existingBytes(outputPath) {
  try {
    return fs.statSync(outputPath).size;
  } catch {
    return 0;
  }
}

function parseContentLength(response) {
  const raw = response.headers["content-length"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseTotalFromContentRange(response) {
  const raw = response.headers["content-range"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = String(value || "").match(/\/(\d+)\s*$/);
  if (!match) return 0;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function friendlyDownloadError(error) {
  const message = String(error?.message || error || "Direct download failed");
  if (/ERR_BLOCKED_BY_CLIENT/i.test(message)) {
    return new Error(
      "Download was blocked by the ad blocker. Restart the download — this should now use a direct connection."
    );
  }
  if (/^aborted$/i.test(message.trim())) {
    return new Error(
      "Download connection was interrupted. Click Download on the movie page again to get a fresh link, then retry."
    );
  }
  if (/ECONNRESET|ETIMEDOUT|EPIPE/i.test(message)) {
    return new Error(
      "Download connection dropped too many times. Get a fresh link from the movie page and try again."
    );
  }
  return error instanceof Error ? error : new Error(message);
}

function requestOnce({
  currentUrl,
  outputPath,
  headers,
  logStream,
  onProgress,
  abortRef,
  redirectCount,
  maxRedirects,
  startByte = 0
}) {
  return new Promise((resolve, reject) => {
    if (redirectCount > maxRedirects) {
      reject(new Error("Direct download failed: too many redirects."));
      return;
    }

    let parsed;
    try {
      parsed = new URL(currentUrl);
    } catch {
      reject(new Error(`Invalid download URL: ${currentUrl}`));
      return;
    }

    const transport = parsed.protocol === "https:" ? https : http;
    const headerObj = headersToNet(headers);
    if (startByte > 0) {
      headerObj.Range = `bytes=${startByte}-`;
      if (logStream) {
        logStream.write(`Resume from byte ${startByte}\n`);
      }
      if (typeof onProgress === "function") {
        onProgress({ downloadedBytes: startByte, totalBytes: 0, resuming: true, resumeFrom: startByte });
      }
    }

    const request = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers: headerObj,
        timeout: 0,
        ...downloadSocketOptions(parsed)
      },
      (response) => {
        const status = response.statusCode || 0;
        if (logStream) {
          logStream.write(`HTTP ${status} ${currentUrl}\n`);
        }

        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = response.headers.location;
          if (!location) {
            reject(new Error(`Direct download failed (HTTP ${status} redirect without location).`));
            return;
          }

          const nextUrl = new URL(location, currentUrl).toString();
          response.resume();
          requestOnce({
            currentUrl: nextUrl,
            outputPath,
            headers,
            logStream,
            onProgress,
            abortRef,
            redirectCount: redirectCount + 1,
            maxRedirects,
            startByte
          })
            .then(resolve)
            .catch(reject);
          return;
        }

        if (status === 416) {
          const size = existingBytes(outputPath);
          if (size > 0) {
            resolve({ downloadedBytes: size, totalBytes: size, outputPath });
            return;
          }
          reject(new Error("Direct download failed (HTTP 416). The link may have expired."));
          return;
        }

        const isResume = startByte > 0 && status === 206;
        const isFresh = startByte === 0 && status === 200;

        if (startByte > 0 && status === 200) {
          try {
            fs.unlinkSync(outputPath);
          } catch {
            // Best effort reset when server ignores Range.
          }
          response.resume();
          requestOnce({
            currentUrl,
            outputPath,
            headers,
            logStream,
            onProgress,
            abortRef,
            redirectCount,
            maxRedirects,
            startByte: 0
          })
            .then(resolve)
            .catch(reject);
          return;
        }

        if (!isResume && !isFresh) {
          reject(
            new Error(
              `Direct download failed (HTTP ${status}). The link may have expired — open the movie and click Download on the site again.`
            )
          );
          return;
        }

        const totalBytes =
          parseTotalFromContentRange(response) ||
          (isFresh ? startByte + parseContentLength(response) : 0);
        let sessionBytes = 0;

        const fileStream = fs.createWriteStream(outputPath, {
          flags: startByte > 0 ? "a" : "w"
        });
        const progressStream = new Transform({
          transform(chunk, _encoding, callback) {
            sessionBytes += chunk.length;
            const downloadedBytes = startByte + sessionBytes;
            if (typeof onProgress === "function") {
              onProgress({ downloadedBytes, totalBytes, resuming: startByte > 0, resumeFrom: startByte });
            }
            callback(null, chunk);
          }
        });

        pipeline(response, progressStream, fileStream)
          .then(() => {
            const downloadedBytes = startByte + sessionBytes;
            if (logStream) {
              logStream.write(`Downloaded ${downloadedBytes} bytes\n`);
            }
            resolve({ downloadedBytes, totalBytes, outputPath });
          })
          .catch(reject);
      }
    );

    request.on("socket", (socket) => {
      socket.setKeepAlive(true, 30_000);
      socket.setTimeout(0);
    });

    if (abortRef) {
      abortRef.current = () => {
        try {
          request.destroy();
        } catch {
          // Best effort abort.
        }
      };
    }

    request.on("error", reject);
    request.end();
  });
}

async function downloadHttpFile({
  url,
  outputPath,
  headers = [],
  logPath = null,
  onProgress = null,
  abortRef = null,
  maxRedirects = 8,
  maxAttempts = 25
}) {
  const logStream = logPath ? fs.createWriteStream(logPath, { flags: "w" }) : null;
  if (logStream) {
    logStream.write(`GET ${url}\n`);
  }

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startByte = existingBytes(outputPath);

    if (logStream && attempt > 1) {
      logStream.write(`\n--- Resume attempt ${attempt}/${maxAttempts} from ${startByte} bytes ---\n`);
    }

    try {
      const result = await requestOnce({
        currentUrl: url,
        outputPath,
        headers,
        logStream,
        onProgress,
        abortRef,
        redirectCount: 0,
        maxRedirects,
        startByte
      });

      if (logStream) logStream.end();
      return result;
    } catch (error) {
      lastError = error;
      if (logStream) {
        logStream.write(`\n${error.message || error}\n`);
      }

      const message = String(error?.message || error);
      const retryable = /aborted|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up/i.test(message);
      const partialBytes = existingBytes(outputPath);

      if (!retryable || attempt >= maxAttempts || partialBytes === 0) {
        if (logStream) logStream.end();
        throw friendlyDownloadError(lastError);
      }

      if (typeof onProgress === "function") {
        onProgress({
          downloadedBytes: partialBytes,
          totalBytes: 0,
          resuming: true,
          resumeFrom: partialBytes
        });
      }

      await new Promise((resolve) => setTimeout(resolve, Math.min(5000, 1000 * attempt)));
    }
  }

  if (logStream) logStream.end();
  throw friendlyDownloadError(lastError || new Error("Direct download failed."));
}

module.exports = {
  downloadHttpFile,
  downloadSocketOptions,
  isLoadshareHostname
};
