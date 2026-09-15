const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("library-summary");
const storageLabel = document.getElementById("storage-label");
const storageBar = document.getElementById("storage-bar");
const libraryList = document.getElementById("library-list");
const filterInput = document.getElementById("filter");
const viewLibrary = document.getElementById("view-library");
const viewSearch = document.getElementById("view-search");
const viewShow = document.getElementById("view-show");
const viewFreezer = document.getElementById("view-freezer");
const tabLibrary = document.getElementById("tab-library");
const tabSearch = document.getElementById("tab-search");
const tabFreezer = document.getElementById("tab-freezer");
const freezerList = document.getElementById("freezer-list");
const freezerFilter = document.getElementById("freezer-filter");
const freezerSummary = document.getElementById("freezer-summary");
const freezerFailed = document.getElementById("freezer-failed");
const showPoster = document.getElementById("show-poster");
const showTitle = document.getElementById("show-title");
const showMeta = document.getElementById("show-meta");
const episodeList = document.getElementById("episode-list");
const showFreezerAction = document.getElementById("show-freezer-action");
const playerDialog = document.getElementById("player-dialog");
const player = document.getElementById("player");
const playerTitle = document.getElementById("player-title");
const searchList = document.getElementById("search-list");
const searchStatus = document.getElementById("search-status");
const accountLabel = document.getElementById("account-label");
const jobCard = document.getElementById("job-card");
const jobTitle = document.getElementById("job-title");
const jobLabel = document.getElementById("job-label");
const jobBar = document.getElementById("job-bar");
const jobPhase = document.getElementById("job-phase");
const catalogResultsHead = document.getElementById("catalog-results-head");
const catalogResultsSummary = document.getElementById("catalog-results-summary");
const catalogDetail = document.getElementById("catalog-detail");
const catalogDetailPoster = document.getElementById("catalog-detail-poster");
const catalogDetailTitle = document.getElementById("catalog-detail-title");
const catalogDetailYear = document.getElementById("catalog-detail-year");
const catalogDetailStatus = document.getElementById("catalog-detail-status");
const catalogTvPanel = document.getElementById("catalog-tv-panel");
const catalogTvSeasonSelect = document.getElementById("catalog-tv-season-select");
const catalogTvEpisodeSelect = document.getElementById("catalog-tv-episode-select");
const catalogTvEpisodeSummary = document.getElementById("catalog-tv-episode-summary");
const catalogTvEpisodeList = document.getElementById("catalog-tv-episode-list");
const catalogAddQueue = document.getElementById("catalog-add-queue");
const downloadQueueSummary = document.getElementById("download-queue-summary");
const downloadQueueList = document.getElementById("download-queue-list");
const startDownloadQueueButton = document.getElementById("start-download-queue");
const stopDownloadQueueButton = document.getElementById("stop-download-queue");
const clearDownloadQueueButton = document.getElementById("clear-download-queue");

let library = { movies: [], shows: [] };
let searchResults = [];
let searchCounts = null;
let selectedCatalogMovie = null;
let catalogTvSeasonOptions = [];
let catalogTvEpisodeOptions = [];
let tvShowPlan = null;
let catalogTvScanToken = 0;
let lastQueueSnapshot = { items: [], counts: {}, running: false };
let lastDoneCount = 0;

async function getJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || res.statusText);
    error.payload = data;
    throw error;
  }
  return data;
}

function matchesFilter(title) {
  const q = filterInput.value.trim().toLowerCase();
  return !q || String(title || "").toLowerCase().includes(q);
}

