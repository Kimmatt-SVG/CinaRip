const openAnimeWindowButton = document.getElementById("open-anime-window");
const brandTitle = document.getElementById("brand-title");
const landingTitle = document.getElementById("landing-title");
const landingLead = document.getElementById("landing-lead");
const envStatus = document.getElementById("env-status");
const downloadStatus = document.getElementById("download-status");
const streamStatus = document.getElementById("stream-status");
const downloadButton = document.getElementById("download");
const saveNasButton = document.getElementById("save-nas");
const stopButton = document.getElementById("stop-download");
const refreshButton = document.getElementById("refresh-detect");
const reloadSiteButton = document.getElementById("reload-site");
const backButton = document.getElementById("go-back");
const homeButton = document.getElementById("go-home");
const forwardButton = document.getElementById("go-forward");
const openFolderButton = document.getElementById("open-folder");
const syncToNasButton = document.getElementById("sync-to-nas");
const openSettingsButton = document.getElementById("open-settings");
const settingsPanel = document.getElementById("settings-panel");
const settingsForm = document.getElementById("settings-form");
const settingsBackdrop = document.getElementById("settings-backdrop");
const settingsCloseButton = document.getElementById("settings-close");
const settingsLocalFolderInput = document.getElementById("settings-local-folder");
const settingsNasFolderInput = document.getElementById("settings-nas-folder");
const settingsBrowseLocalButton = document.getElementById("settings-browse-local");
const settingsBrowseNasButton = document.getElementById("settings-browse-nas");
const settingsSaveFoldersButton = document.getElementById("settings-save-folders");
const settingsFolderError = document.getElementById("settings-folder-error");
const settingsLocalStorage = document.getElementById("settings-local-storage");
const settingsNasStorage = document.getElementById("settings-nas-storage");
const settingsSiteSection = document.getElementById("settings-site-section");
const nasUsernameInput = document.getElementById("nas-username");
const nasPasswordInput = document.getElementById("nas-password");
const nasConnectError = document.getElementById("nas-connect-error");
const nasConnectSave = document.getElementById("nas-connect-save");
const siteUsernameInput = document.getElementById("site-username");
const sitePasswordInput = document.getElementById("site-password");
const siteAutoLoginInput = document.getElementById("site-auto-login");
const siteConnectError = document.getElementById("site-connect-error");
const siteConnectSave = document.getElementById("site-connect-save");
const blockedPanel = document.getElementById("blocked-panel");
const blockedDetail = document.getElementById("blocked-detail");
const installStatus = document.getElementById("install-status");
const installWarpButton = document.getElementById("install-warp");
const retryLoadButton = document.getElementById("retry-load");
const warpDownloadLink = document.getElementById("warp-download-link");
const adblockStatus = document.getElementById("adblock-status");
const redirectStatus = document.getElementById("redirect-status");
const searchPanel = document.getElementById("search-panel");
const searchError = document.getElementById("search-error");
const browseHomeButton = document.getElementById("browse-home");
const catalogHome = document.getElementById("catalog-home");
const animeHero = document.getElementById("anime-hero");
const animeHeroTitle = document.getElementById("anime-hero-title");
const animeHeroLead = document.getElementById("anime-hero-lead");
const catalogLibrary = document.getElementById("catalog-library");
const catalogResults = document.getElementById("catalog-results");
const catalogDetail = document.getElementById("catalog-detail");
const catalogGrid = document.getElementById("catalog-grid");
const catalogResultsTitle = document.getElementById("catalog-results-title");
const catalogResultsSummary = document.getElementById("catalog-results-summary");
const catalogBackHome = document.getElementById("catalog-back-home");
const catalogBackLibraryHome = document.getElementById("catalog-back-library-home");
const catalogBackResults = document.getElementById("catalog-back-results");
const openLibraryButton = document.getElementById("open-library");

function setToolbarDisabled(button, disabled) {
  if (button) button.disabled = disabled;
}
const catalogQueueAll = document.getElementById("catalog-queue-all");
const catalogDetailPoster = document.getElementById("catalog-detail-poster");
const catalogDetailTitle = document.getElementById("catalog-detail-title");
const catalogDetailYear = document.getElementById("catalog-detail-year");
const catalogDetailStatus = document.getElementById("catalog-detail-status");
const catalogTvPanel = document.getElementById("catalog-tv-panel");
const catalogTvSeasonSelect = document.getElementById("catalog-tv-season-select");
const catalogTvEpisodeSelect = document.getElementById("catalog-tv-episode-select");
const catalogTvEpisodeSummary = document.getElementById("catalog-tv-episode-summary");
const catalogTvEpisodeList = document.getElementById("catalog-tv-episode-list");
const catalogDownloadLocal = document.getElementById("catalog-download-local");
const catalogDownloadNas = document.getElementById("catalog-download-nas");
const catalogAddQueue = document.getElementById("catalog-add-queue");
const catalogBrand = document.getElementById("catalog-brand");
const toolbarSearchForm = document.getElementById("toolbar-search-form");
const toolbarSearchInput = document.getElementById("toolbar-search-input");
const progressDock = document.getElementById("progress-dock");
const progressPhase = document.getElementById("progress-phase");
const progressPercent = document.getElementById("progress-percent");
const progressTrack = document.getElementById("progress-track");
const progressFill = document.getElementById("progress-fill");
const progressDetailLeft = document.getElementById("progress-detail-left");
const progressDetailRight = document.getElementById("progress-detail-right");
const librarySections = document.getElementById("library-sections");
const librarySummary = document.getElementById("library-summary");
const refreshLibraryButton = document.getElementById("refresh-library");
const streamDebugButton = document.getElementById("stream-debug");
const activityLog = document.getElementById("activity-log");
const activityLogClear = document.getElementById("activity-log-clear");
const activityLogCopy = document.getElementById("activity-log-copy");
const downloadQueueSummary = document.getElementById("download-queue-summary");
const downloadQueueList = document.getElementById("download-queue-list");
const addSearchToQueueButton = document.getElementById("add-search-to-queue");
const addCurrentToQueueButton = document.getElementById("add-current-to-queue");
const startDownloadQueueLocalButton = document.getElementById("start-download-queue-local");
const startDownloadQueueNasButton = document.getElementById("start-download-queue-nas");
const stopDownloadQueueButton = document.getElementById("stop-download-queue");
const clearDownloadQueueButton = document.getElementById("clear-download-queue");
const queueDebugCopyButton = document.getElementById("queue-debug-copy");
const searchFeatures = document.getElementById("search-features");
const tvShowLead = document.getElementById("tv-show-lead");
const tvShowTitle = document.getElementById("tv-show-title");
const downloadQueueSection = document.getElementById("download-queue-section");
const tvShowSection = document.getElementById("tv-show-section");
const tvShowSummary = document.getElementById("tv-show-summary");
const tvShowEpisodeList = document.getElementById("tv-show-episode-list");
const scanTvShowButton = document.getElementById("scan-tv-show");
const queueTvSeasonRow = document.getElementById("queue-tv-season-row");
const queueTvSeasonSelect = document.getElementById("queue-tv-season-select");
const addCurrentEpisodeButton = document.getElementById("add-current-episode");
const addTvToQueueButton = document.getElementById("add-tv-to-queue");
const clearTvShowPlanButton = document.getElementById("clear-tv-show-plan");
const browseSiteForTvButton = document.getElementById("browse-site-for-tv");
const backToCatalogButton = document.getElementById("back-to-catalog");

const PROGRESS_DOCK_HEIGHT = 88;
const MAX_LOG_ENTRIES = 120;

let progressHideTimer = null;
let chromeLayoutFrame = null;
let downloadActive = false;
let librarySyncActive = false;
let queueActive = false;
let tvShowActive = false;
let tvShowPlan = null;
let catalogTvSeasonOptions = [];
let catalogTvEpisodeOptions = [];
let catalogTvScanToken = 0;
let siteBrowseMode = false;
let hideMovieDownloader = false;
let catalogMode = false;
let catalogMovies = [];
let selectedCatalogMovie = null;
let catalogView = "home";
let animeView = "home";
let catalogHomeAnimated = false;
let siteLabel = "Tornado Movies";
let pendingNasRetry = null;
let lastLibraryRefreshAt = 0;
let activityLogEntries = [];
let loggedDownloadJobId = null;

function formatLogTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function appendActivityLog(level, message, detail = null) {
  const empty = activityLog.querySelector(".activity-log-empty");
  if (empty) empty.remove();

  const entry = document.createElement("article");
  entry.className = `log-entry ${level}`;

  const head = document.createElement("div");
  head.className = "log-entry-head";

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = formatLogTime();

  const levelLabel = document.createElement("span");
  levelLabel.className = "log-level";
  levelLabel.textContent = level;

  head.append(time, levelLabel);

  const body = document.createElement("div");
  body.className = "log-message";
  body.textContent = message;

  entry.append(head, body);

  if (detail) {
    const pre = document.createElement("pre");
    pre.className = "log-detail";
    pre.textContent = detail;
    entry.appendChild(pre);
  }

  activityLog.appendChild(entry);
  activityLog.scrollTop = activityLog.scrollHeight;

  activityLogEntries.push({ level, message, detail, time: time.textContent });
  if (activityLogEntries.length > MAX_LOG_ENTRIES) {
    activityLogEntries.shift();
    activityLog.firstElementChild?.remove();
  }
}

function clearActivityLog() {
  activityLogEntries = [];
  activityLog.replaceChildren();
  const empty = document.createElement("p");
  empty.className = "activity-log-empty";
  empty.textContent = "Download and stream events will appear here.";
  activityLog.appendChild(empty);
}

function getActivityLogText() {
  return activityLogEntries
    .map((entry) => {
      const lines = [`[${entry.time}] ${entry.level.toUpperCase()} ${entry.message}`];
      if (entry.detail) lines.push(entry.detail);
      return lines.join("\n");
    })
    .join("\n\n");
}

function showStreamDebugPanel(text) {
  const summary = text?.split("\n").find((line) => line.startsWith("Summary:")) || "Stream diagnosis";
  appendActivityLog("debug", summary.replace(/^Summary:\s*/, "") || "Stream diagnosis complete", text);
}

async function refreshStreamDebug() {
  appendActivityLog("info", "Running stream diagnosis...");
  try {
    const result = await window.streamApp.diagnoseStreams();
    if (!result.ok) {
      appendActivityLog("error", result.error || "Stream diagnosis failed.");
      return;
    }
    showStreamDebugPanel(result.text);
    if (result.report?.summary) {
      streamStatus.textContent = `Debug: ${result.report.summary}`;
    }
  } catch (error) {
    appendActivityLog("error", error.message || "Stream diagnosis failed.");
  }
}

function showSearchPanel() {
  searchPanel.hidden = false;
  if (catalogMode) {
    const keep =
      catalogView === "detail" || catalogView === "results" || catalogView === "library"
        ? catalogView
        : "home";
    showCatalogView(keep);
    streamStatus.textContent =
      catalogView === "home" ? "Search the catalog to begin." : streamStatus.textContent;
  } else if (hideMovieDownloader) {
    showAnimeHome();
  } else {
    streamStatus.textContent = "Search for a movie to begin.";
  }
  toolbarSearchInput?.focus();
}

function hideSearchPanel() {
  if (catalogMode) return;
  if (hideMovieDownloader) return;
  searchPanel.hidden = true;
  searchError.textContent = "";
}

function showAnimeHome(options = {}) {
  animeView = "home";
  siteBrowseMode = false;
  searchPanel.hidden = false;
  searchPanel.classList.add("catalog-mode", "anime-shell");
  searchPanel.classList.remove("site-browse-mode");
  if (catalogHome) catalogHome.hidden = false;
  if (catalogLibrary) catalogLibrary.hidden = true;
  if (catalogResults) catalogResults.hidden = true;
  if (catalogDetail) catalogDetail.hidden = true;
  if (animeHero) animeHero.hidden = true;
  if (browseSiteForTvButton) {
    browseSiteForTvButton.hidden = false;
    browseSiteForTvButton.textContent = `Browse ${siteLabel}`;
  }
  if (backToCatalogButton) {
    backToCatalogButton.hidden = true;
    backToCatalogButton.textContent = "← Home";
  }
  for (const button of [backButton, forwardButton, reloadSiteButton]) {
    if (button) button.hidden = true;
  }
  if (homeButton) homeButton.hidden = false;
  streamStatus.textContent = "Search a title, or browse Aniwave, then scan episodes into the queue.";
  window.streamApp.setCatalogBrowserLocked(true);
  reportChromeLayout();
  if (options.animate !== false && catalogHome) {
    window.shellMotion?.animateCatalogHome(catalogHome);
  }
}

function showAnimeLibrary() {
  animeView = "library";
  siteBrowseMode = false;
  searchPanel.hidden = false;
  searchPanel.classList.add("catalog-mode", "anime-shell");
  searchPanel.classList.remove("site-browse-mode");
  if (catalogHome) catalogHome.hidden = true;
  if (catalogLibrary) catalogLibrary.hidden = false;
  if (catalogResults) catalogResults.hidden = true;
  if (catalogDetail) catalogDetail.hidden = true;
  streamStatus.textContent = "Your downloaded anime.";
  window.streamApp.setCatalogBrowserLocked(true);
  refreshLibrary(true);
  reportChromeLayout();
}

function enterAnimeBrowse(statusText) {
  animeView = "browse";
  siteBrowseMode = true;
  searchError.textContent = "";
  searchPanel.hidden = false;
  searchPanel.classList.add("catalog-mode", "anime-shell", "site-browse-mode");
  if (catalogHome) catalogHome.hidden = false;
  if (catalogLibrary) catalogLibrary.hidden = true;
  if (catalogResults) catalogResults.hidden = true;
  if (catalogDetail) catalogDetail.hidden = true;
  if (animeHero) animeHero.hidden = true;
  if (browseSiteForTvButton) browseSiteForTvButton.hidden = true;
  if (backToCatalogButton) {
    backToCatalogButton.hidden = false;
    backToCatalogButton.textContent = "← Home";
  }
  for (const button of [backButton, homeButton, forwardButton, reloadSiteButton]) {
    if (button) button.hidden = false;
  }
  streamStatus.textContent =
    statusText || `Browsing ${siteLabel} — open a series, then scan episodes below.`;
  window.streamApp.setCatalogBrowserLocked(false);
  reportChromeLayout();
  setTimeout(reportChromeLayout, 80);
}

function showCatalogView(view) {
  if (!catalogMode) return;
  const previous = catalogView;
  catalogView = view;
  siteBrowseMode = false;
  searchPanel.hidden = false;
  searchPanel.classList.add("catalog-mode");
  searchPanel.classList.remove("site-browse-mode");
  if (browseSiteForTvButton) browseSiteForTvButton.hidden = false;
  if (backToCatalogButton) backToCatalogButton.hidden = true;
  if (catalogHome) catalogHome.hidden = view !== "home";
  if (catalogLibrary) catalogLibrary.hidden = view !== "library";
  if (catalogResults) catalogResults.hidden = view !== "results";
  if (catalogDetail) catalogDetail.hidden = view !== "detail";
  reportChromeLayout();

  if (view === "home" && catalogHome && (previous !== "home" || !catalogHomeAnimated)) {
    catalogHomeAnimated = true;
    window.shellMotion?.animateCatalogHome(catalogHome);
  }
  if (view === "library") {
    refreshLibrary(true);
  }
}

