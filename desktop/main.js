const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  shell,
  dialog
} = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, exec } = require("child_process");
const { HlsCapture } = require("./lib/hls-capture");
const { DirectDownloadCapture, isDirectDownloadUrl } = require("./lib/direct-download-capture");
const {
  setupTornadoDownloadScraper,
  scanDirectDownloads,
  fetchDirectLinksForMovie,
  extractMovieIdFromUrl
} = require("./lib/tornado-download-scraper");
const { FfmpegRunner, findFfmpeg, outputDirectory, safeOutputName, streamHeadersForDownload } = require("./lib/ffmpeg-runner");
const { loadNasConfig, saveNasConfig, ensureNasFolder } = require("./lib/nas-config");
const { saveLocalConfig, ensureLocalFolder, defaultLocalVideoFolder } = require("./lib/local-config");

function nasOutputAccess() {
  return ensureNasFolder(loadNasConfig().videoFolder);
}
const { getFolderStorage } = require("./lib/folder-storage");
const { loadNasCredentials, saveNasCredentials, prepareNasAccess } = require("./lib/nas-auth");
const { setupAdblocker, isAdblockerEnabled, syncAdblockerForUrl } = require("./lib/adblocker");
const { setupNavigationGuard } = require("./lib/navigation-guard");
const { setupEmbedCompatibility } = require("./lib/embed-compatibility");
const { setupChromeCompatibility, CHROME_USER_AGENT } = require("./lib/chrome-compat");
const { outputNameFromPageUrl } = require("./lib/page-utils");
const { resolveBestFromCandidates, diagnoseStreamCandidates } = require("./lib/hls-quality");
const { findFfprobe, probeStream } = require("./lib/stream-probe");
const { streamDebug } = require("./lib/stream-debug");
const { saveArtworkForPage, saveArtworkFromUrl, saveShowPoster, extractArtworkUrl } = require("./lib/artwork");
const { findPosterForVideo, embedPosterInVideoAsync } = require("./lib/poster-utils");
const { SITE_HOME_URL, SITE_BASE_URL, SITE_LOGIN_URL, buildSearchUrl, getSiteProfile } = require("./lib/site-config");
const { isAnimeMode } = require("./lib/site-profiles");
const { isAniwaveUrl, isAniwaveHost, prepareAniwavePlayer, inspectAniwavePlayer, waitForAniwaveServers, buildAniwaveServerAttempts, extractEmbedStreamFromFrames } = require("./lib/aniwave-scraper");
const { sessionHlsProxy, shouldProxyStreamUrl } = require("./lib/session-hls-proxy");
const { loadSiteCredentials, saveSiteCredentials } = require("./lib/site-auth");
const { setupSiteAutoLogin, sessionHasTornadoIdentity } = require("./lib/site-auto-login");
const { listDownloadedMovies, findShowPoster, posterUrlForPath } = require("./lib/download-library");
const { syncLocalMoviesToNas } = require("./lib/library-sync");
const { cleanupStaleDownloadArtifacts } = require("./lib/download-cleanup");
const { DownloadQueue, titleFromMovieUrl, normalizeMovieUrl } = require("./lib/download-queue");
const { loadQueueState, saveQueueState } = require("./lib/queue-store");
const { canonicalMoviePageUrl } = require("./lib/movie-url-utils");
const { processDownloadQueue } = require("./lib/queue-runner");
const { createQueueDebugger, recentQueueDebugEntries } = require("./lib/queue-debug");
const {
  scrapeSearchMovieLinks,
  scrapeMovieDetail,
  buildTornadoSearchScraperScript
} = require("./lib/tornado-search-scraper");
const { setupTvShowScraper, scrapeTvShowFromPage, discoverTvSeasonsFromPage } = require("./lib/tv-show-scraper");
const { runTvShowDownload } = require("./lib/tv-show-runner");
const {
  canonicalContentUrl,
  extractDownloadIds,
  extractGetbuttonId,
  isTvShowPageUrl,
  isDownloadableContentUrl,
  episodeFileLabel,
  safeShowFolderName,
  buildSeasonPageUrl,
  showBaseSlugFromUrl,
  seasonNumberFromUrl,
  buildSeasonListFromUrl,
  toSeasonHubUrl,
  parseTornadoSeriesUrl,
  isWatchingEpisodeUrl
} = require("./lib/tv-url-utils");

const appProfile = getSiteProfile();
let catalogBrowserLocked = true;

const WARP_DOWNLOAD_URL = "https://one.one.one.one/";
const WARP_WINGET_COMMAND =
  "winget install --id Cloudflare.Warp -e --source winget --accept-package-agreements --accept-source-agreements";

app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
app.commandLine.appendSwitch(
  "disable-features",
  "ThirdPartyCookiesDeprecationTrial,ThirdPartyStoragePartitioning,PartitionedCookies"
);
const CHROME_MARGIN = 10;
const PROGRESS_BAR_HEIGHT = 88;
const DEFAULT_CHROME_TOP = 100;
const DEFAULT_CHROME_RIGHT = 330;

let chromeTop = DEFAULT_CHROME_TOP;
let chromeRight = DEFAULT_CHROME_RIGHT;
let chromeBottom = CHROME_MARGIN;
let progressDockHeight = PROGRESS_BAR_HEIGHT;
const ERR_ABORTED = -3;
const GATEWAY_RETRY_MAX = 5;
const GATEWAY_RETRY_DELAY_MS = 2000;

let mainWindow = null;
let browserView = null;
const hlsCapture = new HlsCapture();
const directDownloadCapture = new DirectDownloadCapture();
const ffmpegRunner = new FfmpegRunner();
const downloadQueue = new DownloadQueue();
let librarySyncRunning = false;
let queueProcessing = false;
let queueRecovery = { restored: 0, interrupted: 0, savedAt: 0 };
let tvShowPlan = null;
let tvShowProcessing = false;
let tvShowCancelRequested = false;
let lastStreamPageUrl = null;
let siteAutoLogin = null;
let queueDebug = () => {};
let gatewayRetryUrl = "";
let gatewayRetryAttempt = 0;
let gatewayRetryTimer = null;

function clearGatewayRetryTimer() {
  if (!gatewayRetryTimer) return;
  clearTimeout(gatewayRetryTimer);
  gatewayRetryTimer = null;
}

function resetGatewayRetryState() {
  clearGatewayRetryTimer();
  gatewayRetryUrl = "";
  gatewayRetryAttempt = 0;
}

async function isCloudflareBadGatewayPage(contents) {
  try {
    const snippet = await contents.executeJavaScript(
      `(document.title || "") + "\\n" + (document.body?.innerText || "").slice(0, 600)`,
      true
    );
    return /bad gateway/i.test(snippet) && /502|error code/i.test(snippet);
  } catch {
    return false;
  }
}

function scheduleGatewayRetry(contents, url) {
  if (gatewayRetryAttempt >= GATEWAY_RETRY_MAX) {
    resetGatewayRetryState();
    hideBrowserView();
    mainWindow?.webContents.send("page-gateway-failed", {
      url,
      attempts: GATEWAY_RETRY_MAX
    });
    return;
  }

  gatewayRetryAttempt += 1;
  gatewayRetryUrl = url;
  ensureBrowserVisible();
  mainWindow?.webContents.send("gateway-retry", {
    url,
    attempt: gatewayRetryAttempt,
    maxAttempts: GATEWAY_RETRY_MAX
  });

  clearGatewayRetryTimer();
  gatewayRetryTimer = setTimeout(() => {
    contents.reload();
  }, GATEWAY_RETRY_DELAY_MS);
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const contents = mainWindow.webContents;
  if (!contents || contents.isDestroyed()) return false;
  try {
    contents.send(channel, payload);
    return true;
  } catch {
    return false;
  }
}

function notifyTvShowUpdate(payload = {}) {
  sendToRenderer("tv-show-updated", {
    plan: tvShowPlan,
    processing: tvShowProcessing,
    ...payload
  });
}

function persistDownloadQueue() {
  try {
    saveQueueState(downloadQueue.persistableItems());
  } catch (error) {
    streamDebug.log("queue", "Could not save queue state", {
      error: error.message || String(error)
    });
  }
}

function restoreDownloadQueue() {
  const saved = loadQueueState();
  const result = downloadQueue.restore(saved.items);
  queueRecovery = {
    restored: result.restored,
    interrupted: result.interrupted,
    savedAt: saved.savedAt || 0
  };
  persistDownloadQueue();
  return result;
}

function notifyQueueUpdate(payload = {}) {
  persistDownloadQueue();
  sendToRenderer("download-queue-updated", {
    snapshot: downloadQueue.snapshot(),
    recovery: queueRecovery,
    ...payload
  });
}

queueDebug = createQueueDebugger(streamDebug, sendToRenderer);

function setupTornadoSearchScraper(contents) {
  if (!contents || contents.isDestroyed()) return;

  const inject = () => {
    contents.executeJavaScript(buildTornadoSearchScraperScript()).catch(() => {
      // Ignore injection failures on restricted pages.
    });
  };

  contents.on("dom-ready", inject);
  contents.on("did-finish-load", inject);
}

let pageLoadGeneration = 0;

function beginPageNavigation(contents) {
  pageLoadGeneration += 1;
  if (contents && !contents.isDestroyed()) {
    try {
      contents.stop();
    } catch {
      // Ignore stop failures on a busy BrowserView.
    }
  }
  return pageLoadGeneration;
}

function waitForPageLoad(contents, url, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 45_000;
  const settleMs = Number(options.settleMs) || 0;
  const generation = beginPageNavigation(contents);

  return new Promise((resolve, reject) => {
    if (!contents || contents.isDestroyed()) {
      reject(new Error("Browser is not ready."));
      return;
    }

    let settled = false;
    let settleTimer = null;

    const cleanup = () => {
      clearTimeout(timer);
      if (settleTimer) clearTimeout(settleTimer);
      contents.removeListener("did-finish-load", onFinishLoad);
      contents.removeListener("did-fail-load", onFailLoad);
    };

    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };

    const stillCurrent = () => generation === pageLoadGeneration && contents && !contents.isDestroyed();

    const onFinishLoad = () => {
      if (!stillCurrent()) {
        finish(new Error("Navigation cancelled."));
        return;
      }
      if (settleMs <= 0) {
        finish();
        return;
      }
      settleTimer = setTimeout(() => {
        if (!stillCurrent()) finish(new Error("Navigation cancelled."));
        else finish();
      }, settleMs);
    };

    const onFailLoad = (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      if (!stillCurrent()) {
        finish(new Error("Navigation cancelled."));
        return;
      }
      if (errorCode === ERR_ABORTED) return;
      finish(new Error(errorDescription || `Page failed to load (${errorCode})`));
    };

    const timer = setTimeout(() => finish(new Error("Page load timed out.")), timeoutMs);

    contents.on("did-finish-load", onFinishLoad);
    contents.on("did-fail-load", onFailLoad);
    contents.loadURL(url).catch((error) => {
      if (!stillCurrent()) finish(new Error("Navigation cancelled."));
      else finish(error);
    });
  });
}

async function loadMoviePageForQueue(url, timeoutMs = 90_000) {
  const targetUrl = canonicalMoviePageUrl(url) || normalizeMovieUrl(url);
  const movieId = extractMovieIdFromUrl(targetUrl);

  queueDebug("load-start", `Opening movie page`, {
    requestedUrl: url,
    targetUrl,
    movieId
  });

  const contents = browserView?.webContents;
  if (!contents || contents.isDestroyed()) {
    const error = new Error("Browser is not ready.");
    queueDebug("load-fail", error.message, { targetUrl, movieId });
    throw error;
  }

  resetStreamCapture();
  if (isCatalogMode()) hideBrowserView();
  else ensureBrowserVisible();

  try {
    await waitForPageLoad(contents, targetUrl, { timeoutMs, settleMs: 2200 });
    const pageCheck = await contents.executeJavaScript(`({
      url: location.href,
      pathname: location.pathname,
      title: document.title || "",
      isMovie: /\\/movie\\//i.test(location.pathname),
      hasJQuery: Boolean(window.jQuery),
      hasPlayer: Boolean(window.Player),
      bodyPreview: (document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 240),
      isError: /something went wrong|please report this problem|oops/i.test((document.body?.innerText || "").toLowerCase())
    })`);

    queueDebug("load-check", pageCheck.isError ? "Site error page detected" : "Page check complete", {
      targetUrl,
      movieId,
      pageCheck
    });

    if (pageCheck.isError) {
      throw new Error(
        `Movie page returned a site error. URL=${pageCheck.url || targetUrl} title="${pageCheck.title || ""}"`
      );
    }
    if (!pageCheck.isMovie) {
      throw new Error(
        `Did not land on a movie page. Got ${pageCheck.pathname || pageCheck.url || "unknown URL"}`
      );
    }
    queueDebug("load-ok", "Movie page loaded", { targetUrl, movieId });
  } catch (error) {
    queueDebug("load-fail", error.message || String(error), { targetUrl, movieId });
    throw error;
  }
}

