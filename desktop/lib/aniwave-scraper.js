const ANIWAVE_HOST_PATTERN = /(?:^|\.)aniwaves\.ru$/i;
const ANIWAVE_WATCH_PATTERN = /\/watch\/[^/]+(?:\/ep-\d+)?/i;

const SERVER_PRIORITY = ["Vidplay", "BYFMS", "DGHG", "MyCloud", "MegaCloud", "Mp4Upload"];

function isAniwaveUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return ANIWAVE_HOST_PATTERN.test(parsed.hostname) && ANIWAVE_WATCH_PATTERN.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isAniwaveHost(url) {
  try {
    return ANIWAVE_HOST_PATTERN.test(new URL(String(url || "")).hostname);
  } catch {
    return false;
  }
}

function buildAniwaveTvShowScraperScript() {
  return `
(() => {
  if (window.__aniwaveTvShowScraperInstalled) return;
  window.__aniwaveTvShowScraperInstalled = true;

  const normalize = (url) => {
    try {
      const parsed = new URL(url, window.location.href);
      parsed.hash = "";
      return parsed.toString().replace(/\\/$/, "");
    } catch {
      return "";
    }
  };

  const parseShowSlug = (pathname) => {
    const match = String(pathname || "").match(/\\/watch\\/([^/]+)/i);
    return match?.[1] || null;
  };

  const parseEpisodeNumber = (href, text) => {
    const fromHref = String(href || "").match(/\\/ep-(\\d+)/i);
    if (fromHref?.[1]) return Number.parseInt(fromHref[1], 10) || 0;
    const trimmed = String(text || "").trim();
    if (/^\\d{1,4}$/.test(trimmed)) return Number.parseInt(trimmed, 10) || 0;
    const fromText = trimmed.match(/episode\\s*(\\d+)/i);
    if (fromText?.[1]) return Number.parseInt(fromText[1], 10) || 0;
    return 0;
  };

  const parseShowTitle = () => {
    const heading =
      document.querySelector("h1")?.textContent?.trim() ||
      document.title.replace(/\\s*[-|].*$/, "").trim() ||
      "Anime Series";
    const cleaned = heading
      .replace(/\\s+Episode\\s+\\d+.*$/i, "")
      .replace(/\\s*[-–]\\s*Episode\\s+\\d+.*$/i, "")
      .trim();
    return cleaned || heading;
  };

  const parseEpisodeTotal = () => {
    const text = document.body?.innerText || "";
    const patterns = [
      /Episodes:\\s*(\\d+)\\s*\\/\\s*(\\d+)/i,
      /Episodes:\\s*(\\d+)/i,
      /(\\d+)\\s+Episodes/i,
      /EPS:\\s*(\\d+)/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const total = Number.parseInt(match[2] || match[1], 10) || 0;
        if (total > 0 && total < 5000) return total;
      }
    }
    return 0;
  };

  const collectEpisodeLinks = (showSlug, origin) => {
    const found = new Map();
    const selectors = [
      "a[href*='/ep-']",
      "a[href*='/watch/']",
      ".episodes a",
      ".episodes button",
      ".ep-list a",
      ".ep-item",
      ".ssl-item",
      "#episodes-content a",
      "#episodes a",
      ".range-wrap a",
      ".ep-range a",
      "[class*='episode'] a",
      "[class*='ep-list'] a",
      "[data-number]",
      "[data-ep]",
      "[data-id].ssl-item",
      "ul.episodes li a",
      "div.episodes a"
    ];

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const href = normalize(element.getAttribute("href") || element.dataset?.href || "");
        const text = String(element.textContent || element.getAttribute("data-number") || "").trim();
        const episode = parseEpisodeNumber(href, text);
        if (!episode) continue;

        let url = href;
        if (!url || !url.includes("/ep-")) {
          url = origin + "/watch/" + showSlug + "/ep-" + episode;
        } else if (url.startsWith("/")) {
          url = origin + url;
        }

        if (!url.includes("/watch/" + showSlug + "/")) continue;

        if (!found.has(episode)) {
          found.set(episode, {
            url: normalize(url),
            title: text && !/^\\d+$/.test(text) ? text : "Episode " + episode,
            season: 1,
            episode
          });
        }
      }
    }

    return [...found.values()].sort((a, b) => a.episode - b.episode);
  };

  const buildEpisodeListFromTotal = (showSlug, origin, total) => {
    const episodes = [];
    for (let episode = 1; episode <= total; episode += 1) {
      episodes.push({
        url: normalize(origin + "/watch/" + showSlug + "/ep-" + episode),
        title: "Episode " + episode,
        season: 1,
        episode
      });
    }
    return episodes;
  };

  window.__aniwaveScanTvShow = async () => {
    const pageUrl = normalize(window.location.href);
    const pathname = window.location.pathname || "";
    const showSlug = parseShowSlug(pathname);
    if (!showSlug) {
      return { ok: false, error: "Open an Aniwave watch page first (e.g. /watch/show-name/ep-1)." };
    }

    const showTitle = parseShowTitle();
    const origin = window.location.origin;
    const linkedEpisodes = collectEpisodeLinks(showSlug, origin);
    const totalEpisodes = parseEpisodeTotal();
    const currentEp = parseEpisodeNumber(pathname, "");
    let episodes =
      linkedEpisodes.length >= 2
        ? linkedEpisodes
        : totalEpisodes > 0
          ? buildEpisodeListFromTotal(showSlug, origin, totalEpisodes)
          : linkedEpisodes;

    if (!episodes.length && currentEp) {
      episodes = [{
        url: pageUrl,
        title: "Episode " + currentEp,
        season: 1,
        episode: currentEp
      }];
    }

    if (!episodes.length) {
      episodes = [{
        url: normalize(origin + "/watch/" + showSlug + "/ep-1"),
        title: "Episode 1",
        season: 1,
        episode: 1
      }];
    }

    return {
      ok: episodes.length > 0,
      isShowPage: true,
      showTitle,
      season: 1,
      showUrl: normalize(origin + "/watch/" + showSlug),
      episodeCount: episodes.length,
      episodes,
      notes: [
        "Scanned Aniwave series from " + (linkedEpisodes.length ? "episode list" : "episode count") + ".",
        "Downloads prefer English dub servers when available."
      ],
      pathname,
      title: document.title || ""
    };
  };
})();
`;
}