function renderCatalogPoster(container, movie, className) {
  container.innerHTML = "";
  if (movie?.posterUrl) {
    const img = document.createElement("img");
    img.src = movie.posterUrl;
    img.alt = movie.title || "Poster";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      container.innerHTML = "";
      const fallback = document.createElement("div");
      fallback.className = className;
      fallback.textContent = movie.title || "No poster";
      container.appendChild(fallback);
    });
    container.appendChild(img);
    return;
  }
  const fallback = document.createElement("div");
  fallback.className = className;
  fallback.textContent = movie?.title || "No poster";
  container.appendChild(fallback);
}

function isCatalogTvItem(item) {
  return item?.kind === "tv" || /\/(?:tv-series|tv|serie|series)\//i.test(String(item?.movieUrl || ""));
}

function renderCatalogGrid(movies, query, counts = null) {
  catalogMovies = Array.isArray(movies) ? movies : [];
  if (!catalogGrid) return;
  catalogGrid.innerHTML = "";

  if (catalogResultsTitle) {
    catalogResultsTitle.textContent = query ? `Results for “${query}”` : "Results";
  }
  if (catalogResultsSummary) {
    const total = catalogMovies.length;
    const movieCount = counts?.movies ?? catalogMovies.filter((item) => !isCatalogTvItem(item)).length;
    const tvCount = counts?.tv ?? catalogMovies.filter((item) => isCatalogTvItem(item)).length;
    catalogResultsSummary.textContent = `${total} title${total === 1 ? "" : "s"} · ${movieCount} movie${movieCount === 1 ? "" : "s"} · ${tvCount} TV`;
  }

  for (const movie of catalogMovies) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `catalog-card${isCatalogTvItem(movie) ? " kind-tv" : " kind-movie"}`;
    card.setAttribute("role", "listitem");

    const poster = document.createElement("div");
    poster.className = "catalog-card-poster";
    renderCatalogPoster(poster, movie, "catalog-card-poster-fallback");

    const badge = document.createElement("span");
    badge.className = "catalog-card-kind";
    badge.textContent = isCatalogTvItem(movie) ? "TV" : "Movie";
    poster.appendChild(badge);

    const title = document.createElement("div");
    title.className = "catalog-card-title";
    title.textContent = movie.title || (isCatalogTvItem(movie) ? "TV Show" : "Movie");

    card.append(poster, title);
    if (movie.year) {
      const year = document.createElement("div");
      year.className = "catalog-card-year";
      year.textContent = movie.year;
      card.appendChild(year);
    }

    card.addEventListener("click", () => openCatalogMovie(movie));
    catalogGrid.appendChild(card);
  }

  showCatalogView("results");
  const cards = catalogGrid.querySelectorAll(".catalog-card");
  window.shellMotion?.animateCatalogGrid(cards);
  window.shellMotion?.bindPosterInteractions?.(cards);
}

function renderSeasonSelect(select, seasons, selectedSeason = null) {
  if (!select) return selectedSeason;
  select.replaceChildren();
  const list = Array.isArray(seasons) ? seasons : [];
  for (const season of list) {
    const option = document.createElement("option");
    option.value = String(season.number);
    option.textContent = season.label || `Season ${season.number}`;
    select.appendChild(option);
  }
  if (!list.length) return null;
  const preferred =
    list.find((season) => season.number === selectedSeason)?.number ?? list[0].number;
  select.value = String(preferred);
  return preferred;
}

function clearCatalogTvEpisodePanel(message = "No episodes scanned yet.") {
  catalogTvEpisodeOptions = [];
  if (catalogTvEpisodeSelect) catalogTvEpisodeSelect.replaceChildren();
  if (catalogTvEpisodeSummary) catalogTvEpisodeSummary.textContent = "";
  if (catalogTvEpisodeList) {
    catalogTvEpisodeList.innerHTML = `<li class="catalog-tv-empty">${message}</li>`;
  }
}

function renderCatalogTvEpisodePanel(plan = null) {
  const episodes = Array.isArray(plan?.episodes) ? plan.episodes : [];
  catalogTvEpisodeOptions = episodes;
  const season = plan?.season || getSelectedCatalogTvSeason() || 1;

  if (catalogTvEpisodeSelect) {
    catalogTvEpisodeSelect.replaceChildren();
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = episodes.length
      ? `All episodes (${episodes.length})`
      : "All episodes";
    catalogTvEpisodeSelect.appendChild(allOption);

    for (const episode of episodes) {
      const option = document.createElement("option");
      const code = `S${String(episode.season || season).padStart(2, "0")}E${String(
        episode.episode || 0
      ).padStart(2, "0")}`;
      option.value = String(episode.episode || "");
      option.textContent = `${code} · ${episode.title || "Episode"}`;
      catalogTvEpisodeSelect.appendChild(option);
    }
    catalogTvEpisodeSelect.value = "all";
  }

  if (catalogTvEpisodeSummary) {
    catalogTvEpisodeSummary.textContent = episodes.length
      ? `Season ${season} · ${episodes.length} episode${episodes.length === 1 ? "" : "s"} ready`
      : `Season ${season} · no episodes found yet`;
  }

  if (catalogTvEpisodeList) {
    if (!episodes.length) {
      catalogTvEpisodeList.innerHTML =
        '<li class="catalog-tv-empty">No episodes found for this season.</li>';
    } else {
      catalogTvEpisodeList.replaceChildren();
      for (const episode of episodes) {
        const item = document.createElement("li");
        const code = document.createElement("span");
        code.className = "ep-code";
        code.textContent = `S${String(episode.season || season).padStart(2, "0")}E${String(
          episode.episode || 0
        ).padStart(2, "0")}`;
        const title = document.createElement("span");
        title.className = "ep-title";
        title.textContent = episode.title || "Episode";
        item.append(code, title);
        catalogTvEpisodeList.appendChild(item);
      }
    }
  }
}

function renderCatalogTvSeasonPicker(seasons = [], selectedSeason = null) {
  catalogTvSeasonOptions = Array.isArray(seasons) ? seasons : [];
  if (!catalogTvPanel || !catalogTvSeasonSelect) return null;

  if (!catalogTvSeasonOptions.length) {
    catalogTvPanel.hidden = true;
    catalogTvSeasonSelect.replaceChildren();
    clearCatalogTvEpisodePanel();
    return null;
  }

  catalogTvPanel.hidden = false;
  return renderSeasonSelect(catalogTvSeasonSelect, catalogTvSeasonOptions, selectedSeason);
}

function renderQueueTvSeasonPicker(seasons = [], selectedSeason = null) {
  const list = Array.isArray(seasons) ? seasons : [];
  if (!queueTvSeasonRow || !queueTvSeasonSelect) return null;

  if (!list.length) {
    queueTvSeasonRow.hidden = true;
    queueTvSeasonSelect.replaceChildren();
    return null;
  }

  queueTvSeasonRow.hidden = false;
  return renderSeasonSelect(queueTvSeasonSelect, list, selectedSeason);
}

function getSelectedCatalogTvSeason() {
  const parsed = Number.parseInt(catalogTvSeasonSelect?.value, 10);
  if (parsed > 0) return parsed;
  const fallback = catalogTvSeasonOptions[0]?.number;
  return fallback > 0 ? fallback : 1;
}

function getSelectedQueueTvSeason() {
  const parsed = Number.parseInt(queueTvSeasonSelect?.value, 10);
  if (parsed > 0) return parsed;
  const fallback = catalogTvSeasonOptions[0]?.number;
  return fallback > 0 ? fallback : 1;
}

async function scanCatalogTvSeason(movie, season, { token = catalogTvScanToken } = {}) {
  if (!movie?.movieUrl) return { ok: false, error: "Missing show URL." };
  const title = movie.title || "TV show";
  if (catalogDetailStatus) {
    catalogDetailStatus.textContent = `Scanning season ${season} episodes...`;
  }
  clearCatalogTvEpisodePanel(`Scanning season ${season}...`);

  const result = await window.streamApp.prepareTvShow(movie.movieUrl, season);
  if (token !== catalogTvScanToken) return { ok: false, cancelled: true };

  if (result.seasons?.length) {
    renderCatalogTvSeasonPicker(result.seasons, result.season || season);
    renderQueueTvSeasonPicker(result.seasons, result.season || season);
  }

  if (!result.ok || !result.plan) {
    clearCatalogTvEpisodePanel(result.error || "Could not scan episodes.");
    if (catalogDetailStatus) {
      catalogDetailStatus.textContent = result.error || "Episode scan failed.";
    }
    return result;
  }

  renderTvShowPlan(result.plan);
  renderCatalogTvEpisodePanel(result.plan);
  const count = result.plan.episodes?.length || 0;
  if (catalogDetailStatus) {
    catalogDetailStatus.textContent = `${count} episode${count === 1 ? "" : "s"} found for season ${
      result.plan.season || season
    }.`;
  }
  appendActivityLog(
    "success",
    `Scanned "${result.plan.showTitle || title}" season ${result.plan.season || season} (${count} episode${
      count === 1 ? "" : "s"
    })`
  );
  return result;
}

async function loadCatalogTvShowLibrary(movie) {
  if (!isCatalogTvItem(movie) || !movie?.movieUrl) {
    renderCatalogTvSeasonPicker([]);
    renderQueueTvSeasonPicker([]);
    return { ok: false };
  }

  const token = ++catalogTvScanToken;
  if (catalogTvPanel) catalogTvPanel.hidden = false;
  if (catalogDetailStatus) {
    catalogDetailStatus.textContent = "Finding seasons and scanning episodes...";
  }
  clearCatalogTvEpisodePanel("Loading seasons and episodes...");

  try {
    // Scan the season from the catalog URL first (reliable). Season 1 is only used
    // when the URL has no season number.
    const result = await Promise.race([
      window.streamApp.prepareTvShow(movie.movieUrl, null),
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: false,
              error: "TV show scan timed out."
            }),
          60_000
        )
      )
    ]);

    if (token !== catalogTvScanToken) return { ok: false, cancelled: true };

    if (!result.ok) {
      renderCatalogTvSeasonPicker(result.seasons || []);
      renderQueueTvSeasonPicker(result.seasons || []);
      clearCatalogTvEpisodePanel(result.error || "Could not scan this show.");
      if (catalogDetailStatus) {
        catalogDetailStatus.textContent = result.error || "Could not scan this show.";
      }
      appendActivityLog("error", result.error || "Could not scan this show.");
      return result;
    }

    const selected = renderCatalogTvSeasonPicker(
      result.seasons || [],
      result.season || result.plan?.season
    );
    renderQueueTvSeasonPicker(result.seasons || [], selected);
    renderTvShowPlan(result.plan);
    renderCatalogTvEpisodePanel(result.plan);

    const count = result.plan?.episodes?.length || 0;
    if (catalogDetailStatus) {
      catalogDetailStatus.textContent = `${count} episode${count === 1 ? "" : "s"} found for season ${
        result.plan?.season || selected
      }.`;
    }
    appendActivityLog(
      "success",
      `Loaded "${result.plan?.showTitle || movie.title}" season ${result.plan?.season || selected} (${count} episode${
        count === 1 ? "" : "s"
      })`
    );
    return result;
  } catch (error) {
    if (token !== catalogTvScanToken) return { ok: false, cancelled: true };
    renderCatalogTvSeasonPicker([]);
    renderQueueTvSeasonPicker([]);
    clearCatalogTvEpisodePanel(error.message || "Scan failed.");
    if (catalogDetailStatus) {
      catalogDetailStatus.textContent = error.message || "TV scan failed.";
    }
    appendActivityLog("error", error.message || "TV scan failed.");
    return { ok: false, error: error.message || "TV scan failed." };
  }
}

function updateCatalogDetailActions(movie) {
  const isTv = isCatalogTvItem(movie);
  if (catalogDownloadLocal) {
    catalogDownloadLocal.textContent = isTv ? "Open Show Page" : "Download → PC";
    catalogDownloadLocal.hidden = false;
  }
  if (catalogDownloadNas) {
    catalogDownloadNas.hidden = isTv;
  }
  if (catalogAddQueue) {
    catalogAddQueue.textContent = isTv ? "Add Season to Queue" : "Add to Queue";
  }
  if (!isTv) {
    if (catalogTvPanel) catalogTvPanel.hidden = true;
    renderCatalogTvSeasonPicker([]);
    renderQueueTvSeasonPicker([]);
    clearCatalogTvEpisodePanel();
  } else if (catalogTvPanel) {
    catalogTvPanel.hidden = false;
  }
}

async function queueSelectedCatalogTvSeason() {
  if (!selectedCatalogMovie?.movieUrl) {
    appendActivityLog("error", "Select a TV show from the catalog first.");
    return { ok: false };
  }

  const season = getSelectedCatalogTvSeason();
  if (!tvShowPlan?.episodes?.length || Number(tvShowPlan.season) !== Number(season)) {
    const scan = await scanCatalogTvSeason(selectedCatalogMovie, season);
    if (!scan.ok) return scan;
  }

  const result = await window.streamApp.addTvPlanToQueue("nas");
  if (!result.ok) {
    appendActivityLog("error", result.error || "Could not add episodes to queue.");
    if (catalogDetailStatus) {
      catalogDetailStatus.textContent = result.error || "Could not add to queue.";
    }
    return result;
  }

  const added = result.added?.length || tvShowPlan?.episodes?.length || 0;
  appendActivityLog(
    "success",
    `Added ${added} episode${added === 1 ? "" : "s"} from season ${season} to queue`
  );
  if (catalogDetailStatus) {
    catalogDetailStatus.textContent = `Added ${added} episode${added === 1 ? "" : "s"} to the download queue.`;
  }
  window.shellMotion?.pulseQueueChrome();
  return result;
}

function renderCatalogDetail(movie) {
  selectedCatalogMovie = movie;
  const isTv = isCatalogTvItem(movie);
  if (catalogDetailTitle) catalogDetailTitle.textContent = movie.title || (isTv ? "TV Show" : "Movie");
  if (catalogDetailYear) {
    catalogDetailYear.textContent = [isTv ? "TV Show" : "Movie", movie.year].filter(Boolean).join(" · ");
  }
  if (catalogDetailStatus) {
    catalogDetailStatus.textContent = isTv
      ? "Loading seasons and episodes..."
      : "Ready to download or add to queue.";
  }
  if (catalogDetailPoster) {
    renderCatalogPoster(catalogDetailPoster, movie, "catalog-detail-poster-fallback");
  }
  updateCatalogDetailActions(movie);
  const wasDetail = catalogView === "detail";
  showCatalogView("detail");
  if (!wasDetail) {
    window.shellMotion?.animateCatalogDetail(catalogDetail);
  }
}