async function loadContentPageForDownload(url, timeoutMs = 90_000) {
  const targetUrl = canonicalMoviePageUrl(url) || canonicalContentUrl(url) || normalizeMovieUrl(url) || url;
  const contentId = extractMovieIdFromUrl(targetUrl) || extractGetbuttonId(targetUrl);

  queueDebug("tv-load-start", "Opening content page", {
    requestedUrl: url,
    targetUrl,
    contentId
  });

  const contents = browserView?.webContents;
  if (!contents || contents.isDestroyed()) {
    const error = new Error("Browser is not ready.");
    queueDebug("tv-load-fail", error.message, { targetUrl, contentId });
    throw error;
  }

  resetStreamCapture();
  if (isCatalogMode()) hideBrowserView();
  else ensureBrowserVisible();

  try {
    await waitForPageLoad(contents, targetUrl, { timeoutMs, settleMs: 2200 });
    const pageCheck = await contents.executeJavaScript(`({
      url: location.href,
      pathname: location.pathname,
      title: document.title || "",
      isContent: /\\/(?:movie|tv-series|tv|serie|series|episode|episodes|watch)\\//i.test(location.pathname),
      hasJQuery: Boolean(window.jQuery),
      bodyPreview: (document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 240),
      isError: /something went wrong|please report this problem|oops/i.test((document.body?.innerText || "").toLowerCase())
    })`);

    if (pageCheck.isError) {
      throw new Error(`Content page returned a site error (${pageCheck.url || targetUrl}).`);
    }
    if (!pageCheck.isContent) {
      throw new Error(
        `Did not land on a movie or TV episode page (${pageCheck.pathname || pageCheck.url || "unknown"}).`
      );
    }
    queueDebug("tv-load-ok", "Content page loaded", { targetUrl, contentId });
  } catch (error) {
    queueDebug("tv-load-fail", error.message || String(error), { targetUrl, contentId });
    throw error;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildAniwaveDownloadTarget(streamUrl, source, { session, pageUrl, embedUrl }) {
  const remoteUrl = streamUrl;
  const headers = await streamHeadersForDownload(source?.requestHeaders || [], pageUrl, {
    targetUrl: remoteUrl,
    embedUrl,
    session
  });

  if (!shouldProxyStreamUrl(remoteUrl)) {
    const probe = await probeStream(remoteUrl, headers, findFfprobe(), 25000);
    return { remoteUrl, downloadUrl: remoteUrl, headers, probe };
  }

  await sessionHlsProxy.ensureRunning({
    session,
    pageUrl,
    embedUrl,
    requestHeaders: source?.requestHeaders || []
  });

  const downloadUrl = sessionHlsProxy.localUrl(remoteUrl);
  const probe = await probeStream(downloadUrl, [], findFfprobe(), 30000);
  return {
    remoteUrl,
    downloadUrl,
    headers: [],
    probe,
    proxied: true
  };
}

async function fetchAniwaveEpisodeStream(contents, episode, options = {}) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  const timeoutMs = options.timeoutMs ?? 90_000;
  const startedAt = Date.now();
  const preferDub = options.preferDub !== false;

  const serverWait = await waitForAniwaveServers(contents, 35000);
  queueDebug("aniwave-wait", serverWait.ok ? "Aniwave servers loaded" : "Timed out waiting for servers", {
    episodeUrl: episode.url,
    serverWait
  });

  if (!serverWait.ok) {
    return {
      ok: false,
      error:
        "Aniwave servers did not load in time. Reload the episode in the browser and make sure the player area appears."
    };
  }

  const inspection = await inspectAniwavePlayer(contents, { preferDub });
  queueDebug("aniwave-inspect", "Inspected Aniwave player", {
    episodeUrl: episode.url,
    inspection
  });

  const availableAttempts =
    Array.isArray(inspection.attempts) && inspection.attempts.length
      ? inspection.attempts
      : buildAniwaveServerAttempts({ preferDub }).filter((attempt) => {
          if (!Array.isArray(inspection.availableServers) || !inspection.availableServers.length) {
            return true;
          }
          return inspection.availableServers.some(
            (server) =>
              server.name.toLowerCase() === attempt.server.toLowerCase() &&
              (attempt.audioType === "unknown" ||
                server.audioType === attempt.audioType ||
                server.audioType === "unknown")
          );
        });

  if (!inspection.hasPlayerArea) {
    return {
      ok: false,
      error:
        "Could not find the Aniwave player area on this page. Open the episode in the browser and make sure the video player is visible."
    };
  }

  if (!availableAttempts.length) {
    return {
      ok: false,
      error:
        "No Aniwave stream servers were found on this page. Try reloading the episode and pick a DUB or SUB server manually."
    };
  }

  let lastPlayerResult = null;
  let embedUrl = null;

  for (let index = 0; index < availableAttempts.length; index += 1) {
    if (Date.now() - startedAt >= timeoutMs) break;

    const attempt = availableAttempts[index];
    hlsCapture.clear();
    lastPlayerResult = await prepareAniwavePlayer(contents, {
      preferDub,
      clickServer: attempt.server,
      clickAudioType: attempt.audioType,
      clickSvId: attempt.svId || null
    });
    if (lastPlayerResult.iframeSrc) {
      embedUrl = lastPlayerResult.iframeSrc;
    }

    queueDebug(
      "aniwave-player",
      lastPlayerResult.ok ? `Trying ${attempt.audioType} / ${attempt.server}` : "Could not click server",
      {
        episodeUrl: episode.url,
        attempt: index + 1,
        target: attempt,
        result: lastPlayerResult
      }
    );

    if (!lastPlayerResult.ok) continue;

    const waitUntil = Date.now() + 20_000;
    while (Date.now() < waitUntil && Date.now() - startedAt < timeoutMs) {
      const pageUrl = contents.getURL() || episode.url;
      const session = contents.session;
      const playlists = hlsCapture.list();
      if (playlists.length) {
        const { resolved } = await diagnoseStreamCandidates(playlists, { pageUrl, embedUrl, session });
        if (resolved?.url) {
          const source = resolved.source || hlsCapture.bestPlaylist() || playlists[0];
          const target = await buildAniwaveDownloadTarget(resolved.url, source, {
            session,
            pageUrl,
            embedUrl
          });

          if (target.probe.status !== "ok") {
            queueDebug("aniwave-probe", "Captured stream failed ffprobe preflight", {
              episodeUrl: episode.url,
              server: attempt.server,
              embedUrl,
              proxied: Boolean(target.proxied),
              probeStatus: target.probe.status,
              probeError: target.probe.error || null,
              streamUrl: target.remoteUrl
            });
          } else {
            const audioLabel =
              lastPlayerResult.audioType === "dub"
                ? "English dub"
                : lastPlayerResult.audioType === "sub"
                  ? "Sub"
                  : null;
            const qualityLabel = [audioLabel, resolved.qualityLabel || source.qualityLabel, attempt.server]
              .filter(Boolean)
              .join(" · ");

            return {
              ok: true,
              url: target.downloadUrl,
              headers: target.headers,
              qualityLabel: qualityLabel || null,
              mode: "hls",
              audioType: lastPlayerResult.audioType || null,
              server: lastPlayerResult.server || attempt.server,
              embedUrl
            };
          }
        }
      }

      const status = await inspectAniwavePlayer(contents, { preferDub });
      if (status.iframeSrc) {
        embedUrl = status.iframeSrc;
      }

      if (!playlists.length && (status.hasIframe || status.hasVideo)) {
        const frameStreamUrl = await extractEmbedStreamFromFrames(contents);
        if (frameStreamUrl) {
          const syntheticSource = { requestHeaders: [], qualityLabel: "embed" };
          const target = await buildAniwaveDownloadTarget(frameStreamUrl, syntheticSource, {
            session,
            pageUrl,
            embedUrl
          });
          if (target.probe.status === "ok") {
            const audioLabel =
              lastPlayerResult.audioType === "dub"
                ? "English dub"
                : lastPlayerResult.audioType === "sub"
                  ? "Sub"
                  : null;
            const qualityLabel = [audioLabel, attempt.server, "embed"].filter(Boolean).join(" · ");
            queueDebug("aniwave-embed-stream", "Using stream URL from embed player", {
              episodeUrl: episode.url,
              server: attempt.server,
              embedUrl,
              proxied: Boolean(target.proxied),
              streamUrl: target.remoteUrl
            });
            return {
              ok: true,
              url: target.downloadUrl,
              headers: target.headers,
              qualityLabel,
              mode: "hls",
              audioType: lastPlayerResult.audioType || null,
              server: lastPlayerResult.server || attempt.server,
              embedUrl
            };
          }
        }
      }

      if (status.hasIframe || status.hasVideo) {
        queueDebug("aniwave-embed", "Embed detected, waiting for HLS", {
          server: attempt.server,
          audioType: attempt.audioType,
          hasIframe: status.hasIframe,
          iframeSrc: status.iframeSrc,
          playlistCount: hlsCapture.list().length
        });
      }

      await sleep(900);
    }
  }

  return {
    ok: false,
    error:
      "Could not capture an Aniwave stream after trying available servers. Reload the episode, click a DUB server manually, let it play for a few seconds, then try again.",
    player: lastPlayerResult,
    availableServers: inspection.availableServers || []
  };
}

async function resolveQueueOutputDir() {
  const access = nasOutputAccess();
  if (!access.ok) {
    return { ok: false, error: access.error, needsCredentials: Boolean(access.needsCredentials) };
  }
  return { ok: true, outputDir: access.path };
}

async function processQueueEpisodeItem(item, queue) {
  const destination = "nas";
  const resolved = await resolveQueueOutputDir();
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  const useAniwaveHls = isAnimeMode() || getSiteProfile().id === "anime" || isAniwaveUrl(item.movieUrl);
  const showTitle = item.showTitle || "TV Show";
  const season = item.season || 1;
  const seasonLabel = `Season ${String(season).padStart(2, "0")}`;
  const folderName = safeShowFolderName(showTitle);
  const rootFolder = useAniwaveHls ? "" : "TV Shows";
  const showFolder = path.join(resolved.outputDir, rootFolder, folderName);
  const seasonDir = path.join(showFolder, seasonLabel);
  fs.mkdirSync(seasonDir, { recursive: true });

  const label = episodeFileLabel(season, item.episode || 1);
  const episodeName = `${label} - ${item.episodeTitle || "Episode"}.mp4`.replace(/[<>:"/\\|?*]+/g, "_");
  const episodePath = path.join(seasonDir, episodeName);
  const session = browserView?.webContents?.session;
  const ffmpegPath = findFfmpeg();
  void ffmpegPath;

  queue.markDownloading(item.id);
  notifyQueueUpdate({
    phase: "loading",
    item,
    snapshot: downloadQueue.snapshot()
  });

  try {
    syncAdblockerForUrl(item.movieUrl);
    await loadContentPageForDownload(item.movieUrl);
    if (useAniwaveHls && isAniwaveUrl(item.movieUrl)) {
      const contents = browserView?.webContents;
      await waitForAniwaveServers(contents, 35000);
    }
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }

  if (queue.cancelRequested) return { cancelled: true };

  notifyQueueUpdate({
    phase: "fetching-link",
    item,
    snapshot: downloadQueue.snapshot()
  });

  const contents = browserView?.webContents;
  let link;
  if (useAniwaveHls && isAniwaveUrl(item.movieUrl)) {
    link = await fetchAniwaveEpisodeStream(
      contents,
      {
        url: item.movieUrl,
        season: item.season,
        episode: item.episode,
        title: item.episodeTitle
      },
      { preferDub: true }
    );
  } else {
    const result = await fetchFreshDirectDownloadLink(contents, {
      movieUrl: item.movieUrl,
      timeoutMs: 20_000,
      minQualityHeight: 720,
      shouldContinue: () => !queue.cancelRequested
    });
    if (!result.ok || !result.best?.url) {
      return { ok: false, error: result.error || "Could not generate episode download link." };
    }
    const rawPageUrl = contents?.getURL() || item.movieUrl;
    const pageUrl = canonicalMoviePageUrl(rawPageUrl) || canonicalContentUrl(rawPageUrl) || rawPageUrl;
    const headers = await streamHeadersForDownload(result.best.requestHeaders || [], pageUrl, {
      targetUrl: result.best.url,
      session
    });
    link = {
      ok: true,
      url: result.best.url,
      headers,
      qualityLabel: result.best.qualityLabel || null,
      mode: "direct"
    };
  }

  if (!link?.ok || !link.url) {
    return { ok: false, error: link?.error || "Could not get a download link." };
  }
  if (queue.cancelRequested) return { cancelled: true };

  try {
    let posterUrl = item.posterUrl || null;
    if (!posterUrl) posterUrl = await extractArtworkUrl(contents);
    if (posterUrl) {
      await saveShowPoster(posterUrl, link.headers || [], showFolder);
    }
  } catch {
    // Official artwork is optional; episode download can continue.
  }

  notifyQueueUpdate({
    phase: "preparing",
    item,
    snapshot: downloadQueue.snapshot()
  });

  if (ffmpegRunner.isJobRunning()) {
    return { ok: false, error: "Another download is already running." };
  }

  ffmpegRunner.beginPrepare({
    destination,
    phase: `Downloading ${label}...`,
    percent: 5
  });

  const startOptions = {
    outputDir: seasonDir,
    destination,
    qualityLabel: link.qualityLabel || null,
    phase: `Downloading ${label}...`
  };
  const started =
    link.mode === "hls"
      ? await ffmpegRunner.start(link.url, link.headers || [], path.basename(episodePath), startOptions)
      : await ffmpegRunner.startDirect(link.url, link.headers || [], path.basename(episodePath), startOptions);

  if (!started.ok) {
    ffmpegRunner.clearJob();
    return { ok: false, error: started.error || "Episode download failed to start." };
  }

  const actualOutputPath = started.outputPath || episodePath;
  const startedAt = Date.now();
  const timeoutMs = 8 * 60 * 60 * 1000;

  while (Date.now() - startedAt < timeoutMs) {
    if (queue.cancelRequested) {
      await ffmpegRunner.stop();
      ffmpegRunner.clearJob();
      return { cancelled: true };
    }

    const status = ffmpegRunner.getStatus();
    if (status.state === "finished") {
      try {
        await saveArtworkForPage(contents, link.headers || [], actualOutputPath);
      } catch {
        // Episode sidecar poster is optional.
      }
      ffmpegRunner.clearJob();
      return { ok: true, outputPath: actualOutputPath };
    }
    if (status.state === "failed") {
      const error = status.lastLogLine || status.phase || "Episode download failed.";
      try {
        if (fs.statSync(actualOutputPath).size > 0) {
          ffmpegRunner.clearJob();
          return { ok: true, outputPath: actualOutputPath };
        }
      } catch {
        // ignore missing file
      }
      ffmpegRunner.clearJob();
      return { ok: false, error };
    }
    if (status.state === "idle") {
      try {
        if (fs.statSync(actualOutputPath).size > 0) {
          ffmpegRunner.clearJob();
          return { ok: true, outputPath: actualOutputPath };
        }
      } catch {
        // ignore
      }
      ffmpegRunner.clearJob();
      return { ok: false, error: "Episode download ended before completion." };
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  ffmpegRunner.clearJob();
  return { ok: false, error: "Episode download timed out." };
}

async function runTvShowDownloadJob(destination = "local") {
  if (tvShowProcessing) {
    return { ok: false, error: "A TV show download is already running." };
  }
  if (!tvShowPlan?.episodes?.length) {
    return { ok: false, error: "Scan a TV show page first." };
  }

  tvShowProcessing = true;
  tvShowCancelRequested = false;
  ensureBrowserVisible();
  notifyTvShowUpdate({ phase: "starting" });

  const access = nasOutputAccess();
  if (!access.ok) {
    tvShowProcessing = false;
    notifyTvShowUpdate({ phase: "idle" });
    return { ok: false, error: access.error, needsCredentials: Boolean(access.needsCredentials) };
  }
  const outputDir = access.path;

  const ffmpegPath = findFfmpeg();
  const session = browserView?.webContents?.session;
  const useAniwaveHls = isAnimeMode() || getSiteProfile().id === "anime";

  try {
    const result = await runTvShowDownload(tvShowPlan, {
      outputRoot: outputDir,
      outputDir,
      contentSubfolder: useAniwaveHls ? null : "TV Shows",
      runner: ffmpegRunner,
      ffmpegPath,
      shouldCancel: () => tvShowCancelRequested,
      clearJob: () => ffmpegRunner.clearJob(),
      onDebug: (step, message, data) => queueDebug(step, message, data),
      onProgress: (payload) => notifyTvShowUpdate(payload),
      loadEpisodePage: async (episodeUrl) => {
        try {
          syncAdblockerForUrl(episodeUrl);
          await loadContentPageForDownload(episodeUrl);
          if (useAniwaveHls && isAniwaveUrl(episodeUrl)) {
            const contents = browserView?.webContents;
            const serverWait = await waitForAniwaveServers(contents, 35000);
            queueDebug("aniwave-wait", serverWait.ok ? "Servers ready for episode" : "Servers not ready", {
              episodeUrl,
              serverWait
            });
          }
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error.message || String(error) };
        }
      },
      fetchEpisodeLink: async (episode) => {
        const contents = browserView?.webContents;
        if (useAniwaveHls && isAniwaveUrl(episode.url)) {
          notifyTvShowUpdate({
            phase: "fetching-link",
            episode,
            label: `S${String(episode.season || 1).padStart(2, "0")}E${String(episode.episode || 0).padStart(2, "0")}`,
            showTitle: tvShowPlan?.showTitle || "Anime"
          });
          return fetchAniwaveEpisodeStream(contents, episode, { preferDub: true });
        }

        const result = await fetchFreshDirectDownloadLink(contents, { movieUrl: episode.url });
        if (!result.ok || !result.best?.url) {
          return { ok: false, error: result.error || "Could not generate episode download link." };
        }
        const rawPageUrl = contents?.getURL() || episode.url;
        const pageUrl = canonicalMoviePageUrl(rawPageUrl) || canonicalContentUrl(rawPageUrl) || rawPageUrl;
        const headers = await streamHeadersForDownload(result.best.requestHeaders || [], pageUrl, {
          targetUrl: result.best.url,
          session
        });
        return {
          ok: true,
          url: result.best.url,
          headers,
          qualityLabel: result.best.qualityLabel || null,
          mode: "direct"
        };
      },
      startEpisodeDownload: async ({ url, headers, outputPath, label, qualityLabel, mode }) => {
        if (ffmpegRunner.isJobRunning()) {
          return { ok: false, error: "Another download is already running." };
        }
        ffmpegRunner.beginPrepare({
          destination,
          phase: `Downloading ${label}...`,
          percent: 5
        });
        const startOptions = {
          outputDir: path.dirname(outputPath),
          destination,
          qualityLabel,
          phase: `Downloading ${label}...`
        };
        const result =
          mode === "hls"
            ? await ffmpegRunner.start(url, headers, path.basename(outputPath), startOptions)
            : await ffmpegRunner.startDirect(url, headers, path.basename(outputPath), startOptions);
        return result;
      }
    });

    if (!result?.ok && !result?.cancelled) {
      notifyTvShowUpdate({
        phase: "error",
        error: result?.error || "TV show download failed."
      });
    }

    return result;
  } finally {
    tvShowProcessing = false;
    tvShowCancelRequested = false;
    notifyTvShowUpdate({ phase: "idle", processing: false });
  }
}

async function runDownloadQueue() {
  if (queueProcessing) {
    return { ok: false, error: "Queue is already running." };
  }
  if (tvShowProcessing) {
    return { ok: false, error: "Stop the TV download before starting the queue." };
  }

  queueProcessing = true;
  const previousCatalogLock = catalogBrowserLocked;
  if (isCatalogMode()) {
    catalogBrowserLocked = true;
    hideBrowserView();
  } else if (appProfile.hideMovieDownloader) {
    catalogBrowserLocked = false;
  }
  queueDebug("queue-start", "Queue run started", {
    pending: downloadQueue.snapshot().counts.pending,
    logPath: streamDebug.logPath()
  });
  notifyQueueUpdate({ phase: "starting" });

  try {
    return await processDownloadQueue(downloadQueue, {
      loadPage: loadMoviePageForQueue,
      fetchFreshLink: async (item) => {
        const contents = browserView?.webContents;
        const result = await fetchFreshDirectDownloadLink(contents, {
          movieUrl: item.movieUrl,
          timeoutMs: 20_000,
          minQualityHeight: 720,
          shouldContinue: () => !downloadQueue.cancelRequested
        });
        if (!result.ok || !result.best) {
          queueDebug("item-fail", `No fresh link for ${item.title}`, {
            itemId: item.id,
            movieUrl: item.movieUrl,
            error: result.error
          });
          return { ok: false, error: result.error || "Could not generate a fresh download link." };
        }
        return { ok: true, link: result.best };
      },
      startDownload: (destination, prepared) =>
        startStreamDownload(destination, {
          directOnly: true,
          skipLinkPrepare: true,
          preparedLink: prepared?.link || prepared
        }),
      processEpisode: (item, queue) => processQueueEpisodeItem(item, queue),
      runner: ffmpegRunner,
      clearJob: () => ffmpegRunner.clearJob(),
      stopDownload: () => ffmpegRunner.stop(),
      onProgress: (payload) => notifyQueueUpdate(payload),
      onDebug: (step, message, data) => queueDebug(step, message, data)
    });
  } finally {
    queueProcessing = false;
    if (isCatalogMode()) {
      catalogBrowserLocked = previousCatalogLock;
      if (catalogBrowserLocked) hideBrowserView();
    }
    queueDebug("queue-finish", "Queue run finished", downloadQueue.snapshot().counts);
  }
}

function resetStreamCapture(options = {}) {
  hlsCapture.clear();
  if (!options.keepDirectLinks) {
    directDownloadCapture.clear();
  }
  if (!options.keepPageUrl) {
    lastStreamPageUrl = null;
  }
  mainWindow?.webContents.send("stream-capture-reset");
}

function rememberDirectDownloadLink(url, requestHeaders = [], source = "network") {
  if (!isDirectDownloadUrl(url)) return false;

  directDownloadCapture.remember(url, requestHeaders, source);
  streamDebug.log("capture", "Direct download link captured", { url, source });
  mainWindow?.webContents.send("direct-download-found", {
    url,
    source,
    qualityLabel: directDownloadCapture.bestLink()?.qualityLabel || null,
    height: directDownloadCapture.bestLink()?.height || null
  });
  return true;
}

function resetStreamCaptureOnNavigation(url) {
  if (!url || url === "about:blank") return;

  if (isDirectDownloadUrl(url)) {
    rememberDirectDownloadLink(url, [], "navigation");
    return;
  }

  let shouldReset = true;
  if (lastStreamPageUrl) {
    try {
      const prev = new URL(lastStreamPageUrl);
      const next = new URL(url);

      if (/loadshare\.org/i.test(prev.hostname) && /\/movie\//i.test(next.pathname)) {
        shouldReset = false;
      } else {
        shouldReset = prev.origin !== next.origin || prev.pathname !== next.pathname;
      }
    } catch {
      shouldReset = true;
    }
  }

  lastStreamPageUrl = url;
  if (shouldReset) {
    resetStreamCapture();
  }
}

function navigationHistory(contents) {
  return contents.navigationHistory || contents;
}

function layoutBrowserView() {
  if (!mainWindow || !browserView) return;

  const { width, height } = mainWindow.getContentBounds();
  browserView.setBounds({
    x: CHROME_MARGIN,
    y: chromeTop,
    width: Math.max(0, width - chromeRight - CHROME_MARGIN),
    height: Math.max(0, height - chromeTop - chromeBottom)
  });
}

function setupHlsListener(session) {
  session.webRequest.onBeforeSendHeaders({ urls: ["<all_urls>"] }, (details, callback) => {
    if (/\.m3u8(?:$|[?#])/i.test(details.url)) {
      hlsCapture.remember(details.url, details.requestHeaders);
      streamDebug.log("capture", "HLS playlist seen", {
        url: details.url,
        resourceType: details.resourceType || null
      });
    }

    if (/loadshare\.org\/download\//i.test(details.url)) {
      rememberDirectDownloadLink(details.url, details.requestHeaders, "network");
    }

    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });
}

function isCatalogMode() {
  return !Boolean(appProfile.hideMovieDownloader);
}

function isCustomShell() {
  return isCatalogMode() || Boolean(appProfile.hideMovieDownloader);
}

function isBrowserLocked() {
  return isCustomShell() && catalogBrowserLocked;
}

function showBrowserView() {
  if (!mainWindow || !browserView) return;
  if (isBrowserLocked()) {
    hideBrowserView();
    return;
  }
  mainWindow.setBrowserView(browserView);
  layoutBrowserView();
  mainWindow.webContents.send("page-load-succeeded");
}

function ensureBrowserVisible() {
  if (isBrowserLocked()) {
    hideBrowserView();
    return;
  }
  showBrowserView();
  mainWindow?.webContents.send("browser-content-visible");
}

function isAutomatedBrowsingActive() {
  return Boolean(tvShowProcessing || queueProcessing);
}

function hideBrowserView() {
  if (!mainWindow || !browserView) return;
  mainWindow.removeBrowserView(browserView);
}

function showSearchLanding() {
  if (!mainWindow || !browserView) return;
  if (isCustomShell()) catalogBrowserLocked = true;
  resetStreamCapture();
  hideBrowserView();
  mainWindow.webContents.send("show-search-landing");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadUrlAndWait(contents, url, options = {}) {
  return waitForPageLoad(contents, url, {
    timeoutMs: Number(options.timeoutMs) || 45_000,
    settleMs: Number(options.settleMs) || 1200
  });
}

function loadSearch(query) {
  if (!browserView) return;
  resetStreamCapture();
  const url = buildSearchUrl(query);
  ensureBrowserVisible();
  browserView.webContents.loadURL(url);
  return url;
}

async function catalogSearch(query) {
  const trimmed = String(query || "").trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a title to search.", movies: [] };
  }
  if (!browserView?.webContents || browserView.webContents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready.", movies: [] };
  }

  const url = buildSearchUrl(trimmed);
  resetStreamCapture();
  hideBrowserView();

  try {
    await loadUrlAndWait(browserView.webContents, url, { settleMs: 2200 });
    await delay(800);
    let scrape = await scrapeSearchMovieLinks(browserView.webContents);
    if (!scrape.movies?.length) {
      await delay(1500);
      scrape = await scrapeSearchMovieLinks(browserView.webContents);
    }
    if (!scrape.ok) {
      return { ok: false, error: scrape.error || "Search scrape failed.", query: trimmed, url, movies: [] };
    }
    if (!scrape.movies?.length) {
      return {
        ok: false,
        error: `No movies or TV shows found for "${trimmed}".`,
        query: trimmed,
        url,
        movies: []
      };
    }
    return {
      ok: true,
      query: trimmed,
      url,
      movies: scrape.movies,
      counts: scrape.counts || null
    };
  } catch (error) {
    return { ok: false, error: error.message || String(error), query: trimmed, url, movies: [] };
  }
}

async function catalogOpenMovie(movieUrl, fallback = {}) {
  const rawUrl = String(movieUrl || fallback.movieUrl || "");
  const kindHint = fallback.kind === "tv" || /\/(?:tv-series|tv|serie|series)\//i.test(rawUrl) ? "tv" : "movie";
  const targetUrl =
    kindHint === "movie"
      ? canonicalMoviePageUrl(rawUrl) || normalizeMovieUrl(rawUrl) || rawUrl
      : canonicalContentUrl(rawUrl) || rawUrl;

  if (kindHint === "movie" && !/\/movie\//i.test(targetUrl)) {
    return { ok: false, error: "Invalid movie URL." };
  }
  if (kindHint === "tv" && !/\/(?:tv-series|tv|serie|series)\//i.test(targetUrl)) {
    return { ok: false, error: "Invalid TV show URL." };
  }

  try {
    if (kindHint === "movie") {
      await loadMoviePageForQueue(targetUrl);
    } else {
      await loadContentPageForDownload(targetUrl);
    }
    const scrape = await scrapeMovieDetail(browserView.webContents);
    const movie = {
      kind: scrape.movie?.kind || kindHint,
      movieUrl: scrape.movie?.movieUrl || targetUrl,
      title: scrape.movie?.title || fallback.title || titleFromMovieUrl(targetUrl),
      posterUrl: scrape.movie?.posterUrl || fallback.posterUrl || undefined,
      year: scrape.movie?.year || fallback.year || undefined
    };
    return { ok: true, movie };
  } catch (error) {
    return {
      ok: false,
      error: error.message || String(error),
      movie: {
        kind: kindHint,
        movieUrl: targetUrl,
        title: fallback.title || titleFromMovieUrl(targetUrl),
        posterUrl: fallback.posterUrl,
        year: fallback.year
      }
    };
  }
}

function sendNavigationState() {
  if (!mainWindow || !browserView) return;

  const contents = browserView.webContents;
  const history = navigationHistory(contents);
  mainWindow.webContents.send("navigation-state-changed", {
    canGoBack: history.canGoBack(),
    canGoForward: history.canGoForward()
  });
}

function setupBrowserNavigationHandlers() {
  const contents = browserView.webContents;

  contents.on("will-navigate", (event, url, isSameDocument, isMainFrame) => {
    if (!isMainFrame || isSameDocument || !isDirectDownloadUrl(url)) return;
    event.preventDefault();
    rememberDirectDownloadLink(url, [], "navigation-intercept");
  });

  contents.on("did-start-navigation", (_event, url, isInPlace, isMainFrame) => {
    if (!isMainFrame || !url || url === "about:blank") return;
    if (!isInPlace && url !== gatewayRetryUrl) {
      resetGatewayRetryState();
    }
    syncAdblockerForUrl(url);
    resetStreamCaptureOnNavigation(url);
  });

  contents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === ERR_ABORTED) return;

    if (isAutomatedBrowsingActive()) {
      streamDebug.log("navigation", "Load failed during automated download (keeping browser visible)", {
        errorCode,
        errorDescription,
        url: validatedURL
      });
      ensureBrowserVisible();
      return;
    }

    hideBrowserView();
    mainWindow.webContents.send("page-load-failed", {
      errorCode,
      errorDescription,
      url: validatedURL
    });
  });

  contents.on("did-finish-load", async () => {
    const url = contents.getURL();
    if (!url || url === "about:blank") return;

    if (await isCloudflareBadGatewayPage(contents)) {
      ensureBrowserVisible();
      scheduleGatewayRetry(contents, url);
      return;
    }

    resetGatewayRetryState();
    ensureBrowserVisible();
    sendNavigationState();

    if (/\/movie\//i.test(url)) {
      scanDirectDownloads(contents).catch(() => {
        // Best effort scan on movie pages.
      });
    }
  });

  contents.on("did-navigate", () => sendNavigationState());
  contents.on("did-navigate-in-page", () => sendNavigationState());
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 900,
    minWidth: 1200,
    minHeight: 640,
    title: appProfile.windowTitle,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      partition: appProfile.browserPartition
    }
  });
  mainWindow.on("close", () => persistDownloadQueue());

  browserView = new BrowserView({
    webPreferences: {
      partition: appProfile.browserPartition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (!isBrowserLocked()) {
    mainWindow.setBrowserView(browserView);
    layoutBrowserView();
  }
  mainWindow.on("resize", layoutBrowserView);

  // Catalog posters load in the shell; Tornado CDN often requires site referer.
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ["https://*.tornadomovies.co/*", "https://static.tornadomovies.co/*"] },
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders };
      if (!requestHeaders.Referer && !requestHeaders.referer) {
        requestHeaders.Referer = `${SITE_BASE_URL}/`;
      }
      callback({ requestHeaders });
    }
  );

  const browserSession = browserView.webContents.session;
  setupChromeCompatibility(browserSession, browserView.webContents);
  await setupAdblocker(browserSession);
  setupEmbedCompatibility(browserSession, browserView.webContents);
  setupHlsListener(browserSession);
  setupNavigationGuard(browserView.webContents, browserSession, SITE_HOME_URL, (details) => {
    mainWindow?.webContents.send("redirect-blocked", details);
  }, getSiteProfile().allowedDomains || []);
  siteAutoLogin = setupSiteAutoLogin(browserView.webContents, {
    loginUrl: SITE_LOGIN_URL,
    homeUrl: SITE_HOME_URL,
    loadCredentials: loadSiteCredentials,
    onDebug: (entry) => {
      streamDebug.log("site-login-debug", entry.type || "login-debug", entry);
      mainWindow?.webContents.send("site-login-debug", entry);
    },
    onResult: (result) => {
      streamDebug.log("site-login", result.status || "site login attempt", result);
      mainWindow?.webContents.send("site-login-result", result);
    }
  });
  setupBrowserNavigationHandlers();
  setupTornadoDownloadScraper(browserView.webContents);
  setupTornadoSearchScraper(browserView.webContents);
  setupTvShowScraper(browserView.webContents);
  browserView.webContents.setMaxListeners(20);
  browserView.webContents.on("render-process-gone", (_event, details) => {
    streamDebug.log("crash", "Renderer process gone", details);
  });
  browserView.webContents.on("unresponsive", () => {
    streamDebug.log("crash", "BrowserView became unresponsive");
  });

  browserView.webContents.on("console-message", (_event, _level, message) => {
    const directMarker = "[TornadoDirectDownload]";
    const directIndex = String(message || "").indexOf(directMarker);
    if (directIndex >= 0) {
      try {
        const payload = JSON.parse(String(message).slice(directIndex + directMarker.length).trim());
        if (payload?.url) {
          rememberDirectDownloadLink(payload.url, [], payload.source || "page");
        }
      } catch {
        // Ignore parse failures.
      }
    }

    const loginMarker = "[TornadoLoginDebug]";
    const loginIndex = String(message || "").indexOf(loginMarker);
    if (loginIndex < 0) return;

    try {
      const payload = JSON.parse(String(message).slice(loginIndex + loginMarker.length).trim());
      streamDebug.log("site-login-debug", payload.type || "login-debug", payload);
      mainWindow?.webContents.send("site-login-debug", payload);
    } catch {
      streamDebug.log("site-login-debug", "parse-failed", { message: String(message).slice(0, 500) });
    }
  });

  mainWindow.loadFile(path.join(__dirname, "shell.html"));
  mainWindow.webContents.once("did-finish-load", () => {
    showSearchLanding();
  });
}