function posterStyle(posterId, posterUrl) {
  if (posterId) return `background-image:url('/api/poster/${posterId}')`;
  if (posterUrl) return `background-image:url('${String(posterUrl).replace(/'/g, "%27")}')`;
  return "";
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function episodeCode(episode, season = 1) {
  const s = String(episode?.season || season || 1).padStart(2, "0");
  if (!episode?.episode) return `S${s}`;
  return `S${s}E${String(episode.episode).padStart(2, "0")}`;
}

function isCatalogTvItem(item) {
  return item?.kind === "tv" || /\/(?:tv-series|tv|serie|series)\//i.test(String(item?.movieUrl || ""));
}

function play(id, title) {
  playerTitle.textContent = title;
  player.src = `/api/stream/${id}`;
  playerDialog.showModal();
  player.play().catch(() => {});
}

playerDialog.addEventListener("close", () => {
  player.pause();
  player.removeAttribute("src");
  player.load();
});

function showIdFromHash() {
  const match = String(location.hash || "").match(/^#\/show\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function isSearchHash() {
  return String(location.hash || "").startsWith("#/search");
}

function isFreezerHash() {
  return String(location.hash || "").startsWith("#/freezer");
}

function tornadoLoginUrl() {
  return "https://www4.tornadomovies.co/";
}

function helperFallbackScript(nasOrigin) {
  return `(function(){var __CINARIP_NAS_ORIGIN__=${JSON.stringify(nasOrigin)};if(!/tornadomovies\\.co/i.test(location.hostname)){alert("Switch to the Tornado tab, then click this bookmark.");return;}try{localStorage.setItem("cinaripNasOrigin",__CINARIP_NAS_ORIGIN__);}catch(e){}if(document.getElementById("cinarip-finish-bar"))return;var b=document.createElement("button");b.id="cinarip-finish-bar";b.type="button";b.textContent="Finish and close for CinaRip";b.style.cssText="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;width:100%;padding:20px 16px;border:0;background:#2563eb;color:#fff;font:700 20px/1.3 system-ui,sans-serif;cursor:pointer;text-align:center";b.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();var t="";try{t=(window.grecaptcha&&grecaptcha.getResponse&&grecaptcha.getResponse())||""}catch(err){}if(!t){b.textContent="Solve the captcha first, then click here.";return}location.href=__CINARIP_NAS_ORIGIN__+"/login-bridge.html?rc="+encodeURIComponent(t)},true);(document.body||document.documentElement).appendChild(b)})();`;
}

async function wireBookmarklets() {
  const finish = document.getElementById("captcha-bookmarklet");
  if (!finish) return;
  const nasOrigin = location.origin;
  try {
    const [overlay, helper] = await Promise.all([
      fetch("/overlay-killer.js").then((res) => res.text()),
      fetch("/tornado-helper.js").then((res) => res.text())
    ]);
    const payload = `(function(){var __CINARIP_NAS_ORIGIN__=${JSON.stringify(nasOrigin)};if(!/tornadomovies\\.co/i.test(location.hostname)){alert("Switch to the Tornado tab, then click this bookmark.");return;}${overlay}\n${helper}})();`;
    finish.href = `javascript:void${encodeURIComponent(payload)}`;
  } catch {
    finish.href = `javascript:void${encodeURIComponent(helperFallbackScript(nasOrigin))}`;
  }
}

let loginPollTimer = 0;

function stopLoginPoll() {
  if (loginPollTimer) {
    clearInterval(loginPollTimer);
    loginPollTimer = 0;
  }
}

function showLoginHelper() {
  const panel = document.getElementById("login-open-panel");
  if (panel) panel.hidden = false;
  wireBookmarklets().catch(() => {});
  stopLoginPoll();
  loginPollTimer = setInterval(async () => {
    try {
      const data = await getJson("/api/tornado/status");
      if (data.loggedIn) {
        stopLoginPoll();
        if (panel) panel.hidden = true;
        accountLabel.textContent = `Signed in${data.username ? ` · ${data.username}` : ""}`;
      }
    } catch {
      // keep waiting
    }
  }, 2500);
}

function openLoginWindow(loginUrl) {
  const popup = window.open(
    loginUrl || tornadoLoginUrl(),
    "cinarip-tornado-login",
    "width=560,height=860,scrollbars=yes,resizable=yes"
  );
  if (!popup) {
    accountLabel.textContent = "Allow popups for this site, then click Open Tornado again.";
    return null;
  }
  showLoginHelper();
  accountLabel.textContent = "Copy _identity-frontend1 and advanced-frontend, then paste them here";
  return popup;
}

function recaptchaFromHash() {
  const match = String(location.hash || "").match(/[?&]rc=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function finishCaptchaLogin(recaptcha) {
  if (!recaptcha) return;
  history.replaceState(null, "", "#/search");
  accountLabel.textContent = "Finishing sign-in…";
  try {
    const result = await postJson("/api/tornado/login", { recaptcha });
    accountLabel.textContent = result.loggedIn === true ? "Signed in" : accountLabel.textContent;
    await refreshAccount();
  } catch (error) {
    accountLabel.textContent = error.message || "Login failed";
  }
}

function openShow(id) {
  location.hash = `#/show/${encodeURIComponent(id)}`;
}

function closeShow() {
  location.hash = "";
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

function showCatalogResults() {
  if (catalogDetail) catalogDetail.hidden = true;
  if (searchList) searchList.hidden = false;
  if (catalogResultsHead) catalogResultsHead.hidden = !searchResults.length;
}

function showCatalogDetail() {
  if (catalogDetail) catalogDetail.hidden = false;
  if (searchList) searchList.hidden = true;
  if (catalogResultsHead) catalogResultsHead.hidden = true;
}

function renderSearch() {
  if (!searchResults.length) {
    searchList.innerHTML = "";
    if (catalogResultsHead) catalogResultsHead.hidden = true;
    return;
  }

  const movieCount = searchCounts?.movies ?? searchResults.filter((item) => !isCatalogTvItem(item)).length;
  const tvCount = searchCounts?.tv ?? searchResults.filter((item) => isCatalogTvItem(item)).length;
  if (catalogResultsSummary) {
    catalogResultsSummary.textContent = `${searchResults.length} title${searchResults.length === 1 ? "" : "s"} · ${movieCount} movie${movieCount === 1 ? "" : "s"} · ${tvCount} TV`;
  }
  if (catalogResultsHead) catalogResultsHead.hidden = Boolean(catalogDetail && catalogDetail.hidden === false);

  searchList.innerHTML = "";
  for (const movie of searchResults) {
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
    searchList.appendChild(card);
  }
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
  const preferred = list.find((season) => season.number === selectedSeason)?.number ?? list[0].number;
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
    allOption.textContent = episodes.length ? `All episodes (${episodes.length})` : "All episodes";
    catalogTvEpisodeSelect.appendChild(allOption);
    for (const episode of episodes) {
      const option = document.createElement("option");
      option.value = String(episode.episode || "");
      option.textContent = `${episodeCode(episode, season)} · ${episode.title || "Episode"}`;
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
      catalogTvEpisodeList.innerHTML = '<li class="catalog-tv-empty">No episodes found for this season.</li>';
    } else {
      catalogTvEpisodeList.replaceChildren();
      for (const episode of episodes) {
        const item = document.createElement("li");
        const code = document.createElement("span");
        code.className = "ep-code";
        code.textContent = episodeCode(episode, season);
        const title = document.createElement("span");
        title.className = "ep-title";
        title.textContent = episode.title || "Episode";
        item.append(code, title);
        catalogTvEpisodeList.appendChild(item);
      }
    }
  }
}

function getSelectedCatalogTvSeason() {
  const parsed = Number.parseInt(catalogTvSeasonSelect?.value, 10);
  if (parsed > 0) return parsed;
  return catalogTvSeasonOptions[0]?.number > 0 ? catalogTvSeasonOptions[0].number : 1;
}

function updateCatalogDetailActions(movie) {
  const isTv = isCatalogTvItem(movie);
  if (catalogAddQueue) {
    catalogAddQueue.textContent = isTv ? "Add Season to Queue" : "Add to Queue";
  }
  if (catalogTvPanel) catalogTvPanel.hidden = !isTv;
}

async function loadCatalogTvShow(movie, season = null) {
  const token = ++catalogTvScanToken;
  if (catalogDetailStatus) catalogDetailStatus.textContent = "Finding seasons and scanning episodes...";
  clearCatalogTvEpisodePanel("Loading seasons and episodes...");
  try {
    const params = new URLSearchParams({ url: movie.movieUrl });
    if (season) params.set("season", String(season));
    const result = await getJson(`/api/show?${params.toString()}`);
    if (token !== catalogTvScanToken) return { ok: false, cancelled: true };

    catalogTvSeasonOptions = result.seasons || [];
    renderSeasonSelect(catalogTvSeasonSelect, catalogTvSeasonOptions, result.season || season);
    tvShowPlan = result.plan || {
      showTitle: result.showTitle,
      season: result.season,
      showUrl: result.showUrl,
      posterUrl: result.posterUrl,
      episodes: result.episodes || []
    };
    renderCatalogTvEpisodePanel(tvShowPlan);
    const count = tvShowPlan.episodes?.length || 0;
    if (catalogDetailStatus) {
      catalogDetailStatus.textContent = count
        ? `${count} episode${count === 1 ? "" : "s"} found for season ${tvShowPlan.season || season || 1}.`
        : result.error || "No episodes found for this season.";
    }
    return result;
  } catch (error) {
    if (token !== catalogTvScanToken) return { ok: false, cancelled: true };
    clearCatalogTvEpisodePanel(error.message || "Could not scan this show.");
    if (catalogDetailStatus) catalogDetailStatus.textContent = error.message || "TV scan failed.";
    return { ok: false, error: error.message };
  }
}

async function openCatalogMovie(movie) {
  selectedCatalogMovie = movie;
  const isTv = isCatalogTvItem(movie);
  tvShowPlan = null;
  catalogTvScanToken += 1;
  if (catalogDetailTitle) catalogDetailTitle.textContent = movie.title || (isTv ? "TV Show" : "Movie");
  if (catalogDetailYear) {
    catalogDetailYear.textContent = [isTv ? "TV Show" : "Movie", movie.year].filter(Boolean).join(" · ");
  }
  if (catalogDetailStatus) {
    catalogDetailStatus.textContent = isTv
      ? "Loading seasons and episodes..."
      : "Ready to download or add to queue.";
  }
  renderCatalogPoster(catalogDetailPoster, movie, "catalog-detail-poster-fallback");
  updateCatalogDetailActions(movie);
  if (!isTv) {
    catalogTvSeasonOptions = [];
    if (catalogTvSeasonSelect) catalogTvSeasonSelect.replaceChildren();
    clearCatalogTvEpisodePanel();
  }
  showCatalogDetail();
  if (isTv) await loadCatalogTvShow(movie);
}

async function queueSelectedCatalog() {
  if (!selectedCatalogMovie?.movieUrl) {
    if (catalogDetailStatus) catalogDetailStatus.textContent = "Select a title from the catalog first.";
    return;
  }
  if (isCatalogTvItem(selectedCatalogMovie)) {
    const season = getSelectedCatalogTvSeason();
    if (!tvShowPlan?.episodes?.length || Number(tvShowPlan.season) !== Number(season)) {
      const scan = await loadCatalogTvShow(selectedCatalogMovie, season);
      if (!scan.ok && !tvShowPlan?.episodes?.length) return;
    }
    if (!tvShowPlan?.episodes?.length) {
      if (catalogDetailStatus) catalogDetailStatus.textContent = "Scan a TV show season first.";
      return;
    }
    try {
      const result = await postJson("/api/downloads", {
        episodes: tvShowPlan.episodes,
        showTitle: tvShowPlan.showTitle,
        posterUrl: tvShowPlan.posterUrl || selectedCatalogMovie.posterUrl
      });
      const added = result.added?.length || 0;
      if (catalogDetailStatus) {
        catalogDetailStatus.textContent = `Added ${added} episode${added === 1 ? "" : "s"} to the download queue.`;
      }
      await refreshJobs();
    } catch (error) {
      if (catalogDetailStatus) catalogDetailStatus.textContent = error.message || "Could not add episodes.";
    }
    return;
  }

  try {
    await postJson("/api/downloads", {
      movieUrl: selectedCatalogMovie.movieUrl,
      title: selectedCatalogMovie.title,
      posterUrl: selectedCatalogMovie.posterUrl
    });
    if (catalogDetailStatus) catalogDetailStatus.textContent = "Added to download queue.";
    await refreshJobs();
  } catch (error) {
    if (catalogDetailStatus) catalogDetailStatus.textContent = error.message || "Could not add to queue.";
  }
}

function compressStatusLabel(item) {
  const status = item?.compressStatus || "pending";
  if (status === "encoding") return "Encoding";
  if (status === "done") return item.originalKept ? "Compressed · original kept" : "Compressed · original discarded";
  if (status === "failed") return item.compressError ? `Failed · ${item.compressError}` : "Failed";
  if (status === "restored") return "Original restored";
  return "Waiting for encode worker";
}

function freezerCard(item, options = {}) {
  const isShow = item.kind === "tv-show" || options.isShow;
  const restore = item.originalKept
    ? `<button type="button" class="ghost freezer-btn" data-restore="${escapeAttr(item.id)}">Restore original</button>
       <button type="button" class="ghost freezer-btn" data-discard="${escapeAttr(item.id)}">Discard original</button>`
    : "";
  const poster = isShow
    ? `<button type="button" class="poster" style="${posterStyle(item.posterId)}" data-show="${escapeAttr(item.id)}">
          <em>Series</em>
          <span>${escapeHtml(item.title)}</span>
        </button>`
    : `<button type="button" class="poster" style="${posterStyle(item.posterId)}" data-play="${item.id}" data-title="${escapeAttr(item.title)}">
          <em data-kind="movie">Movie</em>
          <span>${escapeHtml(item.title)}</span>
        </button>`;
  return `
    <article class="library-card">
      ${poster}
      <p class="freezer-status">${escapeHtml(compressStatusLabel(item))}</p>
      <button type="button" class="ghost freezer-btn" data-thaw="${escapeAttr(item.id)}">Thaw</button>
      ${restore}
    </article>`;
}

function renderFreezerPage() {
  if (!freezerList) return;
  const q = (freezerFilter?.value || "").trim().toLowerCase();
  const matches = (title) => !q || String(title || "").toLowerCase().includes(q);
  const movies = (library.frozen?.movies || []).filter((item) => matches(item.title));
  const shows = (library.frozen?.shows || []).filter((show) => matches(show.title));
  const failed = [...movies, ...shows].filter((item) => item.compressStatus === "failed");
  if (freezerSummary) {
    freezerSummary.textContent = `${movies.length + shows.length} frozen`;
  }
  if (freezerFailed) {
    freezerFailed.hidden = !failed.length;
    freezerFailed.textContent = failed.length
      ? `${failed.length} encode failed — original playback was left untouched.`
      : "";
  }
  if (!movies.length && !shows.length) {
    freezerList.innerHTML = `<p class="empty">Nothing in Freezer yet. Use Put in Freezer on Library, then download the encode worker.</p>`;
    return;
  }
  const cards = [
    ...movies.map((item) => freezerCard(item)),
    ...shows.map((show) => freezerCard(show, { isShow: true }))
  ].join("");
  freezerList.innerHTML = `<div class="library">${cards}</div>`;
}

function libraryCard(item, options = {}) {
  const frozen = Boolean(options.frozen || item.frozen);
  const isShow = item.kind === "tv-show" || options.isShow;
  const action = frozen
    ? `<button type="button" class="ghost freezer-btn" data-thaw="${escapeAttr(item.id)}">Thaw</button>`
    : `<button type="button" class="ghost freezer-btn" data-freeze="${escapeAttr(item.id)}">Put in Freezer</button>`;
  if (isShow) {
    return `
      <article class="library-card">
        <button type="button" class="poster" style="${posterStyle(item.posterId)}" data-show="${escapeAttr(item.id)}">
          <em>Series</em>
          <span>${escapeHtml(item.title)}</span>
        </button>
        ${action}
      </article>`;
  }
  return `
    <article class="library-card">
      <button type="button" class="poster" style="${posterStyle(item.posterId)}" data-play="${item.id}" data-title="${escapeAttr(item.title)}">
        <em data-kind="movie">Movie</em>
        <span>${escapeHtml(item.title)}</span>
      </button>
      ${action}
    </article>`;
}

function renderLibrary() {
  const movies = (library.movies || []).filter((item) => matchesFilter(item.title));
  const shows = (library.shows || []).filter((show) => matchesFilter(show.title));
  const frozenCount = (library.frozen?.movieCount || 0) + (library.frozen?.showCount || 0);

  if (!movies.length && !shows.length && !frozenCount) {
    libraryList.innerHTML = `<p class="empty">No titles match. If this is empty after a scan, check that Docker mounted /Public/Videos.</p>
      <section class="freezer-section freezer-empty">
        <h2>Freezer</h2>
        <p class="muted">Pack titles away, then compress them on a PC.</p>
        <a class="ghost primary-action freezer-open" href="#/freezer">Open Freezer</a>
      </section>`;
    return;
  }

  const mainCards = [...movies.map((item) => libraryCard(item)), ...shows.map((show) => libraryCard(show, { isShow: true }))].join("");
  const mainGrid = mainCards ? `<div class="library">${mainCards}</div>` : "";
  const freezerSection = `<section class="freezer-section${frozenCount ? "" : " freezer-empty"}">
        <h2>Freezer</h2>
        <p class="muted">${frozenCount ? `${frozenCount} title${frozenCount === 1 ? "" : "s"} packed away.` : "Pack titles away to save space. Compress on another machine."}</p>
        <a class="ghost primary-action freezer-open" href="#/freezer">Open Freezer</a>
      </section>`;

  libraryList.innerHTML = `${mainGrid}${freezerSection}`;
}

function findShow(showId) {
  return (
    (library.shows || []).find((item) => item.id === showId) ||
    (library.frozen?.shows || []).find((item) => item.id === showId) ||
    null
  );
}

function renderShow(show) {
  showPoster.setAttribute("style", posterStyle(show.posterId));
  showPoster.innerHTML = `<em>Series</em>`;
  showTitle.textContent = show.title;
  showMeta.textContent = show.subtitle || `${show.episodeCount || show.episodes.length} episodes`;
  document.title = show.title;
  if (showFreezerAction) {
    showFreezerAction.hidden = false;
    if (show.frozen) {
      showFreezerAction.textContent = "Thaw";
      showFreezerAction.dataset.thaw = show.id;
      delete showFreezerAction.dataset.freeze;
    } else {
      showFreezerAction.textContent = "Put in Freezer";
      showFreezerAction.dataset.freeze = show.id;
      delete showFreezerAction.dataset.thaw;
    }
  }

  const bySeason = new Map();
  for (const episode of show.episodes || []) {
    const season = episode.season || 1;
    if (!bySeason.has(season)) bySeason.set(season, []);
    bySeason.get(season).push(episode);
  }

  episodeList.innerHTML = [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, episodes]) => {
      const rows = episodes
        .map(
          (episode) => `
          <button type="button" class="episode" data-play="${episode.id}" data-title="${escapeAttr(`${episodeCode(episode)} · ${episode.title}`)}">
            <span class="episode-code">${episodeCode(episode)}</span>
            <span class="episode-name">${escapeHtml(episode.title)}</span>
            <span class="kind">${formatBytes(episode.size)}</span>
          </button>`
        )
        .join("");
      return `<section class="season-block">
        <h2>Season ${season}</h2>
        <div class="episodes">${rows}</div>
      </section>`;
    })
    .join("");
}

function route() {
  const searching = isSearchHash();
  const freezer = isFreezerHash();
  const showId = showIdFromHash();
  tabLibrary.classList.toggle("is-active", !searching && !freezer && !showId);
  tabSearch.classList.toggle("is-active", searching);
  if (tabFreezer) tabFreezer.classList.toggle("is-active", freezer);

  if (searching) {
    viewLibrary.hidden = true;
    viewSearch.hidden = false;
    viewShow.hidden = true;
    if (viewFreezer) viewFreezer.hidden = true;
    document.title = "CinaRip · Search";
    return;
  }

  if (freezer) {
    viewLibrary.hidden = true;
    viewSearch.hidden = true;
    viewShow.hidden = true;
    if (viewFreezer) viewFreezer.hidden = false;
    renderFreezerPage();
    document.title = "CinaRip · Freezer";
    return;
  }

  if (!showId) {
    viewLibrary.hidden = false;
    viewSearch.hidden = true;
    viewShow.hidden = true;
    if (viewFreezer) viewFreezer.hidden = true;
    const frozenCount = (library.frozen?.movieCount || 0) + (library.frozen?.showCount || 0);
    const total = (library.movieCount || 0) + (library.showCount || 0) + frozenCount;
    document.title = total ? `CinaRip Library · ${total} titles` : "CinaRip Library";
    return;
  }

  const show = findShow(showId);
  if (!show) {
    statusEl.textContent = "Series not found.";
    closeShow();
    return;
  }

  viewLibrary.hidden = true;
  viewSearch.hidden = true;
  viewShow.hidden = false;
  if (viewFreezer) viewFreezer.hidden = true;
  renderShow(show);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function queueStatusLabel(item) {
  switch (item?.status) {
    case "loading":
      return "Loading";
    case "downloading":
      return item.progress ? `Downloading ${item.progress}%` : "Downloading";
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
  if (downloadQueueSummary) downloadQueueSummary.textContent = formatQueueSummary(snapshot);
  if (!downloadQueueList) return;
  downloadQueueList.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "download-queue-empty";
    empty.textContent = "Add titles, then click Download. Files are saved to the NAS.";
    downloadQueueList.appendChild(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement("li");
    row.className = `download-queue-item status-${item.status} kind-${item.kind === "episode" ? "episode" : "movie"}`;
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
    meta.textContent = `${item.kind === "episode" ? "TV" : "Movie"} · NAS`;

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
        try {
          await postJson("/api/downloads/remove", { id: item.id });
          await refreshJobs();
        } catch (error) {
          searchStatus.textContent = error.message || "Could not remove item.";
        }
      });
      row.appendChild(removeButton);
    }

    downloadQueueList.appendChild(row);
  }
}

function updateQueueControls(snapshot) {
  const running = Boolean(snapshot?.running);
  const hasWork = (snapshot?.counts?.pending || 0) > 0 || (snapshot?.counts?.failed || 0) > 0;
  if (startDownloadQueueButton) startDownloadQueueButton.disabled = running || !hasWork;
  if (stopDownloadQueueButton) stopDownloadQueueButton.hidden = !running;
  if (clearDownloadQueueButton) clearDownloadQueueButton.disabled = running;
}

function renderJobs(data) {
  lastQueueSnapshot = data;
  const current = data.current;
  const active = (data.items || []).filter((item) => item.status === "pending" || item.status === "loading" || item.status === "downloading");
  renderDownloadQueue(data);
  updateQueueControls(data);

  if (!current && !active.length) {
    jobCard.hidden = true;
    return;
  }

  const percent = current?.percent || 0;
  jobCard.hidden = false;
  jobTitle.textContent = current?.title || active[0]?.title || "Download";
  jobLabel.textContent = current ? `${percent}%` : `${active.length} queued`;
  jobBar.style.width = `${percent}%`;
  jobPhase.textContent = current?.phase || `${active.length} item${active.length === 1 ? "" : "s"} waiting`;
}

async function refreshJobs() {
  const data = await getJson("/api/downloads");
  renderJobs(data);
  const doneCount = (data.items || []).filter((item) => item.status === "done").length;
  if (doneCount > lastDoneCount) refreshLibrary().catch(() => {});
  lastDoneCount = doneCount;
}

const ACCOUNT_STATE_KEY = "cinarip.tornado.account";

function signedInLabel(data) {
  const name = data?.username || "";
  return `Signed in${name ? ` · ${name}` : ""}`;
}

function accountErrorEl() {
  return document.getElementById("account-error");
}

function setAccountError(message) {
  const el = accountErrorEl();
  if (!el) return;
  el.textContent = message || "";
  el.hidden = !message;
}

function persistAccountState(data) {
  if (!data || (data.loggedIn !== true && data.loggedIn !== false)) return;
  try {
    localStorage.setItem(
      ACCOUNT_STATE_KEY,
      JSON.stringify({
        loggedIn: data.loggedIn,
        username: data.username || "",
        hasCookies: Boolean(data.hasCookies),
        hasIdentity: Boolean(data.hasIdentity)
      })
    );
  } catch {
    // ignore quota / private mode
  }
}

function restoreAccountLabel() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCOUNT_STATE_KEY) || "null");
    if (saved?.loggedIn) {
      accountLabel.textContent = signedInLabel(saved);
      return;
    }
    if (saved?.hasIdentity || saved?.hasCookies) {
      accountLabel.textContent = "Restoring session…";
      return;
    }
  } catch {
    // ignore
  }
  accountLabel.textContent = "Checking…";
}