async function openCatalogMovie(movie) {
  if (!movie?.movieUrl) return;
  selectedCatalogMovie = movie;
  renderCatalogDetail(movie);
  const isTv = isCatalogTvItem(movie);
  streamStatus.textContent = `Opening “${movie.title || (isTv ? "show" : "movie")}”...`;
  if (catalogDetailStatus) {
    catalogDetailStatus.textContent = isTv ? "Loading show details..." : "Loading movie details...";
  }

  const result = await window.streamApp.catalogOpenMovie(movie);
  if (result.movie) {
    selectedCatalogMovie = { ...movie, ...result.movie };
    renderCatalogDetail(selectedCatalogMovie);
  }
  if (!result.ok) {
    streamStatus.textContent = result.error || "Could not open details.";
    if (catalogDetailStatus) {
      catalogDetailStatus.textContent = result.error || "Showing search result details.";
    }
    appendActivityLog("error", result.error || "Could not open details.");
    return;
  }

  streamStatus.textContent = `Selected “${selectedCatalogMovie.title}”`;
  if (isCatalogTvItem(selectedCatalogMovie)) {
    await loadCatalogTvShowLibrary(selectedCatalogMovie);
    return;
  }
  if (catalogDetailStatus) {
    catalogDetailStatus.textContent = "Ready to download or add to queue.";
  }
}

async function openSelectedCatalogTvShow() {
  if (!selectedCatalogMovie?.movieUrl) {
    appendActivityLog("error", "Select a TV show from the catalog first.");
    return;
  }
  await setSiteBrowseMode(true);
  const result = await window.streamApp.navigate(selectedCatalogMovie.movieUrl);
  if (result?.ok === false) {
    appendActivityLog("error", result.error || "Could not open the show page.");
    return;
  }
  streamStatus.textContent = `Opened “${selectedCatalogMovie.title}” — pick a season in the catalog, or scan from here.`;
  appendActivityLog("info", `Opened TV show “${selectedCatalogMovie.title}” for scanning`);
  await loadCatalogTvShowLibrary(selectedCatalogMovie);
}

async function downloadSelectedCatalogMovie(destination) {
  if (!selectedCatalogMovie?.movieUrl) {
    appendActivityLog("error", "Select a title from the catalog first.");
    return;
  }
  if (isCatalogTvItem(selectedCatalogMovie)) {
    await openSelectedCatalogTvShow();
    return;
  }

  const label = destination === "nas" ? "NAS" : "PC";
  streamStatus.textContent = `Starting download to ${label}...`;
  if (catalogDetailStatus) catalogDetailStatus.textContent = `Preparing download to ${label}...`;
  appendActivityLog("info", `Downloading “${selectedCatalogMovie.title}” → ${label}`);

  const result = await window.streamApp.downloadMovie({
    movieUrl: selectedCatalogMovie.movieUrl,
    title: selectedCatalogMovie.title,
    destination
  });

  if (!result.ok) {
    appendActivityLog("error", result.error || "Download failed.");
    streamStatus.textContent = result.error || "Download failed.";
    if (catalogDetailStatus) catalogDetailStatus.textContent = result.error || "Download failed.";
    return;
  }

  appendActivityLog("success", `Download started for “${selectedCatalogMovie.title}”`);
  if (catalogDetailStatus) catalogDetailStatus.textContent = `Download started → ${label}`;
}

async function addSelectedCatalogMovieToQueue(destination = "nas") {
  if (!selectedCatalogMovie?.movieUrl) {
    appendActivityLog("error", "Select a title from the catalog first.");
    return { ok: false };
  }
  if (isCatalogTvItem(selectedCatalogMovie)) {
    return queueSelectedCatalogTvSeason();
  }

  const result = await window.streamApp.addMovieToQueue({
    movieUrl: selectedCatalogMovie.movieUrl,
    title: selectedCatalogMovie.title,
    destination
  });

  if (!result.ok) {
    appendActivityLog("error", result.error || "Could not add to queue.");
    return result;
  }

  appendActivityLog("success", `Added “${result.item.title}” to queue`);
  if (catalogDetailStatus) catalogDetailStatus.textContent = "Added to download queue.";
  window.shellMotion?.pulseQueueChrome();
  return result;
}

async function runSearch(query, sourceInput = null) {
  const trimmed = String(query || "").trim();
  if (!trimmed) {
    searchError.textContent = hideMovieDownloader
      ? "Enter an anime title to search."
      : "Enter a movie or TV title to search.";
    if (catalogMode) showCatalogView("home");
    return;
  }

  searchError.textContent = "";
  streamStatus.textContent = `Searching for "${trimmed}"...`;
  if (hideMovieDownloader && !catalogMode) {
    enterAnimeBrowse(`Searching Aniwave for "${trimmed}"...`);
    await window.streamApp.setCatalogBrowserLocked(false);
  }
  if (catalogMode && catalogResultsSummary) {
    catalogResultsSummary.textContent = "Searching...";
    showCatalogView("results");
    if (catalogGrid) catalogGrid.innerHTML = "";
  }

  const result = await window.streamApp.searchMovies(trimmed);
  if (!result.ok) {
    searchError.textContent = result.error;
    streamStatus.textContent = result.error;
    if (catalogMode) {
      showCatalogView("home");
      appendActivityLog("error", result.error || "Search failed.");
    }
    return;
  }

  if (toolbarSearchInput) toolbarSearchInput.value = trimmed;
  if (sourceInput) sourceInput.blur();

  if (catalogMode) {
    renderCatalogGrid(result.movies || [], trimmed, result.counts || null);
    const total = result.movies?.length || 0;
    const tvCount = result.counts?.tv ?? (result.movies || []).filter((item) => isCatalogTvItem(item)).length;
    streamStatus.textContent = `Found ${total} result${total === 1 ? "" : "s"} for "${trimmed}"${tvCount ? ` (${tvCount} TV)` : ""}`;
    appendActivityLog("success", `Catalog search: ${total} titles for “${trimmed}”`);
    return;
  }

  hideSearchPanel();
  streamStatus.textContent = `Showing results for "${trimmed}"`;
}

function showBlockedPanel(details = {}) {
  blockedPanel.hidden = false;
  streamStatus.textContent = "Website blocked or unreachable.";

  if (details.errorDescription || details.url) {
    blockedDetail.textContent = [
      details.errorDescription ? `Error: ${details.errorDescription}` : null,
      details.url ? `URL: ${details.url}` : null
    ]
      .filter(Boolean)
      .join(" · ");
  } else {
    blockedDetail.textContent = "";
  }
}

function hideBlockedPanel() {
  blockedPanel.hidden = true;
  installStatus.textContent = "";
}

function updateNavigationButtons(state) {
  backButton.disabled = !state.canGoBack;
  forwardButton.disabled = !state.canGoForward;
}

async function refreshNavigationButtons() {
  const state = await window.streamApp.getNavigationState();
  updateNavigationButtons(state);
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value < 1024 * 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  return `${(value / 1024 / 1024 / 1024 / 1024).toFixed(1)} TB`;
}

function formatStorageLabel(info) {
  if (!info?.ok) return info?.error || "Storage unavailable";
  return `${formatBytes(info.available)} free of ${formatBytes(info.total)}`;
}

function applyStorageMeter(root, info) {
  if (!root) return;
  const fill = root.querySelector(".storage-meter-fill");
  const label = root.querySelector(".storage-meter-label");
  const usedPercent = info?.ok ? Math.min(100, Math.max(0, Number(info.usedPercent) || 0)) : 0;

  root.classList.toggle("unavailable", !info?.ok);
  root.classList.toggle("storage-warn", Boolean(info?.ok) && usedPercent >= 70);
  root.classList.toggle("storage-critical", Boolean(info?.ok) && usedPercent >= 90);

  if (fill) fill.style.width = `${usedPercent}%`;
  if (label) label.textContent = formatStorageLabel(info);
}

function createStorageMeter(info) {
  const meter = document.createElement("div");
  meter.className = "storage-meter library-storage-meter";
  meter.innerHTML =
    '<div class="storage-meter-track"><div class="storage-meter-fill"></div></div><span class="storage-meter-label"></span>';
  applyStorageMeter(meter, info);
  return meter;
}

function renderLibraryItem(movie) {
  if (movie?.kind === "tv-show") {
    return renderLibraryShowItem(movie);
  }

  const item = document.createElement("li");
  item.className = "library-item library-item-movie";
  item.title = movie.title;
  item.tabIndex = 0;
  item.setAttribute("role", "button");

  const card = document.createElement("div");
  card.className = "library-poster-card";

  if (movie.posterUrl) {
    const banner = document.createElement("img");
    banner.className = "library-banner";
    banner.src = movie.posterUrl;
    banner.alt = movie.title;
    banner.loading = "lazy";
    banner.decoding = "async";
    banner.addEventListener("error", () => {
      banner.replaceWith(createBannerFallback(movie.title));
    });
    card.appendChild(banner);
  } else {
    card.appendChild(createBannerFallback(movie.title));
  }

  const scrub = document.createElement("div");
  scrub.className = "library-poster-scrub";

  const badge = document.createElement("span");
  badge.className = "library-poster-badge";
  badge.textContent = "Movie";

  const title = document.createElement("span");
  title.className = "library-title";
  title.textContent = movie.title;

  scrub.append(badge, title);
  card.appendChild(scrub);
  item.appendChild(card);

  const openMovie = () => {
    if (movie.filePath) window.streamApp.openDownloadedMovie(movie.filePath);
  };
  item.addEventListener("click", openMovie);
  item.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMovie();
    }
  });

  return item;
}

function renderLibraryShowItem(show) {
  const item = document.createElement("li");
  item.className = "library-item library-item-show";
  item.title = show.title;
  item.dataset.showId = show.id || show.title;

  const header = document.createElement("button");
  header.type = "button";
  header.className = "library-show-header library-poster-card";

  if (show.posterUrl) {
    const banner = document.createElement("img");
    banner.className = "library-banner";
    banner.src = show.posterUrl;
    banner.alt = show.title;
    banner.loading = "lazy";
    banner.decoding = "async";
    banner.addEventListener("error", () => {
      banner.replaceWith(createBannerFallback(show.title));
    });
    header.appendChild(banner);
  } else {
    header.appendChild(createBannerFallback(show.title));
  }

  const scrub = document.createElement("div");
  scrub.className = "library-poster-scrub";

  const badge = document.createElement("span");
  badge.className = "library-poster-badge kind-tv";
  badge.textContent = hideMovieDownloader ? "Anime" : "TV";

  const title = document.createElement("span");
  title.className = "library-title";
  title.textContent = show.title;

  const subtitle = document.createElement("span");
  subtitle.className = "library-item-kind";
  subtitle.textContent = show.subtitle || `${show.episodeCount || 0} episodes`;

  scrub.append(badge, title, subtitle);
  header.appendChild(scrub);

  const episodeList = document.createElement("ul");
  episodeList.className = "library-episode-list";
  episodeList.hidden = true;

  for (const episode of show.episodes || []) {
    const row = document.createElement("li");
    row.className = "library-episode-item";

    const label = document.createElement("span");
    const code =
      episode.season && episode.episode
        ? `S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`
        : "";
    label.textContent = code ? `${code} · ${episode.title}` : episode.title;

    const play = document.createElement("button");
    play.type = "button";
    play.className = "library-episode-play";
    play.textContent = "Play";
    play.addEventListener("click", (event) => {
      event.stopPropagation();
      if (episode.filePath) window.streamApp.openDownloadedMovie(episode.filePath);
    });

    row.append(label, play);
    episodeList.appendChild(row);
  }

  const toggle = () => {
    const section = item.closest(".library-section");
    const drawer = section?.querySelector(".library-episode-drawer");
    const open = !item.classList.contains("expanded");

    if (section) {
      for (const other of section.querySelectorAll(".library-item-show.expanded")) {
        if (other === item) continue;
        other.classList.remove("expanded");
        const otherList = other.querySelector(".library-episode-list");
        if (otherList) otherList.hidden = true;
      }
    }

    item.classList.toggle("expanded", open);
    episodeList.hidden = !open;

    if (drawer) {
      drawer.replaceChildren();
      if (open) {
        const heading = document.createElement("div");
        heading.className = "library-episode-drawer-head";
        heading.innerHTML = `<strong>${show.title}</strong><span>${show.subtitle || `${show.episodeCount || 0} episodes`}</span>`;
        const clone = episodeList.cloneNode(true);
        clone.hidden = false;
        clone.removeAttribute("hidden");
        drawer.replaceChildren(heading, clone);
        drawer.hidden = false;
        drawer.querySelectorAll(".library-episode-play").forEach((btn, index) => {
          btn.addEventListener("click", (event) => {
            event.stopPropagation();
            const episode = show.episodes?.[index];
            if (episode?.filePath) window.streamApp.openDownloadedMovie(episode.filePath);
          });
        });
      } else {
        drawer.hidden = true;
        drawer.replaceChildren();
      }
    }
  };

  header.addEventListener("click", toggle);
  item.append(header, episodeList);
  return item;
}

function createBannerFallback(title) {
  const fallback = document.createElement("div");
  fallback.className = "library-banner-fallback";
  fallback.textContent = title;
  return fallback;
}