ipcMain.handle("get-playlists", () => {
  const playlists = hlsCapture.list();
  const best = hlsCapture.bestPlaylist();
  const directDownloads = directDownloadCapture.list();
  const bestDirect = directDownloadCapture.bestLink();

  return {
    playlists,
    best: best
      ? {
          url: best.url,
          displayUrl: best.displayUrl,
          kind: best.kind,
          lastSeenAt: best.lastSeenAt
        }
      : null,
    directDownloads,
    bestDirect: bestDirect
      ? {
          url: bestDirect.url,
          displayUrl: bestDirect.displayUrl,
          name: bestDirect.name,
          kind: bestDirect.kind,
          qualityLabel: bestDirect.qualityLabel,
          height: bestDirect.height,
          lastSeenAt: bestDirect.lastSeenAt
        }
      : null
  };
});

ipcMain.handle("scan-direct-downloads", async () => {
  if (!browserView?.webContents || browserView.webContents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  const scan = await scanDirectDownloads(browserView.webContents);
  await ingestDirectLinksFromScan(scan, "manual-scan");
  const bestDirect = directDownloadCapture.bestLink();
  return {
    ok: true,
    scan,
    directDownloads: directDownloadCapture.list(),
    bestDirect
  };
});

ipcMain.handle("clear-playlists", () => {
  hlsCapture.clear();
  directDownloadCapture.clear();
  return { ok: true };
});

ipcMain.handle("diagnose-streams", async () => {
  const playlists = hlsCapture.list();
  const rawPageUrl = browserView?.webContents?.getURL() || "";
  const pageUrl = canonicalMoviePageUrl(rawPageUrl) || rawPageUrl;
  const session = browserView?.webContents?.session;
  const { report } = await diagnoseStreamCandidates(playlists, { pageUrl, session });
  const text = streamDebug.formatReport(report);
  streamDebug.log("diagnose-manual", report.summary || "manual diagnosis", {
    playlistCount: report.playlistCount
  });
  return { ok: true, report, text, logPath: streamDebug.logPath() };
});

ipcMain.handle("open-stream-debug-log", () => {
  const logPath = streamDebug.logPath();
  shell.showItemInFolder(logPath);
  return { ok: true, path: logPath };
});

ipcMain.handle("get-environment", async () => {
  const nas = loadNasConfig();
  const browserSession = browserView?.webContents?.session;
  const siteLoggedIn = await sessionHasTornadoIdentity(browserSession, SITE_HOME_URL);
  return {
    profileId: appProfile.id,
    profileLabel: appProfile.brandLabel,
    siteBaseUrl: SITE_BASE_URL,
    siteHomeUrl: SITE_HOME_URL,
    siteLoginUrl: SITE_LOGIN_URL,
    siteUsername: loadSiteCredentials().username || null,
    siteLoggedIn,
    siteHasIdentityCookie: siteLoggedIn,
    siteAutoLoginEnabled: Boolean(loadSiteCredentials().autoLogin),
    ffmpegPath: findFfmpeg(),
    outputDirectory: outputDirectory(),
    defaultLocalVideoFolder: defaultLocalVideoFolder(),
    nasPortalUrl: nas.portalUrl,
    nasVideoFolder: nas.videoFolder,
    nasUsername: loadNasCredentials().username || null,
    adBlockerEnabled: browserSession ? isAdblockerEnabled(browserSession) : false,
    redirectProtectionEnabled: Boolean(browserView),
    currentPageUrl: browserView?.webContents?.getURL() || null,
    openAnimeButton: Boolean(appProfile.openAnimeButton),
    hideMovieDownloader: Boolean(appProfile.hideMovieDownloader),
    catalogMode: isCatalogMode(),
    landingTitle: appProfile.landingTitle || null,
    landingLead: appProfile.landingLead || null,
    defaultSidebarMode: appProfile.defaultSidebarMode || "movies",
    siteLabel: appProfile.siteLabel || "Tornado Movies",
    tvShowLead: appProfile.tvShowLead || "",
    startupLog: appProfile.startupLog || "",
    searchPlaceholder: appProfile.searchPlaceholder
  };
});

ipcMain.handle("choose-folder", async (_event, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || "Choose folder",
    defaultPath: options.defaultPath || undefined,
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, canceled: true };
  }

  return { ok: true, path: result.filePaths[0] };
});