async function refreshAccount() {
  try {
    const data = await getJson("/api/tornado/status");
    if (data.loggedIn === true) {
      accountLabel.textContent = signedInLabel(data);
      persistAccountState(data);
      setAccountError("");
    } else if (data.loggedIn === false && data.ok !== false && data.confirmed !== false) {
      accountLabel.textContent = "Not signed in";
      persistAccountState(data);
      setAccountError("");
    } else {
      if (data.lastKnownLoggedIn || data.hasIdentity || data.hasCookies) {
        if (!/^Signed in/i.test(accountLabel.textContent || "")) {
          accountLabel.textContent = data.lastKnownLoggedIn ? signedInLabel(data) : "Restoring session…";
        }
      }
      setAccountError(data.error || "Could not confirm Tornado session.");
    }
    const panel = document.getElementById("login-open-panel");
    if (panel && data.loggedIn === true) {
      panel.hidden = true;
      stopLoginPoll();
    }
    wireBookmarklets().catch(() => {});
    return data;
  } catch (error) {
    const missing = /unknown api route/i.test(error.message || "");
    if (missing) {
      accountLabel.textContent = "Server not updated";
      searchStatus.textContent =
        "The website loaded, but Docker is still running the old server.js. Overwrite Public/cinarip/server.js from this PC, then run: sudo docker restart cinarip";
    } else {
      setAccountError(error.message || "Could not reach the NAS session check.");
    }
    return null;
  }
}