function formatLibraryPath(folderPath) {
  if (!folderPath) return "Unknown folder";

  const normalized = folderPath.replace(/\//g, "\\");
  if (normalized.startsWith("\\\\")) {
    const parts = normalized.replace(/^\\+/, "").split("\\").filter(Boolean);
    return parts.slice(1).join("\\") || parts.join("\\");
  }

  const parts = normalized.split("\\").filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join("\\");
  return normalized;
}

function renderLibrarySection(section, label, location) {
  const wrapper = document.createElement("section");
  wrapper.className = "library-section";

  const head = document.createElement("div");
  head.className = "library-section-head";

  const titleWrap = document.createElement("div");
  titleWrap.className = "library-section-title-wrap";

  const title = document.createElement("span");
  title.className = `library-section-title ${location}`;
  title.textContent = label;

  const folderPath = document.createElement("span");
  folderPath.className = "library-folder-path";
  folderPath.textContent = formatLibraryPath(section.folderPath);
  folderPath.title = section.folderPath || "";

  titleWrap.append(title, folderPath, createStorageMeter(section.storage));

  const actions = document.createElement("div");
  actions.className = "library-section-actions";

  const count = document.createElement("span");
  count.className = "library-count";
  const entryCount = section.movies?.length || 0;
  const showCount = section.showCount || section.movies?.filter((entry) => entry.kind === "tv-show").length || 0;
  const movieCount = section.movieCount || entryCount - showCount;
  count.textContent = String(entryCount);
  count.title = `${movieCount} movie${movieCount === 1 ? "" : "s"} · ${showCount} show${showCount === 1 ? "" : "s"}`;

  const openFolder = document.createElement("button");
  openFolder.type = "button";
  openFolder.className = "library-open-folder";
  openFolder.textContent = "Open";
  openFolder.addEventListener("click", (event) => {
    event.stopPropagation();
    window.streamApp.openLibraryFolder(location);
  });

  actions.append(count);
  if (location === "local" && section.accessible) {
    const syncButton = document.createElement("button");
    syncButton.type = "button";
    syncButton.className = "library-open-folder";
    syncButton.textContent = "Sync";
    syncButton.title = "Copy PC titles to NAS, then delete the local copies";
    syncButton.addEventListener("click", (event) => {
      event.stopPropagation();
      runLibrarySync();
    });
    actions.append(syncButton);
  }
  actions.append(openFolder);
  head.append(titleWrap, actions);
  wrapper.appendChild(head);

  if (!section.accessible) {
    const error = document.createElement("p");
    error.className = "library-error";
    error.textContent =
      section.error ||
      (location === "nas" ? "NAS unavailable — use Connect NAS" : "Folder unavailable");
    wrapper.appendChild(error);
    return wrapper;
  }

  if (!section.movies.length) {
    const empty = document.createElement("p");
    empty.className = "library-empty";
    empty.textContent = section.exists === false ? "(empty)" : "(empty)";
    wrapper.appendChild(empty);
    return wrapper;
  }

  const active = section.movies.filter((item) => !item.frozen);
  const frozen = section.movies.filter((item) => item.frozen);

  if (active.length) {
    const list = document.createElement("ul");
    list.className = "library-list";
    for (const movie of active) {
      list.appendChild(renderLibraryItem(movie));
    }
    wrapper.appendChild(list);
  }

  if (frozen.length) {
    const freezerTitle = document.createElement("h3");
    freezerTitle.className = "library-freezer-title";
    freezerTitle.textContent = "Freezer";
    const freezerHint = document.createElement("p");
    freezerHint.className = "library-empty";
    freezerHint.textContent = "Packed away to save space.";
    const frozenList = document.createElement("ul");
    frozenList.className = "library-list";
    for (const movie of frozen) {
      frozenList.appendChild(renderLibraryItem(movie));
    }
    wrapper.append(freezerTitle, freezerHint, frozenList);
  } else if (!active.length) {
    const empty = document.createElement("p");
    empty.className = "library-empty";
    empty.textContent = "(empty)";
    wrapper.appendChild(empty);
  }

  const drawer = document.createElement("div");
  drawer.className = "library-episode-drawer";
  drawer.hidden = true;
  wrapper.appendChild(drawer);

  return wrapper;
}

async function refreshLibrary(force = false) {
  if (!librarySections || !librarySummary) return;
  const now = Date.now();
  if (!force && now - lastLibraryRefreshAt < 4000) return;

  lastLibraryRefreshAt = now;
  const [library, storage] = await Promise.all([
    window.streamApp.getDownloadedMovies({
      backfillPosters: Boolean(force)
    }),
    window.streamApp.getFolderStorage()
  ]);

  if (library.local) library.local.storage = storage?.local;
  if (library.nas) library.nas.storage = storage?.nas;

  const nasLabel = hideMovieDownloader ? "Anime on NAS" : "Movies & TV on NAS";
  librarySections.replaceChildren(renderLibrarySection(library.nas, nasLabel, "nas"));

  const env = await window.streamApp.getEnvironment();
  const showWord = hideMovieDownloader ? "series" : "TV show";
  librarySummary.textContent = `${library.totalCount} title${library.totalCount === 1 ? "" : "s"}${
    library.showCount
      ? ` · ${library.showCount} ${showWord}${library.showCount === 1 ? "" : "s"}`
      : ""
  } · NAS: ${formatLibraryPath(env.nasVideoFolder)}`;

  if ((catalogMode && catalogView === "library") || (hideMovieDownloader && animeView === "library")) {
    const items = librarySections.querySelectorAll(".library-item");
    // Avoid opacity-freeze entrance on library tiles — posters were staying invisible.
    for (const item of items) {
      item.style.opacity = "";
      item.style.transform = "";
    }
    window.shellMotion?.bindPosterInteractions?.(items);
  }
}

if (refreshLibraryButton) {
  refreshLibraryButton.addEventListener("click", () => refreshLibrary(true));
}

function beginDownloadUi(destination) {
  setToolbarDisabled(downloadButton, true);
  setToolbarDisabled(saveNasButton, true);
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressDock.hidden = false;
  updateProgressDock({
    state: "running",
    phase: destination === "nas" ? "Preparing NAS save..." : "Preparing download...",
    percent: 3,
    destination
  });
}

async function beginDownloadSession(destination) {
  if (progressHideTimer) clearTimeout(progressHideTimer);
  await window.streamApp.clearDownloadJob();
  beginDownloadUi(destination);
}

function resetDownloadButtons(options = {}) {
  setToolbarDisabled(downloadButton, false);
  setToolbarDisabled(saveNasButton, false);
  if (!options.keepProgress) {
    hideProgressDock();
  }
}

function showDownloadError(message, debugText = null) {
  stopButton.hidden = true;
  progressDock.hidden = false;
  updateProgressDock({
    state: "failed",
    phase: message,
    percent: 100,
    destination: "local"
  });
  progressDetailRight.textContent = "See Activity Log on the right";
  appendActivityLog("error", message, debugText);
  scheduleProgressHide(8000);
}

function setSyncControlsDisabled(disabled) {
  setToolbarDisabled(syncToNasButton, disabled);
}

function queueStatusLabel(item) {
  switch (item?.status) {
    case "loading":
      return "Loading";
    case "downloading":
      return "Downloading";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return item?.passRetries ? "Retry" : "Pending";
  }
}

function formatQueueSummary(snapshot) {
  const counts = snapshot?.counts || {};
  const parts = [];
  if (counts.pending) parts.push(`${counts.pending} pending`);
  if (counts.movies) parts.push(`${counts.movies} movie${counts.movies === 1 ? "" : "s"}`);
  if (counts.episodes) parts.push(`${counts.episodes} ep${counts.episodes === 1 ? "" : "s"}`);
  if (counts.done) parts.push(`${counts.done} done`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  if (snapshot?.running) parts.push("running");
  if (parts.length) return parts.join(" · ");
  return "0 items queued";
}

function renderDownloadQueue(snapshot) {
  const items = snapshot?.items || [];
  downloadQueueSummary.textContent = formatQueueSummary(snapshot);
  downloadQueueList.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "download-queue-empty";
    empty.textContent = hideMovieDownloader
      ? "Scan a series, add episodes, then click Download. Files go to the NAS."
      : "Add titles, then click Download. Files are saved to the NAS.";
    downloadQueueList.appendChild(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement("li");
    row.className = `download-queue-item status-${item.status}`;
    if (item.kind === "episode") row.classList.add("kind-episode");
    else row.classList.add("kind-movie");
    if (item.id === snapshot.currentId) row.classList.add("current");

    const title = document.createElement("span");
    title.className = "download-queue-item-title";
    title.textContent = item.title;
    title.title = item.movieUrl;

    const badge = document.createElement("span");
    badge.className = "download-queue-item-status";
    badge.textContent = queueStatusLabel(item);

    const meta = document.createElement("span");
    meta.className = "download-queue-item-meta";
    const kindLabel = item.kind === "episode" ? (hideMovieDownloader ? "Episode" : "TV") : "Movie";
    meta.textContent = `${kindLabel} · ${item.destination === "nas" ? "NAS" : "PC"}`;

    row.append(title, badge, meta);

    if (item.status === "failed" && item.error) {
      const error = document.createElement("span");
      error.className = "download-queue-item-error";
      error.textContent = item.error;
      row.appendChild(error);
    }

    const isCurrent = snapshot.running && item.id === snapshot.currentId;
    if (!isCurrent && item.status !== "downloading" && item.status !== "loading") {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "download-queue-remove";
      removeButton.textContent = "×";
      removeButton.title = "Remove from queue";
      removeButton.addEventListener("click", async () => {
        const result = await window.streamApp.removeFromQueue(item.id);
        if (!result.ok) appendActivityLog("error", result.error);
      });
      row.appendChild(removeButton);
    }

    downloadQueueList.appendChild(row);
  }
}

function updateQueueControls(snapshot) {
  const running = Boolean(snapshot?.running);
  const hasWork = (snapshot?.counts?.pending || 0) > 0 || (snapshot?.counts?.failed || 0) > 0;

  startDownloadQueueLocalButton.disabled = running || (!hasWork && !hideMovieDownloader);
  startDownloadQueueNasButton.disabled = running || (!hasWork && !hideMovieDownloader);
  stopDownloadQueueButton.hidden = !running;
  clearDownloadQueueButton.disabled = running;
  addSearchToQueueButton.disabled = running;
  addCurrentToQueueButton.disabled = running;

  if (running) {
    setToolbarDisabled(downloadButton, true);
    setToolbarDisabled(saveNasButton, true);
  }
}

function handleQueueUpdate(payload = {}) {
  const snapshot = payload.snapshot || payload;
  queueActive = Boolean(snapshot.running);
  renderDownloadQueue(snapshot);
  updateQueueControls(snapshot);
  renderTvShowPlan(tvShowPlan, { processing: queueActive });

  if (queueActive && payload.item) {
    const target = payload.item.destination === "nas" ? "NAS" : "PC";
    if (payload.phase === "loading") {
      if (hideMovieDownloader) {
        enterAnimeBrowse(`Queue: capturing ${payload.item.title}...`);
      }
      streamStatus.textContent = `Queue: opening ${payload.item.title}...`;
      if (progressHideTimer) clearTimeout(progressHideTimer);
      progressDock.hidden = false;
      updateProgressDock({
        state: "running",
        phase: `Queue · Opening ${payload.item.title}`,
        indeterminate: true,
        destination: payload.item.destination,
        outputName: payload.item.title
      });
    } else if (payload.phase === "fetching-link") {
      streamStatus.textContent = `Queue: generating fresh download link for ${payload.item.title}...`;
      updateProgressDock({
        state: "running",
        phase: `Queue · Fresh link · ${payload.item.title}`,
        indeterminate: true,
        destination: payload.item.destination,
        outputName: payload.item.title
      });
    } else if (payload.phase === "retrying") {
      streamStatus.textContent = `Queue: retrying ${payload.item.title} (attempt ${payload.attempt || 2})...`;
    } else if (payload.phase === "item-failed") {
      streamStatus.textContent = `Queue: failed ${payload.item.title} — moving to next`;
      appendActivityLog("error", `Queue: ${payload.item.title} failed`, payload.error || "");
    } else if (payload.phase === "preparing") {
      streamStatus.textContent = `Queue: starting download for ${payload.item.title} (${target})...`;
    }
  }

  if (payload.phase === "retry-pass") {
    streamStatus.textContent = `Queue: retrying ${payload.retried || 0} failed item${payload.retried === 1 ? "" : "s"}...`;
    appendActivityLog("info", `Queue: retrying ${payload.retried || 0} failed item${payload.retried === 1 ? "" : "s"}`);
    updateProgressDock({
      state: "running",
      phase: "Queue · Retrying failed items",
      indeterminate: true,
      destination: "local"
    });
  }

  if (payload.phase === "stopping") {
    streamStatus.textContent = "Stopping queue...";
  }

  if (payload.phase === "complete") {
    const counts = snapshot.counts || {};
    appendActivityLog(
      "info",
      `Queue finished: ${counts.done || 0} done, ${counts.failed || 0} failed`
    );
    window.streamApp.getQueueDebug().then((result) => {
      if (result.ok && result.logPath) {
        appendActivityLog("debug", "Queue debug log saved", `Log file:\n${result.logPath}`);
      }
    });
    streamStatus.textContent = counts.failed
      ? "Queue finished with errors — see the queue list."
      : "Queue finished — all downloads complete.";
    updateProgressDock({
      state: counts.failed ? "failed" : "finished",
      phase: counts.failed ? "Queue finished with errors" : "Queue finished",
      percent: 100,
      destination: "local"
    });
    scheduleProgressHide(counts.failed ? 12000 : 8000);
    refreshLibrary(true);
    if (hideMovieDownloader) {
      showAnimeHome({ animate: false });
      window.streamApp.setCatalogBrowserLocked(true);
    }
  }

  if (payload.phase === "item-complete" && payload.item) {
    appendActivityLog("success", `Queue: finished ${payload.item.title}`);
  }
}

let queueRecoveryLogged = false;

async function refreshDownloadQueue() {
  const result = await window.streamApp.getDownloadQueue();
  if (result.ok) {
    handleQueueUpdate({
      snapshot: result.snapshot,
      phase: result.processing ? "running" : "idle"
    });
    const recovery = result.recovery;
    if (!queueRecoveryLogged && recovery?.restored) {
      queueRecoveryLogged = true;
      const interrupted = recovery.interrupted
        ? ` ${recovery.interrupted} interrupted download${recovery.interrupted === 1 ? " was" : "s were"} reset to pending.`
        : "";
      appendActivityLog(
        "info",
        `Restored queue from last session: ${recovery.restored} item${recovery.restored === 1 ? "" : "s"}.${interrupted}`
      );
    }
  }
}

async function fillSettingsForm() {
  const env = await window.streamApp.getEnvironment();
  const nasCreds = await window.streamApp.getNasCredentials();
  const siteCreds = await window.streamApp.getSiteCredentials();

  if (settingsLocalFolderInput) {
    settingsLocalFolderInput.value = env.outputDirectory || env.defaultLocalVideoFolder || "";
  }
  if (settingsNasFolderInput) {
    settingsNasFolderInput.value = env.nasVideoFolder || "";
  }
  if (settingsFolderError) settingsFolderError.textContent = "";
  nasConnectError.textContent = "";
  siteConnectError.textContent = "";

  nasUsernameInput.value = nasCreds.username || "";
  nasPasswordInput.value = "";
  nasPasswordInput.placeholder = nasCreds.hasPassword
    ? "Leave blank to keep the saved password"
    : "";

  siteUsernameInput.value = siteCreds.username || "";
  sitePasswordInput.value = "";
  sitePasswordInput.placeholder = siteCreds.hasPassword
    ? "Leave blank to keep the saved password"
    : "";
  siteAutoLoginInput.checked = siteCreds.autoLogin !== false;

  if (settingsSiteSection) settingsSiteSection.hidden = hideMovieDownloader;
  refreshSettingsStorage();
}

let settingsStorageTimer = null;
let settingsStorageRequest = 0;

async function refreshSettingsStorage() {
  const requestId = ++settingsStorageRequest;
  const localFolder = settingsLocalFolderInput?.value.trim() || "";
  const nasFolder = settingsNasFolderInput?.value.trim() || "";

  applyStorageMeter(
    settingsLocalStorage,
    localFolder ? { ok: false, error: "Checking storage..." } : { ok: false, error: "Set a local folder to see storage" }
  );
  applyStorageMeter(
    settingsNasStorage,
    nasFolder ? { ok: false, error: "Checking storage..." } : { ok: false, error: "Set a NAS folder to see storage" }
  );

  const result = await window.streamApp.getFolderStorage({
    localFolder,
    nasFolder
  });
  if (requestId !== settingsStorageRequest) return;

  applyStorageMeter(settingsLocalStorage, result?.local);
  applyStorageMeter(settingsNasStorage, result?.nas);
}

function scheduleSettingsStorageRefresh() {
  if (settingsStorageTimer) clearTimeout(settingsStorageTimer);
  settingsStorageTimer = setTimeout(() => {
    refreshSettingsStorage();
  }, 450);
}

async function showSettingsPanel(options = {}) {
  pendingNasRetry = options.retryAction || pendingNasRetry;
  await fillSettingsForm();
  if (options.error) {
    nasConnectError.textContent = options.error;
  }
  settingsPanel.hidden = false;
  if (options.focus === "nas") {
    nasUsernameInput.focus();
  } else if (options.focus === "site") {
    siteUsernameInput.focus();
  } else {
    settingsLocalFolderInput?.focus();
  }
}

function hideSettingsPanel() {
  settingsPanel.hidden = true;
  if (settingsFolderError) settingsFolderError.textContent = "";
  nasConnectError.textContent = "";
  siteConnectError.textContent = "";
  pendingNasRetry = null;
}

async function browseFolder(kind) {
  const current =
    kind === "nas" ? settingsNasFolderInput.value.trim() : settingsLocalFolderInput.value.trim();
  const result = await window.streamApp.chooseFolder({
    title: kind === "nas" ? "Choose NAS videos folder" : "Choose local videos folder",
    defaultPath: current || undefined
  });
  if (!result?.ok) return;
  if (kind === "nas") {
    settingsNasFolderInput.value = result.path;
  } else {
    settingsLocalFolderInput.value = result.path;
  }
  refreshSettingsStorage();
}

async function saveMediaFolders(options = {}) {
  if (settingsFolderError) settingsFolderError.textContent = "";
  const result = await window.streamApp.saveMediaFolders({
    localVideoFolder: settingsLocalFolderInput.value.trim(),
    nasVideoFolder: settingsNasFolderInput.value.trim()
  });
  if (!result.ok) {
    if (settingsFolderError) {
      settingsFolderError.textContent = result.error || "Could not save folders.";
    }
    return false;
  }
  if (result.outputDirectory) settingsLocalFolderInput.value = result.outputDirectory;
  if (result.nasVideoFolder != null) settingsNasFolderInput.value = result.nasVideoFolder;
  await refreshEnvStatus();
  await refreshLibrary(true);
  await refreshSettingsStorage();
  if (!options.silent) {
    streamStatus.textContent = "Saved local and NAS video folders.";
  }
  return true;
}

async function refreshEnvStatus() {
  const env = await window.streamApp.getEnvironment();
  const sitePart = env.siteLoggedIn
    ? `Signed in${env.siteUsername ? ` · ${env.siteUsername}` : ""}`
    : env.siteUsername
      ? "saved account (not signed in)"
      : "not signed in";
  envStatus.textContent = `NAS: ${
    env.nasVideoFolder ? formatLibraryPath(env.nasVideoFolder) : "not set"
  } · Site: ${sitePart}`;
  return env;
}

async function showNasConnectPanel(retryAction = null) {
  await showSettingsPanel({ retryAction, focus: "nas" });
}

function hideNasConnectPanel() {
  hideSettingsPanel();
}

function hideSiteConnectPanel() {
  hideSettingsPanel();
}

async function showSiteConnectPanel() {
  await showSettingsPanel({ focus: "site" });
}

async function saveSiteConnection(event) {
  event?.preventDefault();
  siteConnectError.textContent = "";

  const username = siteUsernameInput.value.trim();
  const password = sitePasswordInput.value;
  const creds = await window.streamApp.getSiteCredentials();

  if (!username || (!password && !creds.hasPassword)) {
    siteConnectError.textContent = "Enter both username and password.";
    return;
  }

  await window.streamApp.saveSiteCredentials({
    username,
    password,
    autoLogin: siteAutoLoginInput.checked
  });

  hideSettingsPanel();
  hideSearchPanel();
  appendActivityLog("info", "Checking Tornado Movies session...");
  streamStatus.textContent = "Checking Tornado Movies session...";

  const result = await window.streamApp.siteLogin();
  if (!result.ok) {
    siteConnectError.textContent = result.error || "Could not start site login.";
    await showSettingsPanel({ focus: "site" });
    streamStatus.textContent = result.error || "Site login failed.";
    return;
  }

  if (result.status === "already-logged-in") {
    streamStatus.textContent = "Already signed in to Tornado Movies.";
    await refreshEnvStatus();
    return;
  }

  streamStatus.textContent = "Submitting sign-in on premium page (no modal)...";
  await refreshEnvStatus();
}

async function saveNasConnection(event) {
  event?.preventDefault();
  nasConnectError.textContent = "";

  const username = nasUsernameInput.value.trim();
  const password = nasPasswordInput.value;

  if (!username) {
    nasConnectError.textContent = "Enter your NAS username.";
    return;
  }

  if (!settingsNasFolderInput.value.trim()) {
    nasConnectError.textContent = "Set a NAS videos folder first.";
    return;
  }

  const foldersSaved = await saveMediaFolders({ silent: true });
  if (!foldersSaved) return;

  const result = await window.streamApp.saveNasCredentials({ username, password });
  if (!result.ok) {
    nasConnectError.textContent = result.error || "Could not connect to NAS.";
    return;
  }

  const retryAction = pendingNasRetry;
  hideSettingsPanel();
  streamStatus.textContent = result.createdFolder
    ? `Connected to NAS as ${username}. Created Videos folder on the share.`
    : `Connected to NAS as ${username}.`;
  await refreshLibrary(true);
  await refreshEnvStatus();

  if (retryAction === "sync") {
    await runLibrarySync();
  } else if (retryAction === "download") {
    await runDownload("nas");
  } else if (retryAction === "save") {
    saveNasButton?.click();
  }
}

function handleNasAccessFailure(result, retryAction = null) {
  if (result?.needsCredentials) {
    showNasConnectPanel(retryAction);
    streamStatus.textContent = result.error || "NAS sign-in required.";
    return true;
  }
  return false;
}

async function runLibrarySync() {
  if (librarySyncActive || downloadActive) return;

  librarySyncActive = true;
  setSyncControlsDisabled(true);
  setToolbarDisabled(downloadButton, true);
  setToolbarDisabled(saveNasButton, true);
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressDock.hidden = false;
  streamStatus.textContent = "Syncing library to NAS, then removing local copies...";

  updateProgressDock({
    state: "running",
    phase: "Preparing library sync...",
    indeterminate: true,
    destination: "nas"
  });

  const unsubscribe = window.streamApp.onLibrarySyncProgress((progress) => {
    updateSyncProgressDock(progress);
  });

  try {
    const result = await window.streamApp.syncMoviesToNas();
    unsubscribe();

    if (!result.ok) {
      if (handleNasAccessFailure(result, "sync")) return;
      showDownloadError(result.error);
      streamStatus.textContent = result.error;
      return;
    }

    const errorNote =
      result.errors?.length > 0 ? ` · ${result.errors.length} failed` : "";
    const removedNote = result.removed ? `, ${result.removed} removed from PC` : "";
    streamStatus.textContent = `NAS sync complete — ${result.copied} copied, ${result.skipped} skipped${removedNote}${errorNote}.`;
    updateProgressDock({
      state: "finished",
      phase: "NAS sync complete",
      percent: 100,
      destination: "nas"
    });
    progressDetailLeft.textContent = `${result.copied} copied · ${result.skipped} skipped${
      result.removed ? ` · ${result.removed} removed` : ""
    }`;
    progressDetailRight.textContent = errorNote ? `${result.errors.length} failed` : "All done";
    appendActivityLog(
      "success",
      `NAS sync complete — ${result.copied} copied, ${result.skipped} skipped${removedNote}${errorNote}`
    );
    await refreshLibrary(true);
    scheduleProgressHide(result.errors?.length ? 12000 : 8000);
  } catch (error) {
    unsubscribe();
    showDownloadError(error.message || "NAS sync failed.");
    streamStatus.textContent = error.message || "NAS sync failed.";
  } finally {
    librarySyncActive = false;
    setSyncControlsDisabled(false);
    if (!downloadActive) {
      setToolbarDisabled(downloadButton, false);
      setToolbarDisabled(saveNasButton, false);
    }
  }
}

async function runDownload(destination) {
  beginDownloadUi(destination);
  streamStatus.textContent =
    destination === "nas" ? "Saving stream to NAS..." : "Starting download...";

  const result = await (destination === "nas"
    ? window.streamApp.saveToNas()
    : window.streamApp.downloadCurrentStream());

  if (!result.ok) {
    if (handleNasAccessFailure(result, destination === "nas" ? "download" : null)) return;
    showDownloadError(result.error);
    streamStatus.textContent = result.error;
    setToolbarDisabled(downloadButton, false);
    setToolbarDisabled(saveNasButton, false);
    return;
  }

  streamStatus.textContent = destination === "nas"
    ? `Saving ${result.playlist?.kind || "stream"} (${result.quality?.label || "best available"})${result.artworkPath ? " + poster" : ""} to NAS...`
    : `Downloading ${result.playlist?.kind || "stream"} (${result.quality?.label || "best available"})${result.artworkPath ? " + poster" : ""}...`;
  stopButton.hidden = false;
  await refreshDownloadStatus();
}

function formatQualityWarnings(warnings) {
  return (warnings || []).map((item) => item.message).join(" · ");
}


function formatElapsed(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes > 0) {
    return `${minutes}m ${String(secs).padStart(2, "0")}s`;
  }
  return `${secs}s`;
}

function reportChromeLayout() {
  if (chromeLayoutFrame) return;
  chromeLayoutFrame = requestAnimationFrame(() => {
    chromeLayoutFrame = null;

    const margin = 10;
    const toolbar = document.querySelector(".toolbar");
    const statusBar = document.querySelector(".status-bar");
    const dock = progressDock;
    const browseDock = searchPanel?.classList.contains("site-browse-mode") ? searchPanel : null;

    const top = Math.ceil(
      (statusBar?.getBoundingClientRect().bottom ??
        toolbar?.getBoundingClientRect().bottom ??
        74) + 4
    );

    const right = margin;

    let bottom = margin;
    if (browseDock && !browseDock.hidden) {
      bottom = Math.max(
        bottom,
        Math.ceil(window.innerHeight - browseDock.getBoundingClientRect().top + margin + 18)
      );
    }
    if (dock && !dock.hidden) {
      bottom = Math.max(
        bottom,
        Math.ceil(window.innerHeight - dock.getBoundingClientRect().top + margin)
      );
    }

    window.streamApp.setChromeLayout({ top, right, bottom });
  });
}

function setupChromeLayoutObserver() {
  reportChromeLayout();

  const watched = [
    document.querySelector(".toolbar"),
    document.querySelector(".status-bar"),
    searchPanel,
    progressDock
  ].filter(Boolean);

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => reportChromeLayout());
    for (const node of watched) observer.observe(node);
  }

  if (progressDock) {
    const dockObserver = new MutationObserver(() => reportChromeLayout());
    dockObserver.observe(progressDock, { attributes: true, attributeFilter: ["hidden", "class"] });
  }

  if (searchPanel) {
    const panelObserver = new MutationObserver(() => reportChromeLayout());
    panelObserver.observe(searchPanel, { attributes: true, attributeFilter: ["hidden", "class"] });
  }

  window.addEventListener("resize", reportChromeLayout);
}