ipcMain.handle("save-media-folders", (_event, payload = {}) => {
  const localVideoFolder = String(payload.localVideoFolder || "").trim();
  const nasVideoFolder = String(payload.nasVideoFolder || "").trim();

  if (localVideoFolder) {
    const localAccess = ensureLocalFolder(localVideoFolder);
    if (!localAccess.ok) return localAccess;
    saveLocalConfig({ videoFolder: localAccess.path });
  } else {
    saveLocalConfig({ videoFolder: "" });
  }

  saveNasConfig({ videoFolder: nasVideoFolder });

  return {
    ok: true,
    outputDirectory: outputDirectory(),
    nasVideoFolder: loadNasConfig().videoFolder
  };
});

ipcMain.handle("get-folder-storage", async (_event, payload = {}) => {
  const localFolder = Object.prototype.hasOwnProperty.call(payload, "localFolder")
    ? String(payload.localFolder || "").trim()
    : outputDirectory();
  const nasFolder = Object.prototype.hasOwnProperty.call(payload, "nasFolder")
    ? String(payload.nasFolder || "").trim()
    : loadNasConfig().videoFolder;

  if (nasFolder) {
    try {
      prepareNasAccess(nasFolder);
    } catch {
      // Storage lookup still runs; failures surface as unavailable.
    }
  }

  return {
    ok: true,
    local: localFolder
      ? getFolderStorage(localFolder)
      : { ok: false, error: "No folder set" },
    nas: nasFolder
      ? getFolderStorage(nasFolder)
      : { ok: false, error: "No NAS folder set" }
  };
});