function buildAniwaveWaitForServersScript() {
  return `
(() => {
  if (window.__aniwaveWaitForServers) return;
  window.__aniwaveWaitForServers = (timeoutMs = 30000) =>
    new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const servers = document.querySelectorAll(
          "#w-servers .servers .type li[data-sv-id], .servers .type li[data-sv-id]"
        );
        if (servers.length > 0) {
          resolve({
            ok: true,
            serverCount: servers.length,
            waitedMs: Date.now() - start
          });
          return;
        }

        if (Date.now() - start >= timeoutMs) {
          const wServers = document.querySelector("#w-servers");
          resolve({
            ok: false,
            waitedMs: Date.now() - start,
            hasWServers: Boolean(wServers),
            wServersHtml: (wServers?.innerHTML || "").slice(0, 400)
          });
          return;
        }

        setTimeout(check, 500);
      };
      check();
    });
})();
`;
}

function buildAniwavePlayerScript(options = {}) {
  const preferDub = options.preferDub !== false;
  const serverPriority = JSON.stringify(options.serverPriority || SERVER_PRIORITY);
  const clickServer = JSON.stringify(options.clickServer || null);
  const clickAudioType = JSON.stringify(options.clickAudioType || null);
  const clickSvId = JSON.stringify(options.clickSvId || null);

  return `
(() => {
  const SERVER_PRIORITY = ${serverPriority};
  const preferDub = ${preferDub ? "true" : "false"};
  const requestedServer = ${clickServer};
  const requestedAudioType = ${clickAudioType};
  const requestedSvId = ${clickSvId};

  const clickElement = (element) => {
    if (!element) return false;
    try {
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      element.click();
      return true;
    } catch {
      return false;
    }
  };

  const normalizeName = (text) => String(text || "").replace(/\\s+/g, " ").trim();

  const isServerName = (text) => {
    const name = normalizeName(text);
    if (!name || /^\\d{1,4}$/.test(name)) return false;
    if (/^(SUB|DUB|S-SUB|Expand|Light|Prev|Next|Report|Auto|Skip)$/i.test(name)) return false;
    return SERVER_PRIORITY.some((server) => server.toLowerCase() === name.toLowerCase()) ||
      /^(vidplay|byfms|dghg|mycloud|megacloud|mp4upload|streamwish|filemoon)$/i.test(name);
  };

  const playerArea = document.querySelector("#w-servers") || document.querySelector(".servers");

  const readAvailableServers = () => {
    const available = [];
    const seen = new Set();

    for (const typeBlock of document.querySelectorAll(".servers .type, #w-servers .type")) {
      const audioType = String(typeBlock.getAttribute("data-type") || "").toLowerCase();
      for (const li of typeBlock.querySelectorAll("li[data-sv-id]")) {
        const name = normalizeName(li.textContent);
        const svId = li.getAttribute("data-sv-id") || "";
        if (!svId) continue;
        const key = audioType + ":" + svId + ":" + name;
        if (seen.has(key)) continue;
        seen.add(key);
        available.push({
          name: isServerName(name) ? name : "Server " + svId,
          svId,
          audioType: audioType || "unknown",
          active: li.classList.contains("active")
        });
      }
    }

    return available;
  };

  const findServerLi = (audioType, serverName, svId) => {
    const block = document.querySelector('.servers .type[data-type="' + audioType + '"]');
    if (!block) return null;

    if (svId) {
      const byId = block.querySelector('li[data-sv-id="' + svId + '"]');
      if (byId) return byId;
    }

    if (serverName) {
      for (const li of block.querySelectorAll("li[data-sv-id]")) {
        const name = normalizeName(li.textContent);
        if (name.toLowerCase() === String(serverName).toLowerCase()) return li;
      }
    }

    return block.querySelector("li[data-sv-id]");
  };

  const clickServerChoice = (audioType, serverName, svId) => {
    const li = findServerLi(audioType, serverName, svId);
    const resolvedSvId = li?.getAttribute("data-sv-id") || svId || null;
    const resolvedName = normalizeName(li?.textContent || serverName || "");

    if (typeof window.clickServerByType === "function" && resolvedSvId) {
      window.clickServerByType(audioType, String(resolvedSvId));
      return {
        clicked: true,
        method: "clickServerByType",
        server: resolvedName || serverName,
        svId: String(resolvedSvId),
        audioType
      };
    }

    if (!li) return null;
    document.querySelectorAll(".servers .type li.active").forEach((node) => node.classList.remove("active"));
    li.classList.add("active");
    clickElement(li);
    return {
      clicked: true,
      method: "li-click",
      server: resolvedName || serverName,
      svId: String(resolvedSvId || ""),
      audioType
    };
  };

  const availableServers = readAvailableServers();

  const buildAttempts = () => {
    const attempts = [];
    const audioOrder = preferDub ? ["dub", "sub", "ssub"] : ["sub", "dub", "ssub"];

    for (const audioType of audioOrder) {
      for (const serverName of SERVER_PRIORITY) {
        const match = availableServers.find(
          (server) =>
            server.name.toLowerCase() === serverName.toLowerCase() &&
            (server.audioType === audioType || server.audioType === "unknown")
        );
        if (!match) continue;
        const key = audioType + ":" + match.svId + ":" + match.name;
        if (attempts.some((entry) => entry.key === key)) continue;
        attempts.push({
          key,
          server: match.name,
          svId: match.svId,
          audioType
        });
      }

      for (const server of availableServers.filter((entry) => entry.audioType === audioType)) {
        const key = audioType + ":" + server.svId + ":" + server.name;
        if (attempts.some((entry) => entry.key === key)) continue;
        attempts.push({
          key,
          server: server.name,
          svId: server.svId,
          audioType
        });
      }
    }

    return attempts;
  };

  const attempts = buildAttempts();
  let picked = null;

  if (requestedServer || requestedSvId) {
    picked = clickServerChoice(requestedAudioType || "dub", requestedServer, requestedSvId);
  }

  const iframe = document.querySelector(
    "#player iframe, #player-wrapper iframe, .player-frame iframe, iframe[src*='embed'], iframe[src*='vidplay'], iframe[src*='megacloud']"
  );
  const video = document.querySelector("#player video, video");

  return {
    ok: Boolean(picked?.clicked),
    audioType: picked?.audioType || null,
    server: picked?.server || null,
    svId: picked?.svId || null,
    method: picked?.method || null,
    hasPlayerArea: Boolean(playerArea),
    availableServers,
    attempts,
    hasIframe: Boolean(iframe),
    iframeSrc: iframe?.getAttribute("src") || null,
    hasVideo: Boolean(video),
    videoSrc: video?.currentSrc || video?.src || null
  };
})();
`;
}