function hideProgressDock() {
  progressDock.hidden = true;
  reportChromeLayout();
  progressTrack.className = "progress-track";
  progressFill.style.width = "0%";
}

function scheduleProgressHide(delayMs = 6000) {
  if (queueActive || tvShowActive) return;
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressHideTimer = setTimeout(async () => {
    progressHideTimer = null;
    hideProgressDock();
    await window.streamApp.clearDownloadJob();
    loggedDownloadJobId = null;
    await refreshDetection();
    await refreshDownloadStatus();
  }, delayMs);
}


function updateSyncProgressDock(progress) {
  const percent =
    progress.overallPercent != null
      ? progress.overallPercent
      : progress.total > 0
        ? Math.round((progress.index / progress.total) * 100)
        : null;

  let phase = "Syncing to NAS...";
  if (progress.phase === "preparing") {
    phase = "Preparing NAS sync...";
  } else if (progress.phase === "copying" && progress.fileName) {
    phase = `Copying ${progress.fileName}`;
  } else if (progress.phase === "removing" && progress.fileName) {
    phase = `Removing local ${progress.fileName}`;
  } else if (progress.phase === "complete") {
    phase = "NAS sync complete";
  }

  progressDock.hidden = false;
  progressPhase.textContent = phase;

  progressTrack.classList.remove("indeterminate", "complete", "failed");
  if (progress.phase === "complete") {
    progressTrack.classList.add("complete");
    progressPercent.textContent = "100%";
    progressFill.style.width = "100%";
  } else if (percent == null) {
    progressTrack.classList.add("indeterminate");
    progressPercent.textContent = "…";
    progressFill.style.width = "";
  } else {
    const clamped = Math.max(0, Math.min(100, percent));
    progressPercent.textContent = `${clamped}%`;
    progressFill.style.width = `${clamped}%`;
  }

  const leftParts = [];
  if (progress.overallTotalBytes > 0) {
    leftParts.push(
      `${formatBytes(progress.overallBytes || 0)} / ${formatBytes(progress.overallTotalBytes)}`
    );
  } else if (progress.fileName && progress.fileTotalBytes > 0) {
    leftParts.push(
      `${formatBytes(progress.fileBytes || 0)} / ${formatBytes(progress.fileTotalBytes)}`
    );
  }
  if (progress.copied > 0 || progress.skipped > 0 || progress.removed > 0) {
    const parts = [`${progress.copied} copied · ${progress.skipped} skipped`];
    if (progress.removed > 0) parts.push(`${progress.removed} removed`);
    leftParts.push(parts.join(" · "));
  }
  progressDetailLeft.textContent = leftParts.join(" · ") || "Syncing to NAS";

  const rightParts = [];
  if (progress.total > 0) {
    rightParts.push(`File ${progress.index}/${progress.total}`);
  }
  if (progress.failed > 0) {
    rightParts.push(`${progress.failed} failed`);
  }
  rightParts.push("NAS");
  progressDetailRight.textContent = rightParts.join(" · ");
}