async function refreshLibrary() {
  const [health, lib] = await Promise.all([getJson("/api/health"), getJson("/api/library")]);
  library = lib;
  statusEl.textContent = health.videoRootExists
    ? `Online · ${health.memoryMb} MB RAM`
    : "Videos folder is not mounted";

  const frozenCount = (lib.frozen?.movieCount || 0) + (lib.frozen?.showCount || 0);
  summaryEl.textContent = lib.exists
    ? `${lib.movieCount} movies · ${lib.showCount} series · ${lib.episodeCount} episodes${
        frozenCount ? ` · ${frozenCount} in Freezer` : ""
      }`
    : "Mounted folder not found. In docker-compose, bind /share/Public/Videos.";

  if (lib.storage?.ok) {
    const pct = Math.min(100, lib.storage.usedPercent || 0);
    storageBar.style.width = `${pct}%`;
    storageLabel.textContent = `${pct.toFixed(0)}% used`;
  }

  renderLibrary();
  renderFreezerPage();
  route();
}

filterInput.addEventListener("input", renderLibrary);
if (freezerFilter) freezerFilter.addEventListener("input", renderFreezerPage);

async function runFreezerAction(action, id) {
  if (!id) return;
  try {
    statusEl.textContent = action === "thaw" ? "Thawing…" : "Moving to Freezer…";
    const result = await postJson(`/api/library/${action}`, { id });
    statusEl.textContent = result.message || (action === "thaw" ? "Thawed" : "Moved to Freezer");
    if (showIdFromHash()) closeShow();
    await refreshLibrary();
  } catch (error) {
    statusEl.textContent = error.message || "Freezer action failed";
  }
}

