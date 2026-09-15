const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("streamApp", {
  getPlaylists: () => ipcRenderer.invoke("get-playlists"),
  scanDirectDownloads: () => ipcRenderer.invoke("scan-direct-downloads"),
  clearPlaylists: () => ipcRenderer.invoke("clear-playlists"),
  diagnoseStreams: () => ipcRenderer.invoke("diagnose-streams"),
  openStreamDebugLog: () => ipcRenderer.invoke("open-stream-debug-log"),
  getEnvironment: () => ipcRenderer.invoke("get-environment"),
  chooseFolder: (options) => ipcRenderer.invoke("choose-folder", options || {}),
  saveMediaFolders: (payload) => ipcRenderer.invoke("save-media-folders", payload),
  getFolderStorage: (payload) => ipcRenderer.invoke("get-folder-storage", payload || {}),
  navigate: (url) => ipcRenderer.invoke("navigate", url),
  reloadPage: () => ipcRenderer.invoke("reload-page"),
  goHome: (options) => ipcRenderer.invoke("go-home", options || {}),
  getSiteCredentials: () => ipcRenderer.invoke("get-site-credentials"),
  saveSiteCredentials: (payload) => ipcRenderer.invoke("save-site-credentials", payload),
  siteLogin: () => ipcRenderer.invoke("site-login"),
  setCatalogBrowserLocked: (locked = true) => ipcRenderer.invoke("set-catalog-browser-locked", locked),
  searchMovies: (query) => ipcRenderer.invoke("search-movies", query),
  catalogOpenMovie: (payload) => ipcRenderer.invoke("catalog-open-movie", payload),
  downloadMovie: (payload) => ipcRenderer.invoke("download-movie", payload),
  addMovieToQueue: (payload) => ipcRenderer.invoke("add-movie-to-queue", payload),
  reloadCurrentPage: () => ipcRenderer.invoke("reload-current-page"),
  getNavigationState: () => ipcRenderer.invoke("get-navigation-state"),
  goBack: () => ipcRenderer.invoke("go-back"),
  goForward: () => ipcRenderer.invoke("go-forward"),
  downloadCurrentStream: () => ipcRenderer.invoke("download-current-stream"),
  saveToNas: () => ipcRenderer.invoke("save-to-nas"),
  syncMoviesToNas: () => ipcRenderer.invoke("sync-movies-to-nas"),
  getDownloadQueue: () => ipcRenderer.invoke("get-download-queue"),
  getQueueDebug: () => ipcRenderer.invoke("get-queue-debug"),
  addCurrentToQueue: (destination = "local") => ipcRenderer.invoke("add-current-to-queue", destination),
  addSearchResultsToQueue: (destination = "local", movies = null) =>
    ipcRenderer.invoke("add-search-results-to-queue", destination, movies),
  removeFromQueue: (id) => ipcRenderer.invoke("remove-from-queue", id),
  clearDownloadQueue: () => ipcRenderer.invoke("clear-download-queue"),
  startDownloadQueue: (destination = "local") => ipcRenderer.invoke("start-download-queue", destination),
  stopDownloadQueue: () => ipcRenderer.invoke("stop-download-queue"),
  discoverTvSeasons: (url) => ipcRenderer.invoke("discover-tv-seasons", url),
  prepareTvShow: (url, season) =>
    ipcRenderer.invoke("prepare-tv-show", { url, season: season ?? null }),
  scanTvShow: (url, season) =>
    ipcRenderer.invoke(
      "scan-tv-show",
      url
        ? { url, season: season ?? null }
        : season != null
          ? { season }
          : null
    ),
  getTvShowPlan: () => ipcRenderer.invoke("get-tv-show-plan"),
  clearTvShowPlan: () => ipcRenderer.invoke("clear-tv-show-plan"),
  addTvPlanToQueue: (destination = "local") => ipcRenderer.invoke("add-tv-plan-to-queue", destination),
  addCurrentEpisodeToQueue: (destination = "local") =>
    ipcRenderer.invoke("add-current-episode-to-queue", destination),
  startTvShowDownload: (destination = "local") => ipcRenderer.invoke("start-tv-show-download", destination),
  stopTvShowDownload: () => ipcRenderer.invoke("stop-tv-show-download"),
  getNasCredentials: () => ipcRenderer.invoke("get-nas-credentials"),
  connectNas: () => ipcRenderer.invoke("connect-nas"),
  saveNasCredentials: (payload) => ipcRenderer.invoke("save-nas-credentials", payload),
  openNasPortal: () => ipcRenderer.invoke("open-nas-portal"),
  downloadStatus: () => ipcRenderer.invoke("download-status"),
  clearDownloadJob: () => ipcRenderer.invoke("clear-download-job"),
  setProgressDockHeight: (height) => ipcRenderer.invoke("set-progress-dock-height", height),
  setChromeLayout: (layout) => ipcRenderer.invoke("set-chrome-layout", layout),
  stopDownload: () => ipcRenderer.invoke("stop-download"),
  openOutputFolder: () => ipcRenderer.invoke("open-output-folder"),
  getDownloadedMovies: (options) => ipcRenderer.invoke("get-downloaded-movies", options || {}),
  openDownloadedMovie: (filePath) => ipcRenderer.invoke("open-downloaded-movie", filePath),
  revealDownloadedMovie: (filePath) => ipcRenderer.invoke("reveal-downloaded-movie", filePath),
  embedMoviePoster: (filePath) => ipcRenderer.invoke("embed-movie-poster", filePath),
  openLibraryFolder: (location) => ipcRenderer.invoke("open-library-folder", location),
  openWarpDownload: () => ipcRenderer.invoke("open-warp-download"),
  openAnimeWindow: () => ipcRenderer.invoke("open-anime-window"),
  installWarpVpn: () => ipcRenderer.invoke("install-warp-vpn"),
  onPageLoadFailed: (callback) => {
    const listener = (_event, details) => callback(details);
    ipcRenderer.on("page-load-failed", listener);
    return () => ipcRenderer.removeListener("page-load-failed", listener);
  },
  onPageLoadSucceeded: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("page-load-succeeded", listener);
    return () => ipcRenderer.removeListener("page-load-succeeded", listener);
  },
  onBrowserContentVisible: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("browser-content-visible", listener);
    return () => ipcRenderer.removeListener("browser-content-visible", listener);
  },
  onGatewayRetry: (callback) => {
    const listener = (_event, details) => callback(details);
    ipcRenderer.on("gateway-retry", listener);
    return () => ipcRenderer.removeListener("gateway-retry", listener);
  },
  onPageGatewayFailed: (callback) => {
    const listener = (_event, details) => callback(details);
    ipcRenderer.on("page-gateway-failed", listener);
    return () => ipcRenderer.removeListener("page-gateway-failed", listener);
  },
  onNavigationStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("navigation-state-changed", listener);
    return () => ipcRenderer.removeListener("navigation-state-changed", listener);
  },
  onRedirectBlocked: (callback) => {
    const listener = (_event, details) => callback(details);
    ipcRenderer.on("redirect-blocked", listener);
    return () => ipcRenderer.removeListener("redirect-blocked", listener);
  },
  onShowSearchLanding: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("show-search-landing", listener);
    return () => ipcRenderer.removeListener("show-search-landing", listener);
  },
  onStreamCaptureReset: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("stream-capture-reset", listener);
    return () => ipcRenderer.removeListener("stream-capture-reset", listener);
  },
  onDirectDownloadFound: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("direct-download-found", listener);
    return () => ipcRenderer.removeListener("direct-download-found", listener);
  },
  onStreamDebugReport: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("stream-debug-report", listener);
    return () => ipcRenderer.removeListener("stream-debug-report", listener);
  },
  onLibrarySyncProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("library-sync-progress", listener);
    return () => ipcRenderer.removeListener("library-sync-progress", listener);
  },
  onDownloadQueueUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("download-queue-updated", listener);
    return () => ipcRenderer.removeListener("download-queue-updated", listener);
  },
  onQueueDebug: (callback) => {
    const listener = (_event, entry) => callback(entry);
    ipcRenderer.on("queue-debug", listener);
    return () => ipcRenderer.removeListener("queue-debug", listener);
  },
  onTvShowUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("tv-show-updated", listener);
    return () => ipcRenderer.removeListener("tv-show-updated", listener);
  },
  onSiteLoginResult: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on("site-login-result", listener);
    return () => ipcRenderer.removeListener("site-login-result", listener);
  },
  onSiteLoginDebug: (callback) => {
    const listener = (_event, entry) => callback(entry);
    ipcRenderer.on("site-login-debug", listener);
    return () => ipcRenderer.removeListener("site-login-debug", listener);
  },
  getSiteLoginDebug: () => ipcRenderer.invoke("get-site-login-debug")
});