function updateProgressDock(status) {
  if (!status || status.state === "idle") {
    if (progressHideTimer) return;
    if (!downloadActive && !librarySyncActive && !queueActive) hideProgressDock();
    return;
  }

  progressDock.hidden = false;
  progressPhase.textContent = status.phase || "Working...";

  progressTrack.classList.remove("indeterminate", "complete", "failed");

  if (status.state === "finished") {
    progressTrack.classList.add("complete");
    progressPercent.textContent = "100%";
    progressFill.style.width = "100%";
  } else if (status.state === "failed") {
    progressTrack.classList.add("failed");
    progressPercent.textContent = "Failed";
    progressFill.style.width = "100%";
  } else if (status.indeterminate) {
    progressTrack.classList.add("indeterminate");
    progressPercent.textContent = "…";
    progressFill.style.width = "";
  } else {
    const percent = Math.max(0, Math.min(100, Number(status.percent) || 0));
    progressPercent.textContent = `${percent}%`;
    progressFill.style.width = `${percent}%`;
  }

  const target = status.destination === "nas" ? "NAS" : "Movies";
  const leftParts = [];
  if (status.outputName) leftParts.push(status.outputName);
  if (status.qualityLabel) leftParts.push(status.qualityLabel);
  if (status.outputSize > 0) leftParts.push(formatBytes(status.outputSize));
  progressDetailLeft.textContent = leftParts.join(" · ") || `Saving to ${target}`;

  const rightParts = [];
  if (status.state === "running") {
    if (status.speed) rightParts.push(`${status.speed}x`);
    if (status.outTimeLabel && status.durationLabel) {
      rightParts.push(`${status.outTimeLabel} / ${status.durationLabel}`);
    } else if (status.outTimeLabel) {
      rightParts.push(`${status.outTimeLabel} captured`);
    }
    if (status.elapsedSeconds != null) {
      rightParts.push(`Elapsed ${formatElapsed(status.elapsedSeconds)}`);
    }
    rightParts.push(target);
  } else if (status.state === "finished") {
    if (status.artworkPath) rightParts.push("Poster saved");
    rightParts.push(target);
  } else if (status.state === "failed") {
    rightParts.push(status.lastLogLine || "See log file for details");
  }
  progressDetailRight.textContent = rightParts.join(" · ");
}

async function refreshDetection() {
  if (librarySyncActive || queueActive) return;

  const download = await window.streamApp.downloadStatus();
  if (download.state === "running") return;

  const { playlists, best, bestDirect } = await window.streamApp.getPlaylists();
  const target = bestDirect || best;

  if (catalogMode) {
    if (target && selectedCatalogMovie) {
      streamStatus.textContent = bestDirect
        ? `Direct ${bestDirect.qualityLabel} download ready · ${bestDirect.displayUrl}`
        : `Stream ready (${best?.kind || "hls"}) · ${best?.displayUrl || ""}`;
      if (download.state === "idle") {
        setToolbarDisabled(downloadButton, false);
        setToolbarDisabled(saveNasButton, false);
      }
    }
    return;
  }

  if (hideMovieDownloader) {
    if (animeView === "browse" && target) {
      streamStatus.textContent = bestDirect
        ? `Direct ${bestDirect.qualityLabel} download ready · ${bestDirect.displayUrl}`
        : `Stream ready (${best?.kind || "hls"}) · ${best?.displayUrl || ""}`;
    }
    return;
  }

  if (!target) {
    streamStatus.textContent =
      playlists.length === 0
        ? searchPanel.hidden
          ? "Waiting for download link... open a movie and click Download on the site."
          : "Search for a movie to begin."
        : `${playlists.length} playlist(s) seen, none selected yet.`;
    if (download.state === "idle") {
      setToolbarDisabled(downloadButton, true);
      setToolbarDisabled(saveNasButton, true);
    }
    return;
  }

  if (download.state === "idle") {
    if (bestDirect) {
      streamStatus.textContent = `Direct ${bestDirect.qualityLabel} download ready · ${bestDirect.displayUrl}`;
    } else {
      streamStatus.textContent = `Detected ${best.kind} stream · ${best.displayUrl}`;
    }
    setToolbarDisabled(downloadButton, false);
    setToolbarDisabled(saveNasButton, false);
  }
}

async function refreshDownloadStatus() {
  const status = await window.streamApp.downloadStatus();
  downloadActive = status.state === "running";
  setSyncControlsDisabled(librarySyncActive || downloadActive || queueActive || tvShowActive);

  if (librarySyncActive || tvShowActive) return;

  updateProgressDock(status);

  if (status.state === "idle") {
    downloadStatus.textContent = "";
    stopButton.hidden = true;
    setToolbarDisabled(downloadButton, false);
    setToolbarDisabled(saveNasButton, false);
    return;
  }

  stopButton.hidden = status.state !== "running";
  setToolbarDisabled(downloadButton, status.state === "running" || status.state === "finished" || status.state === "failed");
  setToolbarDisabled(saveNasButton, status.state === "running" || status.state === "finished" || status.state === "failed");

  if (status.state === "running") {
    const target = status.destination === "nas" ? "NAS" : "PC";
    downloadStatus.textContent = `${status.phase || "Downloading..."} · ${target} · ${formatBytes(status.outputSize)}`;
  } else if (status.state === "finished") {
    const warnings = status.postQualityWarnings || [];
    const artworkNote = status.artworkPath ? ` · Poster saved` : "";
    const warningNote = warnings.length ? ` · ${formatQualityWarnings(warnings)}` : "";
    downloadStatus.textContent = `Saved to ${status.outputPath}${artworkNote}${warningNote}`;
    streamStatus.textContent =
      warnings.length
        ? "Download complete — quality warnings flagged."
        : status.destination === "nas"
          ? "Saved to NAS. UPnP Media Server should pick it up shortly."
          : "Download complete.";
    scheduleProgressHide(warnings.length ? 12000 : 6000);
    refreshLibrary(true);
  } else if (status.state === "failed") {
    downloadStatus.textContent = status.lastLogLine || "Download failed.";
    scheduleProgressHide(8000);
  }
}

function setMovieToolbarVisible(visible) {
  for (const button of [downloadButton, saveNasButton, refreshButton, streamDebugButton, syncToNasButton]) {
    if (button) button.hidden = !visible;
  }
}

function placeAnimeQueueActionButtons(inRunBar) {
  const runBar = document.querySelector(".queue-run-bar");
  const tools = document.querySelector(".queue-tools .home-queue-actions");
  if (!runBar || !tools) return;
  const buttons = [scanTvShowButton, addCurrentEpisodeButton, addTvToQueueButton].filter(Boolean);
  if (inRunBar) {
    for (const button of buttons) {
      runBar.insertBefore(button, startDownloadQueueLocalButton);
    }
    return;
  }
  for (const button of buttons) {
    tools.appendChild(button);
  }
}

function applyProfileLayout(env) {
  hideMovieDownloader = Boolean(env.hideMovieDownloader);
  catalogMode = Boolean(env.catalogMode) && !hideMovieDownloader;
  siteLabel = env.siteLabel || "Tornado Movies";
  document.body.classList.toggle("anime-mode", hideMovieDownloader);

  if (browseHomeButton) {
    browseHomeButton.textContent = `Browse ${siteLabel}`;
    browseHomeButton.hidden = catalogMode;
  }
  if (openLibraryButton) openLibraryButton.hidden = !(catalogMode || hideMovieDownloader);
  if (settingsSiteSection) settingsSiteSection.hidden = hideMovieDownloader;
  if (catalogBrand && env.profileLabel) catalogBrand.textContent = env.profileLabel;

  if (tvShowSection) tvShowSection.hidden = true;
  if (downloadQueueSection) downloadQueueSection.hidden = false;

  if (hideMovieDownloader) {
    if (searchFeatures) searchFeatures.hidden = true;
    if (tvShowLead && env.tvShowLead) tvShowLead.textContent = env.tvShowLead;
    if (tvShowTitle) tvShowTitle.textContent = "Anime";
    if (browseSiteForTvButton) {
      browseSiteForTvButton.hidden = false;
      browseSiteForTvButton.textContent = `Browse ${siteLabel}`;
    }
    if (backToCatalogButton) {
      backToCatalogButton.hidden = true;
      backToCatalogButton.textContent = "← Home";
    }
    if (addSearchToQueueButton) addSearchToQueueButton.hidden = true;
    if (addCurrentToQueueButton) addCurrentToQueueButton.hidden = true;
    if (animeHero) animeHero.hidden = true;
    if (scanTvShowButton) scanTvShowButton.textContent = "Scan Series";
    if (addTvToQueueButton) addTvToQueueButton.textContent = "Add Episodes";
    if (addCurrentEpisodeButton) {
      addCurrentEpisodeButton.hidden = false;
      addCurrentEpisodeButton.textContent = "Add This Episode";
    }
    placeAnimeQueueActionButtons(true);
    if (startDownloadQueueLocalButton) {
      startDownloadQueueLocalButton.title = "Scan this series if needed, then download to this PC";
    }
    if (startDownloadQueueNasButton) {
      startDownloadQueueNasButton.title = "Scan this series if needed, then download to NAS";
    }
    const toolsLabel = document.querySelector(".queue-tools-label");
    if (toolsLabel) toolsLabel.textContent = "Scanned episodes";
    const queueHead = downloadQueueSection?.querySelector(".home-queue-header strong");
    if (queueHead) queueHead.textContent = "Episode Queue";
    const emptyQueue = downloadQueueList?.querySelector(".download-queue-empty");
    if (emptyQueue) {
      emptyQueue.textContent = "Open a series, then click Download. Files are saved to the NAS.";
    }
    if (tvShowSummary) {
      tvShowSummary.textContent = env.tvShowLead || "Open a series page, scan episodes, then add them to the queue.";
    }
    if (openSettingsButton) openSettingsButton.title = "Folders and NAS";
    const libraryHeading = catalogLibrary?.querySelector("h2");
    if (libraryHeading) libraryHeading.textContent = "My Anime";
    setMovieToolbarVisible(false);
    if (homeButton) homeButton.hidden = false;
    showAnimeHome({ animate: false });
    return;
  }

  placeAnimeQueueActionButtons(false);
  if (startDownloadQueueLocalButton) startDownloadQueueLocalButton.removeAttribute("title");
  if (startDownloadQueueNasButton) startDownloadQueueNasButton.removeAttribute("title");

  if (animeHero) animeHero.hidden = true;
  searchPanel.classList.remove("anime-shell");
  if (addSearchToQueueButton) addSearchToQueueButton.hidden = false;
  if (addCurrentToQueueButton) addCurrentToQueueButton.hidden = false;
  if (addCurrentEpisodeButton) addCurrentEpisodeButton.hidden = true;
  if (openSettingsButton) openSettingsButton.title = "Folders, NAS, and Tornado Movies login";
  const libraryHeading = catalogLibrary?.querySelector("h2");
  if (libraryHeading) libraryHeading.textContent = "My Library";

  if (settingsSiteSection) settingsSiteSection.hidden = false;
  if (searchFeatures) searchFeatures.hidden = catalogMode;
  if (tvShowTitle) tvShowTitle.textContent = "TV Shows";
  if (tvShowLead) {
    tvShowLead.textContent =
      env.tvShowLead ||
      "Browse the site for a season, scan episodes, then add them to the shared download queue with movies.";
  }
  setMovieToolbarVisible(true);
  if (catalogMode) {
    searchPanel.classList.add("catalog-mode");
    showCatalogView("home");
    setSiteBrowseMode(false);
  } else {
    for (const button of [backButton, forwardButton, reloadSiteButton]) {
      if (button) button.hidden = false;
    }
  }
}

async function initEnvironment() {
  const env = await window.streamApp.getEnvironment();
  siteLabel = env.siteLabel || "Tornado Movies";
  if (env.profileLabel && brandTitle) {
    brandTitle.textContent = env.profileLabel;
    document.title = env.profileLabel;
  }
  if (env.searchPlaceholder && toolbarSearchInput) {
    toolbarSearchInput.placeholder = env.searchPlaceholder;
  }
  if (openAnimeWindowButton) {
    openAnimeWindowButton.hidden = !env.openAnimeButton;
  }
  if (openFolderButton && env.profileId === "anime") {
    openFolderButton.textContent = "Open NAS Folder";
  }
  applyProfileLayout(env);
  if (!env.ffmpegPath) {
    streamStatus.textContent = "ffmpeg not found — install ffmpeg and restart the app.";
    if (!hideMovieDownloader) {
      setToolbarDisabled(downloadButton, true);
      setToolbarDisabled(saveNasButton, true);
    }
  }
  await refreshEnvStatus();
  showSearchPanel();
  return env;
}

downloadButton?.addEventListener("click", async () => {
  if (catalogMode && selectedCatalogMovie?.movieUrl) {
    await downloadSelectedCatalogMovie("nas");
    return;
  }

  setToolbarDisabled(downloadButton, true);
  setToolbarDisabled(saveNasButton, true);
  streamStatus.textContent = "Starting download...";
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressDock.hidden = false;
  updateProgressDock({
    state: "running",
    phase: "Preparing download...",
    percent: 3,
    destination: "local"
  });

  const result = await window.streamApp.downloadCurrentStream();
  if (!result.ok) {
    streamStatus.textContent = result.error;
    setToolbarDisabled(downloadButton, false);
    setToolbarDisabled(saveNasButton, false);
    hideProgressDock();
    return;
  }

  streamStatus.textContent =
    result.playlist?.kind === "direct"
      ? `Downloading direct ${result.quality?.label || "file"}${result.artworkPath ? " + poster" : ""}...`
      : `Downloading ${result.playlist.kind} stream (${result.quality?.label || "best available"})${result.artworkPath ? " + poster" : ""}...`;
  stopButton.hidden = false;
  await refreshDownloadStatus();
});

saveNasButton?.addEventListener("click", async () => {
  if (catalogMode && selectedCatalogMovie?.movieUrl) {
    await downloadSelectedCatalogMovie("nas");
    return;
  }

  setToolbarDisabled(downloadButton, true);
  setToolbarDisabled(saveNasButton, true);
  streamStatus.textContent = "Saving stream to NAS...";
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressDock.hidden = false;
  updateProgressDock({
    state: "running",
    phase: "Preparing NAS download...",
    percent: 3,
    destination: "nas"
  });

  const result = await window.streamApp.saveToNas();
  if (!result.ok) {
    if (result.needsCredentials) {
      pendingNasRetry = "save";
      showSettingsPanel({ focus: "nas", retryAction: "save", error: result.error });
      hideProgressDock();
      return;
    }
    streamStatus.textContent = result.error;
    setToolbarDisabled(downloadButton, false);
    setToolbarDisabled(saveNasButton, false);
    hideProgressDock();
    return;
  }

  streamStatus.textContent = `Saving to NAS (${result.quality?.label || "best available"})${result.artworkPath ? " + poster" : ""}...`;
  stopButton.hidden = false;
  await refreshDownloadStatus();
});

stopButton.addEventListener("click", async () => {
  await window.streamApp.stopDownload();
  streamStatus.textContent = "Stopping download...";
  await refreshDownloadStatus();
});

refreshButton?.addEventListener("click", async () => {
  await window.streamApp.scanDirectDownloads();
  await refreshDetection();
});
streamDebugButton?.addEventListener("click", refreshStreamDebug);
activityLogClear.addEventListener("click", clearActivityLog);
activityLogCopy.addEventListener("click", async () => {
  const text = getActivityLogText();
  if (!text) return;
  await navigator.clipboard.writeText(text);
  streamStatus.textContent = "Activity log copied to clipboard.";
});

window.streamApp.onStreamDebugReport((payload) => {
  if (payload?.text) showStreamDebugPanel(payload.text);
});