async function runFreezerOriginal(kind, id) {
  if (!id) return;
  try {
    statusEl.textContent = kind === "restore" ? "Restoring original…" : "Discarding original…";
    const result = await postJson(`/api/freezer/${kind === "restore" ? "restore-original" : "discard-original"}`, { id });
    statusEl.textContent = result.message || (kind === "restore" ? "Restored original" : "Original discarded");
    await refreshLibrary();
  } catch (error) {
    statusEl.textContent = error.message || "Freezer action failed";
  }
}

libraryList.addEventListener("click", (event) => {
  const freezeButton = event.target.closest("[data-freeze]");
  if (freezeButton) {
    event.preventDefault();
    runFreezerAction("freeze", freezeButton.dataset.freeze);
    return;
  }
  const thawButton = event.target.closest("[data-thaw]");
  if (thawButton) {
    event.preventDefault();
    runFreezerAction("thaw", thawButton.dataset.thaw);
    return;
  }
  const showButton = event.target.closest("[data-show]");
  if (showButton) {
    openShow(showButton.dataset.show);
    return;
  }
  const playButton = event.target.closest("[data-play]");
  if (playButton) play(playButton.dataset.play, playButton.dataset.title || "Playing");
});

if (freezerList) {
  freezerList.addEventListener("click", (event) => {
    const restoreButton = event.target.closest("[data-restore]");
    if (restoreButton) {
      event.preventDefault();
      runFreezerOriginal("restore", restoreButton.dataset.restore);
      return;
    }
    const discardButton = event.target.closest("[data-discard]");
    if (discardButton) {
      event.preventDefault();
      runFreezerOriginal("discard", discardButton.dataset.discard);
      return;
    }
    const thawButton = event.target.closest("[data-thaw]");
    if (thawButton) {
      event.preventDefault();
      runFreezerAction("thaw", thawButton.dataset.thaw);
      return;
    }
    const showButton = event.target.closest("[data-show]");
    if (showButton) {
      openShow(showButton.dataset.show);
      return;
    }
    const playButton = event.target.closest("[data-play]");
    if (playButton) play(playButton.dataset.play, playButton.dataset.title || "Playing");
  });
}