ipcMain.handle("open-anime-window", () => {
  try {
    const args = [app.getAppPath(), "--anime"];
    spawn(process.execPath, args, {
      detached: true,
      stdio: "ignore",
      cwd: path.dirname(app.getAppPath())
    }).unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("navigate", (_event, url) => {
  if (!browserView) return { ok: false, error: "Browser is not ready." };
  resetStreamCapture();
  browserView.webContents.loadURL(url);
  return { ok: true };
});

ipcMain.handle("reload-page", () => {
  if (!browserView) return { ok: false };
  showSearchLanding();
  return { ok: true };
});

ipcMain.handle("set-catalog-browser-locked", (_event, locked = true) => {
  if (!isCustomShell()) {
    return { ok: true, locked: false };
  }
  catalogBrowserLocked = Boolean(locked);
  if (catalogBrowserLocked) {
    hideBrowserView();
    if (isCatalogMode()) {
      mainWindow?.webContents.send("show-search-landing");
    }
  }
  return { ok: true, locked: catalogBrowserLocked };
});

ipcMain.handle("go-home", (_event, options = {}) => {
  if (!browserView) return { ok: false, error: "Browser is not ready." };
  const browseSite = Boolean(options?.browse);
  if (options?.hideBrowser) {
    if (isCustomShell()) catalogBrowserLocked = true;
    hideBrowserView();
    return { ok: true, hidden: true };
  }
  if (browseSite && isCustomShell()) {
    catalogBrowserLocked = false;
  }
  if (!browseSite && isBrowserLocked()) {
    showSearchLanding();
    return { ok: true, home: true };
  }
  resetStreamCapture();
  ensureBrowserVisible();
  browserView.webContents.loadURL(SITE_HOME_URL);
  return { ok: true, url: SITE_HOME_URL, browse: browseSite };
});

ipcMain.handle("get-site-credentials", () => {
  const creds = loadSiteCredentials();
  return {
    username: creds.username || null,
    autoLogin: Boolean(creds.autoLogin),
    hasPassword: Boolean(creds.password)
  };
});

ipcMain.handle("save-site-credentials", (_event, payload) => {
  saveSiteCredentials(payload || {});
  return { ok: true };
});

ipcMain.handle("get-site-login-debug", async () => {
  if (!browserView?.webContents || browserView.webContents.isDestroyed()) {
    return { ok: false, entries: [] };
  }

  try {
    const entries = await browserView.webContents.executeJavaScript(
      "Array.isArray(window.__tornadoLoginDebug) ? window.__tornadoLoginDebug : []"
    );
    return { ok: true, entries, logPath: streamDebug.logPath() };
  } catch (error) {
    return { ok: false, entries: [], error: error.message || String(error) };
  }
});

ipcMain.handle("site-login", async () => {
  if (!browserView || !siteAutoLogin) {
    return { ok: false, error: "Browser is not ready." };
  }

  const creds = loadSiteCredentials();
  if (!creds.username || !creds.password) {
    return {
      ok: false,
      error: "Save your Tornado Movies username and password first.",
      needsCredentials: true
    };
  }

  ensureBrowserVisible();
  syncAdblockerForUrl(SITE_LOGIN_URL);
  return siteAutoLogin.requestManualLogin();
});

ipcMain.handle("search-movies", async (_event, query) => {
  if (!browserView) return { ok: false, error: "Browser is not ready.", movies: [] };

  if (isCatalogMode()) {
    return catalogSearch(query);
  }

  try {
    const url = loadSearch(query);
    return { ok: true, url, query: String(query || "").trim(), movies: [] };
  } catch (error) {
    return { ok: false, error: error.message || String(error), movies: [] };
  }
});

ipcMain.handle("catalog-open-movie", async (_event, payload = {}) => {
  if (!isCatalogMode()) {
    return { ok: false, error: "Catalog mode is only available in the movie app." };
  }
  return catalogOpenMovie(payload.movieUrl, {
    kind: payload.kind,
    title: payload.title,
    posterUrl: payload.posterUrl,
    year: payload.year
  });
});

ipcMain.handle("download-movie", async (_event, payload = {}) => {
  if (!browserView) return { ok: false, error: "Browser is not ready." };
  const movieUrl = canonicalMoviePageUrl(payload.movieUrl) || String(payload.movieUrl || "");
  if (!/\/movie\//i.test(movieUrl)) {
    return { ok: false, error: "Pick a movie from the catalog first." };
  }

  const destination = "nas";
  try {
    await loadMoviePageForQueue(movieUrl);
    return await startStreamDownload(destination, { freshLink: true });
  } catch (error) {
    ffmpegRunner.clearJob();
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("add-movie-to-queue", (_event, payload = {}) => {
  const movieUrl = canonicalMoviePageUrl(payload.movieUrl) || String(payload.movieUrl || "");
  if (!/\/movie\//i.test(movieUrl)) {
    return { ok: false, error: "Invalid movie URL." };
  }

  const destination = "nas";
  const result = downloadQueue.add(movieUrl, {
    destination,
    title: payload.title || titleFromMovieUrl(movieUrl)
  });
  if (result.ok) {
    queueDebug("queue-add", `Added "${result.item.title}"`, {
      movieUrl: result.item.movieUrl,
      movieId: extractMovieIdFromUrl(result.item.movieUrl),
      destination
    });
    notifyQueueUpdate();
  }
  return result;
});

ipcMain.handle("reload-current-page", () => {
  if (!browserView) return { ok: false, error: "Browser is not ready." };

  ensureBrowserVisible();
  browserView.webContents.reload();
  return { ok: true };
});

ipcMain.handle("get-navigation-state", () => {
  if (!browserView) {
    return { canGoBack: false, canGoForward: false };
  }

  const contents = browserView.webContents;
  const history = navigationHistory(contents);
  return {
    canGoBack: history.canGoBack(),
    canGoForward: history.canGoForward()
  };
});

ipcMain.handle("go-back", () => {
  const history = navigationHistory(browserView?.webContents);
  if (!history?.canGoBack()) {
    return { ok: false };
  }

  ensureBrowserVisible();
  history.goBack();
  return { ok: true };
});

ipcMain.handle("go-forward", () => {
  const history = navigationHistory(browserView?.webContents);
  if (!history?.canGoForward()) {
    return { ok: false };
  }

  ensureBrowserVisible();
  history.goForward();
  return { ok: true };
});

ipcMain.handle("open-warp-download", async () => {
  await shell.openExternal(WARP_DOWNLOAD_URL);
  return { ok: true, url: WARP_DOWNLOAD_URL };
});

ipcMain.handle("install-warp-vpn", async () => {
  const command = `start "Install 1.1.1.1 VPN" cmd /k "${WARP_WINGET_COMMAND}"`;
  exec(command, { shell: true });
  return { ok: true, command: WARP_WINGET_COMMAND };
});

async function ingestDirectLinksFromScan(scanResult, source = "scan") {
  const links = Array.isArray(scanResult?.links) ? scanResult.links : [];
  for (const url of links) {
    rememberDirectDownloadLink(url, [], source);
  }
  return links.length;
}

async function fetchFreshDirectDownloadLink(contents, options = {}) {
  if (!contents || contents.isDestroyed()) {
    queueDebug("link-fail", "Browser is not ready", { movieUrl: options.movieUrl || null });
    return { ok: false, error: "Browser is not ready." };
  }

  const movieUrl = options.movieUrl || contents.getURL() || "";
  const canonicalUrl = canonicalMoviePageUrl(movieUrl) || canonicalContentUrl(movieUrl) || movieUrl;
  const downloadIds = extractDownloadIds(canonicalUrl);
  const movieId = downloadIds[0] || extractMovieIdFromUrl(canonicalUrl) || extractGetbuttonId(canonicalUrl);
  if (!movieId) {
    queueDebug("link-fail", "Missing movie ID in URL", { movieUrl });
    return { ok: false, error: "Invalid movie page URL (missing movie ID)." };
  }

  queueDebug("link-start", "Generating fresh download link", {
    movieUrl: canonicalUrl,
    movieId,
    currentPage: contents.getURL() || null
  });

  directDownloadCapture.clear();

  const timeoutMs = options.timeoutMs ?? 20_000;
  const minQualityHeight = options.minQualityHeight ?? 720;
  const startedAt = Date.now();
  let attempt = 0;
  let bestSoFar = null;
  let maxHeightSeen = 0;

  while (Date.now() - startedAt < timeoutMs) {
    if (options.shouldContinue && !options.shouldContinue()) {
      return { ok: false, cancelled: true, error: "Cancelled." };
    }

    attempt += 1;
    const remaining = timeoutMs - (Date.now() - startedAt);
    if (remaining <= 0) break;

    let result;
    try {
      result = await withTimeout(
        fetchDirectLinksForMovie(contents, canonicalUrl),
        Math.min(12_000, remaining),
        "Download link scan"
      );
    } catch (error) {
      queueDebug("link-timeout", error.message || String(error), {
        movieUrl,
        movieId,
        attempt,
        elapsedMs: Date.now() - startedAt
      });
      break;
    }

    await ingestDirectLinksFromScan(result, "getbutton-id");

    const best = directDownloadCapture.bestLink();
    const allLinks = directDownloadCapture.list();
    maxHeightSeen = Math.max(maxHeightSeen, result.maxHeight || 0, ...allLinks.map((link) => link.height || 0));
    if (best && (!bestSoFar || (best.height || 0) > (bestSoFar.height || 0))) {
      bestSoFar = best;
    }

    queueDebug(
      bestSoFar ? "link-found" : "link-attempt",
      bestSoFar
        ? `Fresh link captured (${bestSoFar.qualityLabel || "direct"})`
        : "Collecting download links...",
      {
        movieUrl,
        movieId,
        attempt,
        elapsedMs: Date.now() - startedAt,
        scanOk: result.ok,
        scanReason: result.reason || result.error || null,
        attempts: result.attempts || [],
        links: result.links || [],
        maxHeightSeen,
        best: bestSoFar
          ? {
              qualityLabel: bestSoFar.qualityLabel,
              displayUrl: bestSoFar.displayUrl,
              height: bestSoFar.height
            }
          : null
      }
    );

    if (bestSoFar && (maxHeightSeen >= minQualityHeight || (bestSoFar.height || 0) >= minQualityHeight)) {
      return { ok: true, best: bestSoFar, elapsedMs: Date.now() - startedAt, attempt };
    }

    if (bestSoFar && attempt >= 2) {
      return { ok: true, best: bestSoFar, elapsedMs: Date.now() - startedAt, attempt };
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  if (bestSoFar) {
    return { ok: true, best: bestSoFar, elapsedMs: Date.now() - startedAt, attempt };
  }

  queueDebug("link-fail", "Timed out waiting for fresh download link", {
    movieUrl,
    movieId,
    attempt,
    elapsedMs: Date.now() - startedAt
  });

  return {
    ok: false,
    best: null,
    error: "Fresh link timed out."
  };
}

async function prepareMoviePageForDirectDownload(contents, options = {}) {
  const movieUrl = options.movieUrl || contents?.getURL() || "";
  return fetchFreshDirectDownloadLink(contents, {
    movieUrl,
    timeoutMs: options.timeoutMs ?? 30_000
  });
}

async function ensureDirectDownloadLinks() {
  const contents = browserView?.webContents;
  if (!contents || contents.isDestroyed()) {
    return { ok: false, reason: "browser-not-ready" };
  }

  const pageUrl = contents.getURL() || "";
  if (!/\/movie\//i.test(pageUrl)) {
    return { ok: false, reason: "not-movie-page" };
  }

  if (directDownloadCapture.bestLink()) {
    return { ok: true, best: directDownloadCapture.bestLink() };
  }

  const initial = await scanDirectDownloads(contents);
  await ingestDirectLinksFromScan(initial, "ensure-scan");

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const best = directDownloadCapture.bestLink();
    if (best) {
      return { ok: true, best, attempt };
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    if (attempt % 2 === 1) {
      const scan = await scanDirectDownloads(contents);
      await ingestDirectLinksFromScan(scan, "ensure-scan");
    }
  }

  return {
    ok: Boolean(directDownloadCapture.bestLink()),
    best: directDownloadCapture.bestLink(),
    reason: directDownloadCapture.bestLink() ? null : "no-links-found"
  };
}

async function resolveDownloadTarget(options = {}) {
  const rawPageUrl = browserView?.webContents?.getURL() || "";
  const pageUrl = canonicalMoviePageUrl(rawPageUrl) || rawPageUrl;
  const bestDirect = directDownloadCapture.bestLink();

  if (bestDirect) {
    return {
      ok: true,
      resolved: {
        url: bestDirect.url,
        qualityLabel: bestDirect.qualityLabel,
        width: bestDirect.height ? Math.round((bestDirect.height * 16) / 9) : null,
        height: bestDirect.height || null,
        kind: "direct",
        source: bestDirect
      },
      playlist: bestDirect,
      mode: "direct"
    };
  }

  if (options.directOnly) {
    return {
      ok: false,
      error:
        "No direct download link found. The queue opens each movie page and fetches loadshare.org links (4K first) — this page did not return one."
    };
  }

  const playlists = hlsCapture.list();
  if (!playlists.length) {
    return {
      ok: false,
      error:
        "No download link detected yet. Open a movie page and click the site's Download option (pick 4K if available), or start playing for HLS capture."
    };
  }

  ffmpegRunner.setPhase("Analyzing captured streams for best quality...", 12);

  const session = browserView?.webContents?.session;
  const resolveOptions = { pageUrl, session };

  const { report, resolved } = await diagnoseStreamCandidates(playlists, resolveOptions);
  const debugText = streamDebug.formatReport(report);
  streamDebug.log("diagnose", report.summary || "stream diagnosis complete", {
    playlistCount: report.playlistCount,
    probeCount: report.probes?.length || 0,
    selected: report.selected?.codec || null
  });

  if (!resolved?.url) {
    const summary = report.summary || "";
    const isAuthFailure = /failed ffprobe\/fetch|proxy may need cookies/i.test(summary);
    const isPngPreview = /PNG preview|thumbnails\/images \(png\)/i.test(summary);
    return {
      ok: false,
      error: isPngPreview
        ? "Only a PNG preview stream was captured — not the full movie. Keep playing for 30–60 seconds (skip ahead if needed), then try Download again."
        : isAuthFailure
          ? "Stream was captured but could not be validated — the proxy may require an active playback session. Keep the movie playing, wait 15–20 seconds, then try Download again."
          : "No real video stream found — only thumbnails or previews were detected. Make sure the movie is playing (not paused on a poster), wait 15–20 seconds, then try again.",
      debug: report,
      debugText
    };
  }

  return {
    ok: true,
    resolved,
    playlist: resolved.source,
    debug: report,
    debugText
  };
}

async function startStreamDownload(destination = "nas", options = {}) {
  destination = "nas";
  ffmpegRunner.beginPrepare({
    destination,
    phase: "Preparing download...",
    percent: 8
  });

  const preparedLink = options.preparedLink?.url ? options.preparedLink : null;
  if (preparedLink?.url) {
    rememberDirectDownloadLink(
      preparedLink.url,
      preparedLink.requestHeaders || [],
      "queue-prepared"
    );
  }

  const rawPageUrl = browserView?.webContents?.getURL() || "";
  const pageUrl = canonicalMoviePageUrl(rawPageUrl) || rawPageUrl;
  if (/\/movie\//i.test(pageUrl) && !options.skipLinkPrepare) {
    ffmpegRunner.setPhase("Looking for direct download links (4K first)...", 10);
    if (options.freshLink) {
      directDownloadCapture.clear();
      await fetchFreshDirectDownloadLink(browserView.webContents);
    } else {
      await ensureDirectDownloadLinks();
    }
  }

  const target = await resolveDownloadTarget({ directOnly: Boolean(options.directOnly) });
  if (!target.ok) {
    ffmpegRunner.clearJob();
    if (target.debugText) {
      mainWindow?.webContents.send("stream-debug-report", {
        text: target.debugText,
        report: target.debug
      });
    }
    return target;
  }

  ffmpegRunner.setPhase(
    target.mode === "direct"
      ? `Direct ${target.resolved.qualityLabel || "download"} link found...`
      : "Checking stream with ffprobe...",
    15
  );

  const { resolved, playlist } = target;

  const ffprobePath = findFfprobe();
  if (ffprobePath && target.mode !== "direct") {
    const preProbeHeaders = await streamHeadersForDownload(playlist.requestHeaders, pageUrl, {
      targetUrl: resolved.url,
      session: browserView?.webContents?.session
    });
    const preProbe = await probeStream(resolved.url, preProbeHeaders, ffprobePath);
    if (preProbe.status === "invalid") {
      ffmpegRunner.clearJob();
      return {
        ok: false,
        error:
          "Selected stream is a PNG preview slideshow, not the movie. Keep playing for 30–60 seconds, then try Download again.",
        debug: target.debug,
        debugText: target.debugText
      };
    }
    if (preProbe.status === "ok") {
      resolved.streamIndex = preProbe.streamIndex;
      resolved.codec = preProbe.codec;
      resolved.width = preProbe.width || resolved.width;
      resolved.height = preProbe.height || resolved.height;
    }
  }

  ffmpegRunner.setPhase(
    target.mode === "direct"
      ? `Direct ${resolved.qualityLabel || "download"} link found. Downloading poster...`
      : `Best stream found (${resolved.qualityLabel || "best available"}). Downloading poster...`,
    22
  );
  const access = nasOutputAccess();
  if (!access.ok) {
    ffmpegRunner.clearJob();
    return {
      ok: false,
      error: access.error,
      needsCredentials: Boolean(access.needsCredentials)
    };
  }
  const outputDir = access.path;

  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const directName = playlist?.name?.replace(/_\d{3,4}$/i, "");
    const outputName =
      (directName ? `${directName}.mp4` : null) ||
      outputNameFromPageUrl(pageUrl) ||
      `movie-${stamp}.mp4`;
    const videoOutputPath = path.join(outputDir, safeOutputName(outputName, resolved.url));

    let artworkPath = null;
    try {
      artworkPath = await saveArtworkForPage(
        browserView?.webContents,
        playlist.requestHeaders,
        videoOutputPath
      );
    } catch {
      // Artwork is optional; continue when poster download fails.
    }

    ffmpegRunner.setPhase(
      target.mode === "direct"
        ? `Starting direct ${resolved.qualityLabel || "file"} download...`
        : "Starting FFmpeg and capturing stream to MP4...",
      30
    );

    const downloadHeaders = await streamHeadersForDownload(playlist.requestHeaders, pageUrl, {
      targetUrl: resolved.url,
      session: browserView?.webContents?.session
    });
    const ffmpegPath = findFfmpeg();
    const downloadOptions = {
      outputDir,
      destination,
      artworkPath,
      qualityLabel: resolved.qualityLabel,
      videoStreamIndex: resolved.streamIndex,
      session: browserView?.webContents?.session,
      onComplete: (job) => {
        const posterPath = findPosterForVideo(job.outputPath) || job.artworkPath;
        if (!posterPath || !ffmpegPath) return;

        setImmediate(() => {
          embedPosterInVideoAsync(ffmpegPath, job.outputPath, posterPath, {
            removePosterAfterEmbed: false
          })
            .then((result) => {
              if (result.ok) {
                streamDebug.log("poster", "Poster embedded in video file", job.outputPath);
                mainWindow?.webContents.send("poster-embedded", {
                  outputPath: job.outputPath
                });
              } else if (result.error) {
                streamDebug.log("poster", "Poster embed failed", {
                  outputPath: job.outputPath,
                  error: result.error
                });
              }
            })
            .catch(() => {
              // Poster embedding is optional and runs in the background.
            });
        });
      },
      onFinished: (code) => {
        if (code === 0) {
          resetStreamCapture();
        }
      }
    };

    const result =
      target.mode === "direct"
        ? await ffmpegRunner.startDirect(
            resolved.url,
            downloadHeaders,
            outputName,
            downloadOptions
          )
        : await ffmpegRunner.start(
            resolved.url,
            downloadHeaders,
            outputName,
            downloadOptions
          );

    return {
      ok: true,
      ...result,
      artworkPath,
      destination,
      nasPortalUrl: loadNasConfig().portalUrl || null,
      quality: {
        label: resolved.qualityLabel,
        width: resolved.width,
        height: resolved.height
      },
      playlist: {
        url: playlist.displayUrl,
        kind: playlist.kind
      }
    };
  } catch (error) {
    ffmpegRunner.clearJob();
    return { ok: false, error: error.message || String(error) };
  }
}

ipcMain.handle("download-current-stream", async () => startStreamDownload("nas"));

ipcMain.handle("save-to-nas", async () => startStreamDownload("nas"));

ipcMain.handle("get-download-queue", () => ({
  ok: true,
  processing: queueProcessing,
  snapshot: downloadQueue.snapshot(),
  recovery: queueRecovery,
  debugLogPath: streamDebug.logPath()
}));

ipcMain.handle("get-queue-debug", () => ({
  ok: true,
  entries: recentQueueDebugEntries(streamDebug, 60),
  logPath: streamDebug.logPath()
}));

ipcMain.handle("add-current-to-queue", (_event, destination = "local") => {
  const rawPageUrl = browserView?.webContents?.getURL() || "";
  const pageUrl = canonicalMoviePageUrl(rawPageUrl) || rawPageUrl;
  if (!/\/movie\//i.test(pageUrl)) {
    return { ok: false, error: "Open a movie page first, then add it to the queue." };
  }

  const result = downloadQueue.add(pageUrl, { destination, title: titleFromMovieUrl(pageUrl) });
  if (result.ok) {
    queueDebug("queue-add", `Added "${result.item.title}"`, {
      movieUrl: result.item.movieUrl,
      movieId: extractMovieIdFromUrl(result.item.movieUrl),
      destination
    });
    notifyQueueUpdate();
  }
  return result;
});

ipcMain.handle("add-search-results-to-queue", async (_event, destination = "local", movies = null) => {
  let list = Array.isArray(movies) ? movies : null;
  if (!list?.length) {
    const scrape = await scrapeSearchMovieLinks(browserView?.webContents);
    if (!scrape.ok || !scrape.movies?.length) {
      return {
        ok: false,
        error: scrape.error || "No titles found. Search the catalog first."
      };
    }
    list = scrape.movies;
  }

  const movieEntries = list.filter(
    (entry) => entry?.kind !== "tv" && /\/movie\//i.test(String(entry?.movieUrl || entry || ""))
  );
  if (!movieEntries.length) {
    return {
      ok: false,
      error: "No movies in these results to queue. Open a TV show to scan its episodes instead."
    };
  }

  const result = downloadQueue.addMany(movieEntries, destination);
  queueDebug("queue-add-many", `Added ${result.added?.length || 0} movies from search`, {
    found: list.length,
    movieCandidates: movieEntries.length,
    added: result.added?.map((item) => ({
      title: item.title,
      movieUrl: item.movieUrl,
      movieId: extractMovieIdFromUrl(item.movieUrl)
    })),
    skipped: result.skipped
  });
  notifyQueueUpdate();
  return { ok: true, ...result, found: list.length };
});

ipcMain.handle("remove-from-queue", (_event, id) => {
  const result = downloadQueue.remove(String(id || ""));
  if (result.ok) notifyQueueUpdate();
  return result;
});

ipcMain.handle("clear-download-queue", () => {
  const result = downloadQueue.clear();
  if (result.ok) notifyQueueUpdate();
  return result;
});

ipcMain.handle("start-download-queue", async (_event, destination = "local") => {
  if (queueProcessing) {
    return { ok: false, error: "Queue is already running." };
  }
  if (tvShowProcessing) {
    return { ok: false, error: "Stop the TV download before starting the queue." };
  }

  if (!downloadQueue.hasWork()) {
    return { ok: false, error: "Queue is empty. Add movies or TV episodes first." };
  }

  downloadQueue.reviveFailed();
  downloadQueue.setPendingDestination("nas");
  notifyQueueUpdate();

  runDownloadQueue().catch((error) => {
    streamDebug.log("queue", "Queue run failed", { error: error.message || String(error) });
    notifyQueueUpdate({ phase: "error", error: error.message || String(error) });
  });

  return { ok: true, started: true, destination: "nas" };
});

ipcMain.handle("stop-download-queue", async () => {
  downloadQueue.requestCancel();
  await ffmpegRunner.stop();
  notifyQueueUpdate({ phase: "stopping" });
  return { ok: true };
});

async function applyTvShowScan(scan, pageUrl = "") {
  if (!scan?.ok) {
    return {
      ok: false,
      error:
        scan?.error ||
        (isAniwaveHost(pageUrl) || isAniwaveUrl(pageUrl)
          ? "Could not find episodes on this Aniwave page. Open a watch URL like /watch/show-name/ep-1, then scan again."
          : "Could not find episodes for this season. Open a specific season page with its episode list visible, then scan again.")
    };
  }

  const aniwaveScan =
    isAniwaveHost(pageUrl) ||
    isAniwaveUrl(pageUrl) ||
    isAniwaveUrl(scan.showUrl) ||
    (scan.episodes || []).some((episode) => isAniwaveUrl(episode.url));
  const baseSlug = showBaseSlugFromUrl(pageUrl) || showBaseSlugFromUrl(scan.showUrl);
  const episodes = (scan.episodes || []).filter((episode) => {
    if (!episode?.url) return false;
    if (aniwaveScan) return true;
    if (!baseSlug) return true;
    const episodeSlug = showBaseSlugFromUrl(episode.url);
    return !episodeSlug || episodeSlug.toLowerCase() === baseSlug.toLowerCase();
  });

  if (!episodes.length) {
    return {
      ok: false,
      error:
        "Could not find episodes that match this show. Open the season page and scan again once the episode list is visible."
    };
  }

  tvShowPlan = {
    showTitle: scan.showTitle,
    season: scan.season || episodes[0]?.season || 1,
    showUrl: scan.showUrl || pageUrl,
    posterUrl: scan.posterUrl || null,
    episodes,
    scannedAt: Date.now(),
    notes: scan.notes || []
  };
  notifyTvShowUpdate({ phase: "scanned" });
  queueDebug("tv-scan", `Scanned ${scan.showTitle} season ${tvShowPlan.season}`, {
    episodeCount: episodes.length,
    season: tvShowPlan.season,
    showUrl: tvShowPlan.showUrl,
    showSlug: baseSlug
  });

  return { ok: true, plan: tvShowPlan };
}

async function withTimeout(promise, timeoutMs, label = "Operation") {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`)),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadTvShowPageHidden(url, options = {}) {
  const contents = browserView?.webContents;
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  const targetUrl = canonicalContentUrl(url) || String(url || "").trim();
  if (!targetUrl) {
    return { ok: false, error: "Missing TV show URL." };
  }

  if (isCatalogMode()) {
    catalogBrowserLocked = true;
    hideBrowserView();
  }

  const timeoutMs = Number(options.timeoutMs) || 90_000;
  const light = Boolean(options.light);

  try {
    if (light) {
      await loadUrlAndWait(contents, targetUrl, {
        timeoutMs,
        settleMs: Number(options.settleMs) || 900
      });
    } else {
      await loadContentPageForDownload(targetUrl, timeoutMs);
    }
    return { ok: true, url: contents.getURL() || targetUrl };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  } finally {
    if (isCatalogMode() && catalogBrowserLocked) {
      hideBrowserView();
    }
  }
}

async function discoverTvSeasonsFromUrl(url) {
  const prepared = await prepareTvShowFromUrl(url, null, { scanEpisodes: false });
  if (!prepared.ok) return prepared;
  return {
    ok: true,
    showTitle: prepared.showTitle,
    showUrl: prepared.showUrl,
    posterUrl: prepared.posterUrl,
    seasons: prepared.seasons,
    seasonCount: prepared.seasons?.length || 0,
    showSlug: prepared.showSlug,
    source: prepared.source
  };
}

function mergeSeasonLists(urlSeasons = [], scraped = [], pageSlug = null) {
  const byNumber = new Map();
  for (const season of urlSeasons) {
    if (!season?.number) continue;
    byNumber.set(season.number, {
      number: season.number,
      label: season.label || `Season ${season.number}`,
      url: season.url || null
    });
  }

  for (const season of scraped) {
    if (!season?.number) continue;
    if (season.url && pageSlug) {
      const seasonSlug = showBaseSlugFromUrl(season.url);
      if (seasonSlug && seasonSlug.toLowerCase() !== pageSlug.toLowerCase()) continue;
    }
    const existing = byNumber.get(season.number);
    byNumber.set(season.number, {
      number: season.number,
      label: season.label || existing?.label || `Season ${season.number}`,
      url: season.url || existing?.url || null
    });
  }

  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

async function prepareTvShowFromUrl(url, season = null, options = {}) {
  const scanEpisodes = options.scanEpisodes !== false;
  const targetUrl = canonicalContentUrl(url) || String(url || "").trim();
  if (!targetUrl) return { ok: false, error: "Missing TV show URL." };

  const hubUrl = toSeasonHubUrl(targetUrl) || targetUrl;
  const urlSeasons = buildSeasonListFromUrl(targetUrl);
  const baseSlug = showBaseSlugFromUrl(targetUrl);
  const urlSeasonNumber = seasonNumberFromUrl(targetUrl);

  const loaded = await loadTvShowPageHidden(hubUrl, {
    light: true,
    timeoutMs: Number(options.timeoutMs) || 45_000,
    settleMs: Number(options.settleMs) || 1200
  });
  if (!loaded.ok) return loaded;

  const contents = browserView?.webContents;
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  let pageUrl = contents.getURL() || loaded.url;
  let discovery = { ok: false, seasons: [] };

  try {
    discovery = await withTimeout(discoverTvSeasonsFromPage(contents), 8_000, "Season discovery");
  } catch (error) {
    queueDebug("tv-seasons-fail", error.message || String(error), { url: targetUrl });
  }

  const pageSlug = showBaseSlugFromUrl(pageUrl) || baseSlug;
  let seasons = mergeSeasonLists(urlSeasons, discovery.seasons || [], pageSlug);

  if (!seasons.length) {
    const fallbackSeason = urlSeasonNumber || 1;
    seasons = [
      {
        number: fallbackSeason,
        label: `Season ${fallbackSeason}`,
        url: toSeasonHubUrl(pageUrl) || pageUrl
      }
    ];
  }

  const requestedSeason =
    Number.isFinite(Number(season)) && Number(season) > 0
      ? Number(season)
      : urlSeasonNumber || seasons[0]?.number || 1;

  const navigateToSeason = async (target) => {
    if (!target) return false;
    const dest = isWatchingEpisodeUrl(target) ? toSeasonHubUrl(target) || target : target;
    if (dest.replace(/\/$/, "") === String(pageUrl || "").replace(/\/$/, "")) return false;
    await loadUrlAndWait(contents, dest, { timeoutMs: 45_000, settleMs: 1200 });
    pageUrl = contents.getURL() || dest;
    return true;
  };

  const pageInfo = parseTornadoSeriesUrl(pageUrl);
  if (pageInfo?.season !== requestedSeason) {
    const seasonEntry = seasons.find((item) => item.number === requestedSeason);
    if (seasonEntry?.url) {
      try {
        await navigateToSeason(seasonEntry.url);
      } catch (error) {
        return {
          ok: false,
          error: error.message || String(error),
          seasons,
          season: requestedSeason,
          showSlug: pageSlug
        };
      }
    } else if (scanEpisodes) {
      // Ask the page scraper for a real season URL before giving up.
      let probe = await scrapeTvShowFromPage(contents, {
        season: requestedSeason,
        skipSelect: false
      });
      if (probe?.needsNavigation && probe.navigateTo) {
        try {
          await navigateToSeason(probe.navigateTo);
          const matched = seasons.find((item) => item.number === requestedSeason);
          if (matched) matched.url = toSeasonHubUrl(probe.navigateTo) || probe.navigateTo;
        } catch (error) {
          return {
            ok: false,
            error: error.message || String(error),
            seasons,
            season: requestedSeason,
            showSlug: pageSlug
          };
        }
      }
    }
  }

  if (!scanEpisodes) {
    queueDebug("tv-seasons-page", "Prepared season list", {
      url: pageUrl,
      seasonCount: seasons.length,
      withUrls: seasons.filter((item) => item.url).length,
      showSlug: pageSlug
    });
    return {
      ok: true,
      showTitle: discovery.showTitle || null,
      showUrl: discovery.showUrl || pageUrl,
      posterUrl: discovery.posterUrl || null,
      seasons,
      season: requestedSeason,
      showSlug: pageSlug,
      source: discovery.ok ? "page" : "url"
    };
  }

  let scan = await scrapeTvShowFromPage(contents, {
    season: requestedSeason,
    skipSelect: true
  });

  if (scan?.needsNavigation && scan.navigateTo) {
    try {
      await navigateToSeason(scan.navigateTo);
      scan = await scrapeTvShowFromPage(contents, {
        season: requestedSeason,
        skipSelect: true
      });
    } catch (error) {
      return {
        ok: false,
        error: error.message || String(error),
        seasons,
        season: requestedSeason,
        showSlug: pageSlug
      };
    }
  }

  const applied = await applyTvShowScan(scan, contents.getURL() || pageUrl);
  if (!applied.ok) {
    return {
      ...applied,
      seasons,
      season: requestedSeason,
      showSlug: pageSlug,
      showTitle: discovery.showTitle || scan?.showTitle || null,
      showUrl: pageUrl,
      posterUrl: discovery.posterUrl || scan?.posterUrl || null
    };
  }

  queueDebug("tv-prepare", `Prepared ${applied.plan.showTitle} season ${applied.plan.season}`, {
    seasonCount: seasons.length,
    episodeCount: applied.plan.episodes?.length || 0,
    season: applied.plan.season,
    showSlug: pageSlug
  });

  return {
    ok: true,
    showTitle: applied.plan.showTitle,
    showUrl: applied.plan.showUrl,
    posterUrl: applied.plan.posterUrl || discovery.posterUrl || null,
    seasons,
    season: applied.plan.season,
    showSlug: pageSlug,
    plan: applied.plan,
    source: "prepare"
  };
}

async function scanTvShowFromUrl(url, season) {
  const prepared = await prepareTvShowFromUrl(url, season, { scanEpisodes: true });
  if (!prepared.ok) return prepared;
  return { ok: true, plan: prepared.plan, seasons: prepared.seasons };
}

ipcMain.handle("discover-tv-seasons", async (_event, url) => {
  if (!url || typeof url !== "string") {
    return { ok: false, error: "Missing TV show URL." };
  }
  return discoverTvSeasonsFromUrl(url);
});

ipcMain.handle("prepare-tv-show", async (_event, payload = {}) => {
  const url = typeof payload === "string" ? payload : payload?.url;
  const season =
    typeof payload === "object" && payload?.season != null ? Number(payload.season) : null;
  if (!url || typeof url !== "string") {
    return { ok: false, error: "Missing TV show URL." };
  }
  return prepareTvShowFromUrl(url, season, { scanEpisodes: true });
});

ipcMain.handle("scan-tv-show", async (_event, payload) => {
  const url = typeof payload === "string" ? payload : payload?.url;
  const season =
    typeof payload === "object" && payload?.season != null ? Number(payload.season) : undefined;

  if (url && typeof url === "string") {
    return scanTvShowFromUrl(url, season);
  }

  const contents = browserView?.webContents;
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  if (appProfile.hideMovieDownloader) {
    catalogBrowserLocked = false;
    ensureBrowserVisible();
    const currentUrl = contents.getURL() || "";
    if (!currentUrl || currentUrl === "about:blank") {
      return {
        ok: false,
        error: "Search or browse Aniwave, open a series page, then scan."
      };
    }
    await delay(900);
  }

  let scan = await scrapeTvShowFromPage(contents, { season, skipSelect: false });
  if (scan?.needsNavigation && scan.navigateTo) {
    try {
      const dest = isWatchingEpisodeUrl(scan.navigateTo)
        ? toSeasonHubUrl(scan.navigateTo) || scan.navigateTo
        : scan.navigateTo;
      await loadUrlAndWait(contents, dest, { timeoutMs: 45_000, settleMs: 1200 });
      scan = await scrapeTvShowFromPage(contents, {
        season: season || scan.season,
        skipSelect: true
      });
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  }
  return applyTvShowScan(scan, contents.getURL() || "");
});

ipcMain.handle("add-tv-plan-to-queue", (_event, destination = "local") => {
  if (!tvShowPlan?.episodes?.length) {
    return { ok: false, error: "Scan a TV show season first." };
  }
  if (queueProcessing) {
    return { ok: false, error: "Stop the queue before adding more episodes." };
  }

  const result = downloadQueue.addEpisodes(tvShowPlan.episodes, {
    showTitle: tvShowPlan.showTitle,
    posterUrl: tvShowPlan.posterUrl || null,
    destination: "nas"
  });

  queueDebug("queue-add-season", `Queued ${result.added.length} episode(s) from ${tvShowPlan.showTitle}`, {
    showTitle: tvShowPlan.showTitle,
    season: tvShowPlan.season,
    added: result.added.length,
    skipped: result.skipped.length,
    destination: "nas"
  });
  notifyQueueUpdate();
  return {
    ok: true,
    added: result.added,
    skipped: result.skipped,
    plan: tvShowPlan
  };
});

function titleFromAniwaveSlug(slug) {
  return String(slug || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || "Anime";
}

ipcMain.handle("add-current-episode-to-queue", (_event, destination = "local") => {
  if (queueProcessing) {
    return { ok: false, error: "Stop the queue before adding more episodes." };
  }
  const contents = browserView?.webContents;
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  const pageUrl = contents.getURL() || "";
  if (!isAniwaveUrl(pageUrl)) {
    return {
      ok: false,
      error: "Open an Aniwave episode page first (/watch/show-name/ep-1), then add it to the queue."
    };
  }

  const parsed = (() => {
    try {
      const url = new URL(pageUrl);
      const match = url.pathname.match(/\/watch\/([^/]+)(?:\/ep-(\d+))?/i);
      if (!match) return null;
      const slug = match[1];
      const episode = match[2] ? Number.parseInt(match[2], 10) : 1;
      return {
        slug,
        episode,
        episodeUrl: match[2] ? pageUrl : `${url.origin}/watch/${slug}/ep-1`,
        showTitle: titleFromAniwaveSlug(slug)
      };
    } catch {
      return null;
    }
  })();

  if (!parsed) {
    return { ok: false, error: "Could not read the current episode URL." };
  }

  const result = downloadQueue.addEpisode(
    {
      url: parsed.episodeUrl,
      season: 1,
      episode: parsed.episode,
      title: `Episode ${parsed.episode}`
    },
    {
      showTitle: parsed.showTitle,
      destination: "nas"
    }
  );
  if (!result.ok) return result;

  queueDebug("queue-add-episode", `Queued ${result.item.title}`, {
    url: parsed.episodeUrl,
    episode: parsed.episode
  });
  notifyQueueUpdate();
  return { ok: true, item: result.item };
});

ipcMain.handle("get-tv-show-plan", () => ({
  ok: true,
  processing: tvShowProcessing,
  plan: tvShowPlan
}));

ipcMain.handle("clear-tv-show-plan", () => {
  if (tvShowProcessing) {
    return { ok: false, error: "Stop the TV download before clearing the plan." };
  }
  tvShowPlan = null;
  notifyTvShowUpdate({ phase: "cleared" });
  return { ok: true };
});

ipcMain.handle("start-tv-show-download", async (_event, destination = "local") => {
  if (queueProcessing) {
    return { ok: false, error: "Stop the download queue before starting a direct TV download." };
  }
  if (ffmpegRunner.isJobRunning()) {
    return { ok: false, error: "A download is already running." };
  }

  runTvShowDownloadJob("nas").catch((error) => {
    streamDebug.log("tv-show", "TV show download failed", { error: error.message || String(error) });
    notifyTvShowUpdate({ phase: "error", error: error.message || String(error) });
  });

  return { ok: true, started: true, destination: "nas" };
});

ipcMain.handle("stop-tv-show-download", async () => {
  tvShowCancelRequested = true;
  downloadQueue.requestCancel();
  await ffmpegRunner.stop();
  notifyTvShowUpdate({ phase: "stopping" });
  return { ok: true };
});

ipcMain.handle("open-nas-portal", async () => {
  const nas = loadNasConfig();
  await shell.openExternal(nas.portalUrl);
  return { ok: true, url: nas.portalUrl };
});

ipcMain.handle("get-nas-credentials", () => {
  const creds = loadNasCredentials();
  return {
    username: creds.username,
    hasPassword: Boolean(creds.password)
  };
});

ipcMain.handle("connect-nas", () => {
  const nas = loadNasConfig();
  return prepareNasAccess(nas.videoFolder);
});

ipcMain.handle("save-nas-credentials", (_event, payload) => {
  saveNasCredentials(payload || {});
  const nas = loadNasConfig();
  return prepareNasAccess(nas.videoFolder, loadNasCredentials());
});

ipcMain.handle("sync-movies-to-nas", async () => {
  if (librarySyncRunning) {
    return { ok: false, error: "A library sync is already running." };
  }

  const nas = loadNasConfig();
  librarySyncRunning = true;
  let syncAlive = true;

  try {
    const result = await syncLocalMoviesToNas(
      outputDirectory(),
      nas.videoFolder,
      (progress) => {
        if (!sendToRenderer("library-sync-progress", progress)) {
          syncAlive = false;
        }
      },
      { shouldContinue: () => syncAlive }
    );
    return result;
  } finally {
    librarySyncRunning = false;
  }
});

ipcMain.handle("embed-movie-poster", async (_event, filePath) => {
  const videoPath = String(filePath || "");
  if (!videoPath) {
    return { ok: false, error: "No movie file selected." };
  }

  const posterPath = findPosterForVideo(videoPath);
  if (!posterPath) {
    return { ok: false, error: "No poster image found next to this movie." };
  }

  const ffmpegPath = findFfmpeg();
  if (!ffmpegPath) {
    return { ok: false, error: "ffmpeg was not found." };
  }

  const result = await embedPosterInVideoAsync(ffmpegPath, videoPath, posterPath, {
    removePosterAfterEmbed: false
  });

  if (!result.ok) {
    return { ok: false, error: result.error || "Could not embed poster." };
  }

  return { ok: true, outputPath: videoPath };
});

ipcMain.handle("download-status", () => ffmpegRunner.getStatus());

ipcMain.handle("clear-download-job", () => {
  ffmpegRunner.clearJob();
  return { ok: true };
});

ipcMain.handle("set-progress-dock-height", (_event, height) => {
  const next = Number(height);
  progressDockHeight =
    Number.isFinite(next) && next >= PROGRESS_BAR_HEIGHT
      ? Math.round(next)
      : PROGRESS_BAR_HEIGHT;
  layoutBrowserView();
  return { ok: true, height: progressDockHeight };
});

ipcMain.handle("set-chrome-layout", (_event, layout) => {
  if (layout?.top != null) {
    const nextTop = Math.round(Number(layout.top));
    if (Number.isFinite(nextTop) && nextTop >= 48) chromeTop = nextTop;
  }
  if (layout?.right != null) {
    const nextRight = Math.round(Number(layout.right));
    if (Number.isFinite(nextRight) && nextRight >= 0) chromeRight = nextRight;
  }
  if (layout?.bottom != null) {
    const nextBottom = Math.round(Number(layout.bottom));
    if (Number.isFinite(nextBottom) && nextBottom >= CHROME_MARGIN) chromeBottom = nextBottom;
  }
  layoutBrowserView();
  return { ok: true, top: chromeTop, right: chromeRight, bottom: chromeBottom };
});

ipcMain.handle("stop-download", async () => ffmpegRunner.stop());

ipcMain.handle("open-output-folder", () => {
  const access = nasOutputAccess();
  if (access.ok) shell.openPath(access.path);
  return { ok: access.ok, error: access.error };
});

function normalizeTitleKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function showNeedsOfficialPoster(show) {
  if (!show?.folderPath) return false;
  const existing = findShowPoster(show.folderPath);
  if (!existing) return true;
  try {
    // Frame-grab thumbnails from the old approach were typically very small.
    return fs.statSync(existing).size < 40 * 1024;
  } catch {
    return true;
  }
}

function artworkFetchHeaders() {
  return [
    { name: "Referer", value: `${SITE_BASE_URL}/` },
    { name: "User-Agent", CHROME_USER_AGENT }
  ];
}

function movieNeedsPoster(movie) {
  if (!movie?.filePath || movie.kind === "tv-show") return false;
  const existing = findPosterForVideo(movie.filePath);
  if (!existing) return true;
  try {
    return fs.statSync(existing).size < 8 * 1024;
  } catch {
    return true;
  }
}

function pickCatalogMatch(results, title, kind) {
  const want = normalizeTitleKey(title);
  if (!want || !Array.isArray(results)) return null;

  const matchesKind = (item) => {
    if (kind === "tv") {
      return item.kind === "tv" || /\/(?:tv-series|tv|serie|series)\//i.test(item.movieUrl || "");
    }
    return item.kind === "movie" || /\/movie\//i.test(item.movieUrl || "");
  };

  return (
    results.find((item) => matchesKind(item) && normalizeTitleKey(item.title) === want && item.posterUrl) ||
    results.find((item) => matchesKind(item) && normalizeTitleKey(item.title) === want) ||
    results.find(
      (item) =>
        matchesKind(item) &&
        item.posterUrl &&
        (normalizeTitleKey(item.title).includes(want) || want.includes(normalizeTitleKey(item.title)))
    ) ||
    results.find((item) => item.posterUrl && normalizeTitleKey(item.title).includes(want))
  );
}

async function resolveTornadoPosterUrl(match) {
  if (match?.posterUrl) return match.posterUrl;
  if (!match?.movieUrl || queueProcessing || tvShowProcessing) return null;

  try {
    if (match.kind === "tv" || /\/(?:tv-series|tv|serie|series)\//i.test(match.movieUrl)) {
      await loadContentPageForDownload(match.movieUrl, 25_000);
    } else {
      await loadMoviePageForQueue(match.movieUrl, 25_000);
    }
    return await extractArtworkUrl(browserView?.webContents);
  } catch {
    return null;
  }
}

async function backfillOfficialLibraryPosters(library) {
  if (queueProcessing || tvShowProcessing) return library;

  const movies = [...(library?.local?.movies || []), ...(library?.nas?.movies || [])].filter(movieNeedsPoster);
  const shows = [...(library?.local?.movies || []), ...(library?.nas?.movies || [])].filter(
    (entry) => entry?.kind === "tv-show" && showNeedsOfficialPoster(entry)
  );
  const jobs = [
    ...movies.slice(0, 3).map((entry) => ({ entry, kind: "movie" })),
    ...shows.slice(0, 2).map((entry) => ({ entry, kind: "tv" }))
  ].slice(0, 3);

  if (!jobs.length) return library;

  const headers = artworkFetchHeaders();

  for (const job of jobs) {
    if (queueProcessing || tvShowProcessing) break;
    try {
      const search = await catalogSearch(job.entry.title);
      if (!search.ok || !search.movies?.length) continue;

      const match = pickCatalogMatch(search.movies, job.entry.title, job.kind);
      const posterUrl = await resolveTornadoPosterUrl(match);
      if (!posterUrl) continue;

      if (job.kind === "tv") {
        const saved = await saveShowPoster(posterUrl, headers, job.entry.folderPath, { force: true });
        if (saved) job.entry.posterUrl = posterUrlForPath(saved);
      } else {
        const saved = await saveArtworkFromUrl(posterUrl, job.entry.filePath, headers);
        if (saved) job.entry.posterUrl = posterUrlForPath(saved);
      }
      await delay(800);
    } catch {
      // Keep going through remaining titles.
    }
  }

  return library;
}

ipcMain.handle("get-downloaded-movies", async (_event, options = {}) => {
  const nas = loadNasConfig();
  prepareNasAccess(nas.videoFolder);
  const library = listDownloadedMovies({
    localDir: outputDirectory(),
    nasDir: nas.videoFolder
  });
  if (options?.backfillPosters) {
    try {
      await backfillOfficialLibraryPosters(library);
    } catch {
      // Library listing should still succeed without poster backfill.
    }
  }
  return library;
});

ipcMain.handle("open-downloaded-movie", async (_event, filePath) => {
  if (!filePath || typeof filePath !== "string") {
    return { ok: false, error: "Invalid file path." };
  }

  const result = await shell.openPath(filePath);
  if (result) {
    return { ok: false, error: result };
  }

  return { ok: true };
});

ipcMain.handle("reveal-downloaded-movie", (_event, filePath) => {
  if (!filePath || typeof filePath !== "string") {
    return { ok: false, error: "Invalid file path." };
  }

  shell.showItemInFolder(filePath);
  return { ok: true };
});

ipcMain.handle("open-library-folder", (_event, location) => {
  const nas = loadNasConfig();
  const folderPath = nas.videoFolder;
  if (folderPath) shell.openPath(folderPath);
  return { ok: true, path: folderPath };
});

ipcMain.handle("show-output-folder", async () => {
  const nas = loadNasConfig();
  await dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "NAS videos folder",
    message: "Downloads are saved on the NAS here:",
    detail: nas.videoFolder || "No NAS folder is set. Open Settings and choose NAS videos."
  });
  return { ok: true };
});

app.whenReady().then(async () => {
  cleanupStaleDownloadArtifacts(outputDirectory());
  const nas = loadNasConfig();
  cleanupStaleDownloadArtifacts(nas.videoFolder);
  restoreDownloadQueue();
  await createWindow();

  app.on("child-process-gone", (_event, details) => {
    streamDebug.log("crash", "Child process gone", details);
  });

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("before-quit", () => {
  persistDownloadQueue();
});

app.on("window-all-closed", () => {
  persistDownloadQueue();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.on("uncaughtException", (error) => {
  persistDownloadQueue();
  console.error("Uncaught exception", error);
});

process.on("unhandledRejection", (error) => {
  persistDownloadQueue();
  console.error("Unhandled rejection", error);
});