backButton.addEventListener("click", async () => {
  await window.streamApp.goBack();
  await refreshNavigationButtons();
});
homeButton?.addEventListener("click", async () => {
  searchError.textContent = "";
  hideBlockedPanel();
  if (catalogMode) {
    showCatalogView("home");
    streamStatus.textContent = "Search the catalog to begin.";
    return;
  }
  if (hideMovieDownloader) {
    showAnimeHome();
    await window.streamApp.setCatalogBrowserLocked(true);
    const result = await window.streamApp.goHome();
    if (!result.ok) {
      searchError.textContent = result.error || "Could not go home.";
      return;
    }
    await refreshNavigationButtons();
    return;
  }
  showSearchPanel();
  if (catalogHome) catalogHome.hidden = false;
  streamStatus.textContent = "Home.";
  const result = await window.streamApp.goHome();
  if (!result.ok) {
    searchError.textContent = result.error || "Could not go home.";
    return;
  }
  await refreshNavigationButtons();
});
forwardButton.addEventListener("click", async () => {
  await window.streamApp.goForward();
  await refreshNavigationButtons();
});
reloadSiteButton.addEventListener("click", async () => {
  streamStatus.textContent = "Reloading page...";
  await window.streamApp.reloadCurrentPage();
});
openFolderButton.addEventListener("click", () => window.streamApp.openOutputFolder());
openSettingsButton.addEventListener("click", () => showSettingsPanel());
settingsBackdrop.addEventListener("click", () => hideSettingsPanel());
settingsCloseButton.addEventListener("click", () => hideSettingsPanel());
settingsForm.addEventListener("submit", (event) => event.preventDefault());
settingsBrowseLocalButton.addEventListener("click", () => browseFolder("local"));
settingsBrowseNasButton.addEventListener("click", () => browseFolder("nas"));
settingsLocalFolderInput.addEventListener("input", scheduleSettingsStorageRefresh);
settingsNasFolderInput.addEventListener("input", scheduleSettingsStorageRefresh);
settingsSaveFoldersButton.addEventListener("click", () => saveMediaFolders());
nasConnectSave.addEventListener("click", saveNasConnection);
siteConnectSave.addEventListener("click", saveSiteConnection);
syncToNasButton?.addEventListener("click", () => runLibrarySync());
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && settingsPanel && !settingsPanel.hidden) {
    hideSettingsPanel();
  }
});