if (showFreezerAction) {
  showFreezerAction.addEventListener("click", () => {
    if (showFreezerAction.dataset.thaw) {
      runFreezerAction("thaw", showFreezerAction.dataset.thaw);
      return;
    }
    if (showFreezerAction.dataset.freeze) runFreezerAction("freeze", showFreezerAction.dataset.freeze);
  });
}

episodeList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-play]");
  if (!button) return;
  play(button.dataset.play, button.dataset.title || "Playing");
});

document.getElementById("catalog-back-results").addEventListener("click", () => {
  selectedCatalogMovie = null;
  showCatalogResults();
  renderSearch();
});

document.getElementById("catalog-add-queue").addEventListener("click", () => {
  queueSelectedCatalog();
});

document.getElementById("catalog-queue-all").addEventListener("click", async () => {
  if (!searchResults.length) {
    searchStatus.textContent = "No search results to queue.";
    return;
  }
  try {
    const result = await postJson("/api/downloads", { movies: searchResults });
    const added = result.added?.length || 0;
    searchStatus.textContent = `Added ${added} movie${added === 1 ? "" : "s"} to queue`;
    await refreshJobs();
  } catch (error) {
    searchStatus.textContent = error.message || "Could not queue movies.";
  }
});

catalogTvSeasonSelect.addEventListener("change", async () => {
  if (!selectedCatalogMovie || !isCatalogTvItem(selectedCatalogMovie)) return;
  await loadCatalogTvShow(selectedCatalogMovie, getSelectedCatalogTvSeason());
});