function buildAniwaveServerAttempts(options = {}) {
  const preferDub = options.preferDub !== false;
  const serverPriority = options.serverPriority || SERVER_PRIORITY;
  const audioOrder = preferDub ? ["dub", "sub", "unknown"] : ["sub", "dub", "unknown"];
  const attempts = [];

  for (const audioType of audioOrder) {
    for (const serverName of serverPriority) {
      const key = audioType + ":" + serverName;
      if (attempts.some((entry) => entry.key === key)) continue;
      attempts.push({ key, server: serverName, audioType });
    }
  }

  return attempts;
}

function setupAniwaveScraper(contents) {
  if (!contents || contents.isDestroyed()) return;

  const inject = () => {
    contents.executeJavaScript(buildAniwaveTvShowScraperScript()).catch(() => {});
    contents.executeJavaScript(buildAniwaveWaitForServersScript()).catch(() => {});
  };

  contents.on("dom-ready", inject);
  contents.on("did-finish-load", inject);
}

async function scrapeAniwaveTvShowFromPage(contents) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  await contents.executeJavaScript(buildAniwaveTvShowScraperScript()).catch(() => {});

  try {
    let result = await contents.executeJavaScript("window.__aniwaveScanTvShow?.() || { ok: false }");
    if (!result?.ok || !result?.episodes?.length) {
      await new Promise((resolve) => setTimeout(resolve, 1600));
      result = await contents.executeJavaScript("window.__aniwaveScanTvShow?.() || { ok: false }");
    }
    return result;
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

async function waitForAniwaveServers(contents, timeoutMs = 30000) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  await contents.executeJavaScript(buildAniwaveWaitForServersScript()).catch(() => {});

  try {
    return await contents.executeJavaScript(`window.__aniwaveWaitForServers?.(${timeoutMs}) || { ok: false }`);
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

async function inspectAniwavePlayer(contents, options = {}) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  try {
    return await contents.executeJavaScript(buildAniwavePlayerScript({ ...options, clickServer: null }));
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

async function prepareAniwavePlayer(contents, options = {}) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, error: "Browser is not ready." };
  }

  try {
    return await contents.executeJavaScript(buildAniwavePlayerScript(options));
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

const EMBED_FRAME_PATTERN = /echovideo|vidplay|gn1r5n|myvidplay|megacloud|rabbitstream/i;

function buildEmbedStreamExtractScript() {
  return `(() => {
    const candidates = [];
    const video = document.querySelector("video");
    if (video?.currentSrc) candidates.push(video.currentSrc);
    if (video?.src) candidates.push(video.src);
    for (const source of document.querySelectorAll("video source[src]")) {
      candidates.push(source.getAttribute("src"));
    }
    if (window.hls?.url) candidates.push(window.hls.url);
    if (window._hls?.url) candidates.push(window._hls.url);
    if (window.player?.config?.sources?.[0]?.file) {
      candidates.push(window.player.config.sources[0].file);
    }
    if (window.jwplayer) {
      try {
        const item = window.jwplayer().getPlaylistItem();
        if (item?.file) candidates.push(item.file);
        if (item?.sources?.[0]?.file) candidates.push(item.sources[0].file);
      } catch {}
    }

    for (const candidate of candidates) {
      if (!candidate) continue;
      const lower = String(candidate).toLowerCase();
      if (/\\.m3u8|mpegurl/.test(lower)) {
        return { ok: true, url: candidate };
      }
    }

    return { ok: false };
  })()`;
}

async function extractEmbedStreamFromFrames(contents) {
  if (!contents || contents.isDestroyed()) {
    return null;
  }

  for (const frame of contents.mainFrame.framesInSubtree) {
    if (!frame || (typeof frame.isDestroyed === "function" && frame.isDestroyed())) continue;
    if (!EMBED_FRAME_PATTERN.test(frame.url || "")) continue;

    try {
      const result = await frame.executeJavaScript(buildEmbedStreamExtractScript());
      if (result?.ok && result.url) {
        return result.url;
      }
    } catch {
      // Restricted embed frame.
    }
  }

  return null;
}

module.exports = {
  ANIWAVE_HOST_PATTERN,
  ANIWAVE_WATCH_PATTERN,
  SERVER_PRIORITY,
  isAniwaveUrl,
  isAniwaveHost,
  buildAniwaveTvShowScraperScript,
  buildAniwavePlayerScript,
  buildAniwaveWaitForServersScript,
  buildAniwaveServerAttempts,
  setupAniwaveScraper,
  scrapeAniwaveTvShowFromPage,
  waitForAniwaveServers,
  inspectAniwavePlayer,
  prepareAniwavePlayer,
  extractEmbedStreamFromFrames
};