function formatSiteLoginDebugDetail(entry) {
  if (!entry || typeof entry !== "object") return "";

  if (entry.type === "show-login-redirect") {
    return `redirecting to ${entry.target || "premium sign-in page"}`;
  }

  if (entry.type === "csrf-refresh-after-modal" || entry.type === "csrf-refresh-before-submit") {
    return entry.ok
      ? `csrf refreshed (${entry.tokenLength || "?"} chars)`
      : entry.status || entry.error || "csrf refresh failed";
  }

  if (entry.type === "login-submit-click") {
    const parts = [
      `form=${entry.mode || "?"}`,
      `emailLen=${entry.emailLength ?? "?"}`,
      `passLen=${entry.passwordLength ?? "?"}`,
      `recaptcha=${entry.recaptcha?.completed ? "yes" : "no"} (${entry.recaptcha?.responseLength || 0} chars)`,
      `csrf=${entry.csrf?.tokenLength ? "ok" : "missing"}`
    ];
    return parts.join(" · ");
  }

  if (entry.type === "login-request") {
    const parts = [
      `payload=${entry.payloadLength || 0}b`,
      `email=${entry.hasEmail ? "yes" : "no"}`,
      `password=${entry.hasPassword ? "yes" : "no"}`,
      `recaptchaField=${entry.hasRecaptchaField ? "yes" : "no"}`,
      `recaptchaDone=${entry.recaptcha?.completed ? "yes" : "no"}`
    ];
    return parts.join(" · ");
  }

  if (entry.type === "login-response") {
    const parts = [
      `http=${entry.httpStatus ?? "?"}`,
      `success=${entry.success ? "yes" : "no"}`,
      entry.serverMessage ? `msg=${entry.serverMessage}` : null
    ].filter(Boolean);
    return parts.join(" · ");
  }

  if (entry.type === "login-error") {
    return [
      `http=${entry.httpStatus ?? "?"}`,
      entry.statusText ? `status=${entry.statusText}` : null,
      entry.responseText ? `body=${entry.responseText.slice(0, 200)}` : null
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return JSON.stringify(entry).slice(0, 300);
}

window.streamApp.onSiteLoginDebug((entry) => {
  const detail = formatSiteLoginDebugDetail(entry);
  const label = entry?.type || "login-debug";
  const level =
    entry?.type === "login-error" || entry?.success === false || entry?.serverMessage
      ? "error"
      : entry?.type === "login-response" && entry?.success
        ? "success"
        : "debug";

  appendActivityLog(level, `Login debug: ${label}`, detail || null);

  if (entry?.type === "login-response" && entry?.success === false) {
    const message = entry.serverMessage || entry?.response?.msg || "Login rejected by site";
    streamStatus.textContent = `Login failed: ${message}`;
  }

  if (entry?.type === "login-submit-click" && entry?.recaptcha && !entry.recaptcha.completed) {
    streamStatus.textContent = "Complete reCAPTCHA first, then click LOGIN.";
  }
});

window.streamApp.onSiteLoginResult((result) => {
  if (result?.ok) {
    if (result.status === "already-logged-in") {
      appendActivityLog("success", "Tornado Movies: already logged in");
      streamStatus.textContent = "Already logged in to Tornado Movies.";
      return;
    }
    appendActivityLog("success", "Tornado Movies login submitted");
    streamStatus.textContent = "Login submitted. If successful, browse movies normally.";
    return;
  }

  if (result?.status === "recaptcha-present") {
    appendActivityLog(
      "info",
      "Tornado Movies: complete reCAPTCHA, then click LOGIN"
    );
    streamStatus.textContent =
      "Credentials filled. Complete reCAPTCHA, then click LOGIN in the browser.";
    return;
  }

  if (result?.status === "server-rejected") {
    const serverMessage = result?.error || "Login rejected by Tornado Movies";
    appendActivityLog("error", "Tornado Movies login failed", serverMessage);
    streamStatus.textContent = `Login failed: ${serverMessage}`;
    return;
  }

  if (result?.status === "logged-in") {
    appendActivityLog("success", "Tornado Movies login successful");
    streamStatus.textContent = "Logged in to Tornado Movies.";
    return;
  }

  const message = result?.status || result?.error || "Site login failed";
  appendActivityLog("error", "Tornado Movies login failed", message);
  streamStatus.textContent = `Site login issue: ${message}`;
});

warpDownloadLink.addEventListener("click", (event) => {
  event.preventDefault();
  window.streamApp.openWarpDownload();
});

installWarpButton.addEventListener("click", async () => {
  installStatus.textContent = "Opening Command Prompt to install 1.1.1.1 VPN...";
  const result = await window.streamApp.installWarpVpn();
  if (result.ok) {
    installStatus.textContent = `Running: ${result.command}`;
  }
});

retryLoadButton.addEventListener("click", async () => {
  hideBlockedPanel();
  streamStatus.textContent = "Retrying...";
  await window.streamApp.reloadCurrentPage();
});

browseHomeButton.addEventListener("click", async () => {
  if (catalogMode) {
    showCatalogView("home");
    streamStatus.textContent = "Search the catalog to begin.";
    return;
  }
  if (hideMovieDownloader) {
    await setSiteBrowseMode(true);
    return;
  }
  searchError.textContent = "";
  const result = await window.streamApp.goHome();
  if (!result.ok) {
    searchError.textContent = result.error || `Could not open ${siteLabel}.`;
    return;
  }
  hideSearchPanel();
  streamStatus.textContent = `Browsing ${siteLabel} — pick a movie and play it.`;
  await refreshDetection();
  await refreshNavigationButtons();
});

window.streamApp.onPageLoadFailed((details) => {
  showBlockedPanel(details);
});

window.streamApp.onGatewayRetry((details) => {
  if (!catalogMode) hideSearchPanel();
  streamStatus.textContent = `Site returned 502 — retrying (${details.attempt}/${details.maxAttempts})...`;
});

window.streamApp.onPageGatewayFailed((details) => {
  showBlockedPanel({
    errorDescription: `Bad gateway (502) after ${details.attempts} retries`,
    url: details.url
  });
});

window.streamApp.onPageLoadSucceeded(() => {
  if (catalogMode) {
    hideBlockedPanel();
    return;
  }
  if (hideMovieDownloader && animeView !== "browse") {
    hideBlockedPanel();
    return;
  }
  hideSearchPanel();
  hideBlockedPanel();
  refreshDetection();
  refreshNavigationButtons();
});

window.streamApp.onBrowserContentVisible(() => {
  if (catalogMode && !siteBrowseMode) {
    hideBlockedPanel();
    return;
  }
  if (hideMovieDownloader && animeView !== "browse") {
    hideBlockedPanel();
    return;
  }
  hideSearchPanel();
  hideBlockedPanel();
  if (siteBrowseMode && selectedCatalogMovie && isCatalogTvItem(selectedCatalogMovie)) {
    loadCatalogTvShowLibrary(selectedCatalogMovie);
  }
});

window.streamApp.onNavigationStateChanged((state) => {
  updateNavigationButtons(state);
});

window.streamApp.onRedirectBlocked((details) => {
  streamStatus.textContent = `Blocked redirect to ${details.displayUrl}`;
});

window.streamApp.onShowSearchLanding(() => {
  hideBlockedPanel();
  if (hideMovieDownloader) {
    showAnimeHome({ animate: false });
    return;
  }
  showSearchPanel();
});

window.streamApp.onDirectDownloadFound((payload) => {
  const label = payload?.qualityLabel
    ? `${payload.qualityLabel} direct download`
    : payload?.url?.includes("2160")
      ? "4K direct download"
      : payload?.url?.includes("1080")
        ? "1080p direct download"
        : "Direct download link";
  appendActivityLog("success", `${label} captured from site`);
  refreshDetection();
});

window.streamApp.onDownloadQueueUpdated((payload) => {
  handleQueueUpdate(payload);
});

window.streamApp.onQueueDebug((entry) => {
  const detail = entry?.data ? JSON.stringify(entry.data, null, 2) : null;
  appendActivityLog("debug", `[Queue ${entry.step}] ${entry.message}`, detail);
});

addSearchToQueueButton.addEventListener("click", async () => {
  const movies = catalogMode ? catalogMovies : null;
  if (catalogMode && !movies?.length && selectedCatalogMovie && !isCatalogTvItem(selectedCatalogMovie)) {
    await addSelectedCatalogMovieToQueue("nas");
    return;
  }
  if (catalogMode && !movies?.length) {
    appendActivityLog("error", "Search the catalog first, then add results to the queue.");
    return;
  }

  const result = await window.streamApp.addSearchResultsToQueue("nas", movies);
  if (!result.ok) {
    appendActivityLog("error", result.error);
    return;
  }

  const added = result.added?.length || 0;
  const skipped = result.skipped?.length || 0;
  appendActivityLog(
    "success",
    added
      ? `Added ${added} movie${added === 1 ? "" : "s"} to queue${skipped ? ` (${skipped} skipped)` : ""}`
      : "No new movies added to the queue."
  );
  if (added) window.shellMotion?.pulseQueueChrome();
});

addCurrentToQueueButton.addEventListener("click", async () => {
  if (catalogMode) {
    await addSelectedCatalogMovieToQueue("nas");
    return;
  }

  const result = await window.streamApp.addCurrentToQueue("nas");
  if (!result.ok) {
    appendActivityLog("error", result.error);
    return;
  }
  appendActivityLog("success", `Added "${result.item.title}" to queue`);
  window.shellMotion?.pulseQueueChrome();
});

if (catalogBackHome) {
  catalogBackHome.addEventListener("click", () => {
    showCatalogView("home");
    streamStatus.textContent = "Search the catalog to begin.";
  });
}

if (catalogBackLibraryHome) {
  catalogBackLibraryHome.addEventListener("click", () => {
    if (hideMovieDownloader) {
      showAnimeHome();
      return;
    }
    showCatalogView("home");
    streamStatus.textContent = "Search the catalog to begin.";
  });
}

if (openLibraryButton) {
  openLibraryButton.addEventListener("click", async () => {
    if (hideMovieDownloader) {
      await window.streamApp.setCatalogBrowserLocked(true);
      if (animeView === "browse") {
        await window.streamApp.goHome({ hideBrowser: true });
      }
      showAnimeLibrary();
      return;
    }
    if (!catalogMode) return;
    showCatalogView("library");
    streamStatus.textContent = "Your downloaded movies and TV shows.";
  });
}

if (catalogBackResults) {
  catalogBackResults.addEventListener("click", () => {
    if (catalogMovies.length) showCatalogView("results");
    else showCatalogView("home");
  });
}

if (catalogQueueAll) {
  catalogQueueAll.addEventListener("click", async () => {
    if (!catalogMovies.length) {
      appendActivityLog("error", "No search results to queue.");
      return;
    }
    const result = await window.streamApp.addSearchResultsToQueue("nas", catalogMovies);
    if (!result.ok) {
      appendActivityLog("error", result.error);
      return;
    }
    const added = result.added?.length || 0;
    appendActivityLog("success", `Added ${added} movie${added === 1 ? "" : "s"} to queue`);
    if (added) window.shellMotion?.pulseQueueChrome();
  });
}

if (catalogDownloadLocal) {
  catalogDownloadLocal.addEventListener("click", () => downloadSelectedCatalogMovie("local"));
}
if (catalogDownloadNas) {
  catalogDownloadNas.addEventListener("click", () => downloadSelectedCatalogMovie("nas"));
}
if (catalogAddQueue) {
  catalogAddQueue.addEventListener("click", () => addSelectedCatalogMovieToQueue("nas"));
}
if (catalogTvSeasonSelect) {
  catalogTvSeasonSelect.addEventListener("change", async () => {
    const season = getSelectedCatalogTvSeason();
    if (queueTvSeasonSelect && !queueTvSeasonRow?.hidden) {
      queueTvSeasonSelect.value = String(season);
    }
    if (!selectedCatalogMovie || !isCatalogTvItem(selectedCatalogMovie)) return;
    const token = ++catalogTvScanToken;
    await scanCatalogTvSeason(selectedCatalogMovie, season, { token });
  });
}
if (catalogTvEpisodeSelect) {
  catalogTvEpisodeSelect.addEventListener("change", () => {
    const value = catalogTvEpisodeSelect.value;
    if (!catalogTvEpisodeList) return;
    const items = catalogTvEpisodeList.querySelectorAll("li");
    items.forEach((item) => item.classList.remove("is-active"));
    if (value === "all") return;
    const match = [...items].find((item) =>
      item.querySelector(".ep-code")?.textContent?.endsWith(`E${String(value).padStart(2, "0")}`)
    );
    if (match) {
      match.classList.add("is-active");
      match.scrollIntoView({ block: "nearest" });
    }
  });
}
if (queueTvSeasonSelect) {
  queueTvSeasonSelect.addEventListener("change", () => {
    const season = getSelectedQueueTvSeason();
    if (catalogTvSeasonSelect && catalogTvPanel && !catalogTvPanel.hidden) {
      catalogTvSeasonSelect.value = String(season);
    }
  });
}

async function startQueueDownload(_destination) {
  const destination = "nas";
  if (hideMovieDownloader) {
    startDownloadQueueLocalButton.disabled = true;
    startDownloadQueueNasButton.disabled = true;
    const filled = await fillAnimeQueueFromPage(destination);
    if (!filled.ok) {
      appendActivityLog("error", filled.error);
      streamStatus.textContent = filled.error || "Could not add episodes to the queue.";
      await refreshDownloadQueue();
      return;
    }
  }

  const result = await window.streamApp.startDownloadQueue(destination);
  if (!result.ok) {
    appendActivityLog("error", result.error);
    streamStatus.textContent = result.error || "Could not start the queue.";
    await refreshDownloadQueue();
    return;
  }

  const target = destination === "nas" ? "NAS" : "PC";
  appendActivityLog("info", `Queue download started → ${target}`);
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressDock.hidden = false;
  updateProgressDock({
    state: "running",
    phase: `Queue → ${target}`,
    indeterminate: true,
    destination
  });
}

async function fillAnimeQueueFromPage(destination) {
  const current = await window.streamApp.getDownloadQueue();
  const counts = current?.snapshot?.counts || {};
  if ((counts.pending || 0) + (counts.failed || 0) > 0) return { ok: true };

  enterAnimeBrowse("Scanning this series into the queue...");
  await window.streamApp.setCatalogBrowserLocked(false);

  appendActivityLog("info", "Scanning the current series for episodes...");
  const scan = await window.streamApp.scanTvShow(null, null);
  if (!scan.ok) {
    return {
      ok: false,
      error: scan.error || "Open a series page, then click Download or Scan Series."
    };
  }
  renderTvShowPlan(scan.plan);

  const added = await window.streamApp.addTvPlanToQueue(destination);
  if (!added.ok) return added;

  const addedCount = added.added?.length || 0;
  const skippedCount = added.skipped?.length || 0;
  if (!addedCount && !skippedCount) {
    return { ok: false, error: "No episodes were added. Open a series page, then try again." };
  }

  appendActivityLog(
    "success",
    addedCount
      ? `Added ${addedCount} episode${addedCount === 1 ? "" : "s"} to the queue`
      : "Those episodes are already in the queue."
  );
  await refreshDownloadQueue();
  return { ok: true };
}

startDownloadQueueLocalButton.addEventListener("click", () => startQueueDownload("local"));
startDownloadQueueNasButton.addEventListener("click", () => startQueueDownload("nas"));

stopDownloadQueueButton.addEventListener("click", async () => {
  await window.streamApp.stopDownloadQueue();
  appendActivityLog("info", "Stopping queue...");
});

clearDownloadQueueButton.addEventListener("click", async () => {
  const result = await window.streamApp.clearDownloadQueue();
  if (!result.ok) appendActivityLog("error", result.error);
});

queueDebugCopyButton.addEventListener("click", async () => {
  const result = await window.streamApp.getQueueDebug();
  if (!result.ok) {
    appendActivityLog("error", "Could not load queue debug log.");
    return;
  }

  const lines = (result.entries || []).map((entry) => {
    const data = entry.data ? `\n${JSON.stringify(entry.data, null, 2)}` : "";
    return `[${entry.ts}] ${entry.step}: ${entry.message}${data}`;
  });
  const text = `${lines.join("\n\n")}\n\nLog file: ${result.logPath || "unknown"}`;

  try {
    await navigator.clipboard.writeText(text);
    appendActivityLog("info", "Queue debug log copied to clipboard", result.logPath || null);
  } catch {
    appendActivityLog("debug", "Queue debug log", text);
  }
});

async function setSiteBrowseMode(enabled) {
  if (hideMovieDownloader) {
    if (enabled) {
      enterAnimeBrowse();
      await window.streamApp.setCatalogBrowserLocked(false);
      await window.streamApp.goHome({ browse: true });
      await refreshNavigationButtons();
      reportChromeLayout();
      return;
    }
    showAnimeHome();
    await window.streamApp.setCatalogBrowserLocked(true);
    await window.streamApp.goHome();
    reportChromeLayout();
    return;
  }

  if (!catalogMode) {
    siteBrowseMode = false;
    if (browseSiteForTvButton) browseSiteForTvButton.hidden = true;
    if (backToCatalogButton) backToCatalogButton.hidden = true;
    searchPanel?.classList.remove("site-browse-mode");
    return;
  }

  siteBrowseMode = Boolean(enabled);

  if (browseSiteForTvButton) browseSiteForTvButton.hidden = siteBrowseMode;
  if (backToCatalogButton) backToCatalogButton.hidden = !siteBrowseMode;

  if (siteBrowseMode) {
    await window.streamApp.setCatalogBrowserLocked(false);
    for (const button of [backButton, forwardButton, reloadSiteButton]) {
      if (button) button.hidden = false;
    }
    searchPanel.hidden = false;
    searchPanel.classList.add("site-browse-mode");
    if (catalogHome) catalogHome.hidden = false;
    if (catalogLibrary) catalogLibrary.hidden = true;
    if (catalogResults) catalogResults.hidden = true;
    if (catalogDetail) catalogDetail.hidden = true;
    streamStatus.textContent = "Site browse: open a season page, then scan episodes into the queue.";
    await window.streamApp.goHome();
    await refreshNavigationButtons();
    reportChromeLayout();
    return;
  }

  searchPanel.classList.remove("site-browse-mode");
  await window.streamApp.setCatalogBrowserLocked(true);
  for (const button of [backButton, forwardButton, reloadSiteButton]) {
    if (button) button.hidden = true;
  }
  showCatalogView(
    catalogView === "detail" || catalogView === "results" || catalogView === "library"
      ? catalogView
      : "home"
  );
  streamStatus.textContent = "Search the catalog, or browse the site for TV seasons.";
  reportChromeLayout();
}

function renderTvShowPlan(plan = tvShowPlan, payload = {}) {
  tvShowPlan = plan || null;
  const episodeCount = plan?.episodes?.length || 0;
  const processing = Boolean(payload.processing || tvShowActive || queueActive);

  if (!plan) {
    if (tvShowSummary) {
      tvShowSummary.textContent = hideMovieDownloader
        ? "Open a series page, scan episodes, then add them to the queue."
        : "Browse a season page, scan it, then add episodes here with movies.";
    }
    if (tvShowEpisodeList) {
      tvShowEpisodeList.hidden = true;
      tvShowEpisodeList.innerHTML = '<li class="tv-show-empty">No season scanned yet.</li>';
    }
    if (addTvToQueueButton) addTvToQueueButton.disabled = true;
    return;
  }

  const season = plan.season || plan.episodes[0]?.season || 1;
  const seasonLabel = `Season ${String(season).padStart(2, "0")}`;
  if (tvShowSummary) {
    tvShowSummary.textContent = `${plan.showTitle} ${seasonLabel} · ${episodeCount} episode${episodeCount === 1 ? "" : "s"} ready to add`;
  }

  if (addTvToQueueButton) addTvToQueueButton.disabled = processing || episodeCount === 0;
  if (scanTvShowButton) scanTvShowButton.disabled = processing;
  if (clearTvShowPlanButton) clearTvShowPlanButton.disabled = processing;

  if (!tvShowEpisodeList) return;

  if (!episodeCount) {
    tvShowEpisodeList.hidden = false;
    tvShowEpisodeList.innerHTML = '<li class="tv-show-empty">No episodes found on the current page.</li>';
    return;
  }

  tvShowEpisodeList.hidden = false;
  tvShowEpisodeList.innerHTML = plan.episodes
    .map((episode) => {
      const label = `S${String(episode.season || 1).padStart(2, "0")}E${String(episode.episode || 0).padStart(2, "0")}`;
      return `<li class="tv-show-episode-item"><strong>${label} · ${escapeHtml(episode.title || "Episode")}</strong></li>`;
    })
    .join("");
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function handleTvShowUpdate(payload = {}) {
  const wasActive = tvShowActive;
  tvShowActive = Boolean(payload.processing);
  renderTvShowPlan(payload.plan ?? tvShowPlan, payload);

  if (tvShowActive && !wasActive) {
    if (progressHideTimer) clearTimeout(progressHideTimer);
    progressHideTimer = null;
    progressDock.hidden = false;
  }

  if (payload.phase === "downloading-episode" || payload.phase === "episode-complete") {
    progressDock.hidden = false;
    progressTrack.classList.remove("indeterminate");
    const total = payload.totalEpisodes || 1;
    const index = payload.index || payload.completedEpisodes || 0;
    const percent = total > 0 ? Math.round((index / total) * 100) : null;
    progressPhase.textContent = payload.label
      ? `TV show: ${payload.label} (${index}/${total})`
      : `TV show: episode ${index}/${total}`;
    if (percent != null) {
      progressPercent.textContent = `${percent}%`;
      progressFill.style.width = `${percent}%`;
    }
    progressDetailLeft.textContent = payload.showTitle || "Downloading episodes";
    const quality = payload.qualityLabel ? ` · ${payload.qualityLabel}` : "";
    progressDetailRight.textContent =
      payload.phase === "episode-complete"
        ? "Episode done"
        : `Downloading${quality}`;
  }

  if (payload.phase === "complete") {
    const saved = payload.completedEpisodes || payload.downloadedEpisodes?.length || 0;
    const failed = payload.failedEpisodes || 0;
    const folder = payload.outputDir || "";
    appendActivityLog(
      "success",
      `TV show complete: ${saved} episode${saved === 1 ? "" : "s"} saved${failed ? ` (${failed} failed)` : ""}${folder ? ` → ${folder}` : ""}`
    );
    if (progressHideTimer) clearTimeout(progressHideTimer);
    progressDock.hidden = false;
    progressTrack.classList.remove("indeterminate");
    progressPhase.textContent = "TV show download complete";
    progressPercent.textContent = "100%";
    progressFill.style.width = "100%";
    progressDetailLeft.textContent = folder || `${saved} episode(s) saved`;
    progressDetailRight.textContent = failed ? `${failed} failed` : "Complete";
    refreshLibrary(true);
  }

  if (payload.phase === "error" && payload.error) {
    appendActivityLog("error", payload.error);
    progressTrack.classList.remove("indeterminate");
    progressPhase.textContent = "TV show download failed";
    progressDetailLeft.textContent = payload.error;
  }
}

if (browseSiteForTvButton) {
  browseSiteForTvButton.addEventListener("click", () => setSiteBrowseMode(true));
}
if (backToCatalogButton) {
  backToCatalogButton.addEventListener("click", () => setSiteBrowseMode(false));
}

scanTvShowButton.addEventListener("click", async () => {
  const season = queueTvSeasonSelect && !queueTvSeasonRow?.hidden ? getSelectedQueueTvSeason() : null;
  if (hideMovieDownloader) {
    enterAnimeBrowse("Scanning series...");
    await window.streamApp.setCatalogBrowserLocked(false);
  }
  appendActivityLog(
    "info",
    season ? `Scanning season ${season} for episodes...` : "Scanning the current series for episodes..."
  );
  const result = await window.streamApp.scanTvShow(null, season);
  if (!result.ok) {
    appendActivityLog("error", result.error);
    streamStatus.textContent = result.error || "Scan failed.";
    return;
  }

  renderTvShowPlan(result.plan);
  const scannedSeason = result.plan.season || season || 1;
  appendActivityLog(
    "success",
    `Scanned "${result.plan.showTitle}" season ${scannedSeason} (${result.plan.episodes.length} episode${result.plan.episodes.length === 1 ? "" : "s"})`
  );
  streamStatus.textContent = `Scanned ${result.plan.episodes.length} episode${result.plan.episodes.length === 1 ? "" : "s"} — add them to the queue.`;
});

clearTvShowPlanButton.addEventListener("click", async () => {
  const result = await window.streamApp.clearTvShowPlan();
  if (!result.ok) {
    appendActivityLog("error", result.error);
    return;
  }
  renderTvShowPlan(null);
});

if (addCurrentEpisodeButton) {
  addCurrentEpisodeButton.addEventListener("click", async () => {
    const result = await window.streamApp.addCurrentEpisodeToQueue("nas");
    if (!result.ok) {
      appendActivityLog("error", result.error);
      streamStatus.textContent = result.error || "Could not add this episode.";
      return;
    }
    appendActivityLog("success", `Added "${result.item.title}" to the queue`);
    window.shellMotion?.pulseQueueChrome?.();
    await refreshDownloadQueue();
    streamStatus.textContent = `Queued ${result.item.title}. Click Download to save to the NAS.`;
  });
}

if (addTvToQueueButton) {
  addTvToQueueButton.addEventListener("click", async () => {
    const result = await window.streamApp.addTvPlanToQueue("nas");
    if (!result.ok) {
      appendActivityLog("error", result.error);
      return;
    }
    const added = result.added?.length || 0;
    const skipped = result.skipped?.length || 0;
    appendActivityLog(
      "success",
      `Added ${added} episode${added === 1 ? "" : "s"} to the shared queue${skipped ? ` (${skipped} already queued)` : ""}`
    );
    if (added) {
      window.shellMotion?.pulseQueueChrome?.();
      await refreshDownloadQueue();
    }
  });
}

window.streamApp.onTvShowUpdated((payload) => {
  handleTvShowUpdate(payload);
  if (payload.processing === false) {
    tvShowActive = false;
  }
});

window.streamApp.onStreamCaptureReset(() => {
  downloadStatus.textContent = "";
  if (catalogMode) {
    if (!selectedCatalogMovie) {
      streamStatus.textContent = "Search the catalog to begin.";
    }
    return;
  }
  if (hideMovieDownloader) {
    if (animeView === "browse") {
      streamStatus.textContent = "Stream capture reset — keep the episode playing to recapture.";
    }
    return;
  }
  streamStatus.textContent =
    "Stream capture reset — pause/play or seek the video to refresh, then download again.";
  setToolbarDisabled(downloadButton, true);
  setToolbarDisabled(saveNasButton, true);
});

toolbarSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSearch(toolbarSearchInput.value, toolbarSearchInput);
});

openAnimeWindowButton?.addEventListener("click", async () => {
  const result = await window.streamApp.openAnimeWindow();
  if (!result.ok) {
    appendActivityLog("error", result.error || "Could not open anime window.");
    return;
  }
  appendActivityLog("info", "Opened Anime Stream Downloader in a new window.");
});

initEnvironment().then((env) => {
  appendActivityLog(
    "info",
    env?.startupLog ||
      (hideMovieDownloader
        ? "Anime mode ready. Search or browse Aniwave, scan a series, then queue episodes."
        : "App ready. Open a movie and use the site's Download links, or play for HLS capture.")
  );
  refreshDownloadQueue();
});
setupChromeLayoutObserver();
window.streamApp.getTvShowPlan().then((result) => {
  if (result?.plan) renderTvShowPlan(result.plan, result);
});
refreshDetection();
refreshNavigationButtons();
refreshLibrary();

setInterval(async () => {
  await refreshDetection();
  await refreshDownloadStatus();
  await refreshLibrary();
}, 1000);