catalogTvEpisodeSelect.addEventListener("change", () => {
  const value = catalogTvEpisodeSelect.value;
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

startDownloadQueueButton.addEventListener("click", async () => {
  try {
    const result = await postJson("/api/downloads/start");
    if (!result.ok) searchStatus.textContent = result.error || "Could not start the queue.";
    await refreshJobs();
  } catch (error) {
    searchStatus.textContent = error.message || "Could not start the queue.";
  }
});

stopDownloadQueueButton.addEventListener("click", async () => {
  try {
    await postJson("/api/downloads/stop");
    await refreshJobs();
  } catch (error) {
    searchStatus.textContent = error.message || "Could not stop the queue.";
  }
});

clearDownloadQueueButton.addEventListener("click", async () => {
  try {
    await postJson("/api/downloads/clear");
    await refreshJobs();
  } catch (error) {
    searchStatus.textContent = error.message || "Could not clear the queue.";
  }
});

document.getElementById("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = document.getElementById("search-q").value.trim();
  if (!query) return;
  searchStatus.textContent = "Searching Tornado…";
  searchList.innerHTML = "";
  selectedCatalogMovie = null;
  showCatalogResults();
  try {
    const data = await getJson(`/api/search?q=${encodeURIComponent(query)}`);
    searchResults = data.movies || [];
    searchCounts = data.counts || null;
    const movieCount = searchCounts?.movies ?? searchResults.filter((item) => !isCatalogTvItem(item)).length;
    const tvCount = searchCounts?.tv ?? searchResults.filter((item) => isCatalogTvItem(item)).length;
    searchStatus.textContent = searchResults.length
      ? `${searchResults.length} title${searchResults.length === 1 ? "" : "s"} · ${movieCount} movie${movieCount === 1 ? "" : "s"} · ${tvCount} TV`
      : "No titles found.";
    renderSearch();
  } catch (error) {
    searchStatus.textContent = error.message || "Search failed.";
  }
});

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  openLoginWindow();
  accountLabel.textContent = "Copy _identity-frontend1 and advanced-frontend, then paste them here";
  showLoginHelper();
});

document.getElementById("cookie-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await postJson("/api/tornado/login", {
      cookie: document.getElementById("tornado-cookie").value.trim()
    });
    document.getElementById("tornado-cookie").value = "";
    await refreshAccount();
  } catch (error) {
    accountLabel.textContent = error.message || "Cookie save failed";
  }
});

document.getElementById("back-library").addEventListener("click", closeShow);
window.addEventListener("hashchange", () => {
  route();
  finishCaptchaLogin(recaptchaFromHash());
});
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin) return;
  if (event.data?.type === "cinarip-login" && event.data.ok) {
    stopLoginPoll();
    const panel = document.getElementById("login-open-panel");
    if (panel) panel.hidden = true;
    accountLabel.textContent = "Signed in";
    refreshAccount().catch(() => {});
  }
});

wireBookmarklets().catch(() => {});
restoreAccountLabel();
refreshLibrary().catch((error) => {
  statusEl.textContent = error.message || "Could not reach the NAS library.";
});
refreshAccount()
  .then(() => finishCaptchaLogin(recaptchaFromHash()))
  .catch(() => {});
refreshJobs().catch(() => {});

setInterval(() => {
  refreshJobs().catch(() => {});
  if (isFreezerHash()) refreshLibrary().catch(() => {});
}, 2000);
