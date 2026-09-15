const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const {
  findPosterForVideo,
  posterPathForVideo,
  relatedPosterFiles
} = require("./poster-utils");

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".m4v", ".webm", ".ts"]);
const MIN_VIDEO_BYTES = 100 * 1024;
const MAX_POSTER_DATA_BYTES = 1.5 * 1024 * 1024;
const EPISODE_NAME_PATTERN = /\bS(\d{1,2})\s*E(\d{1,3})\b/i;
const SEASON_FOLDER_PATTERN = /^season\s*(\d{1,2})$/i;

function isVideoFile(name) {
  return VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function titleFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  const cleaned = base
    .replace(/[-_]+/g, " ")
    .replace(/\s+\d{3,}$/, "")
    .trim();

  if (!cleaned) return base;

  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function mimeForPoster(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function posterUrlForPath(posterPath) {
  if (!posterPath) return null;
  try {
    const stat = fs.statSync(posterPath);
    if (!stat.isFile() || stat.size <= 0) return null;
    if (stat.size <= MAX_POSTER_DATA_BYTES) {
      const buffer = fs.readFileSync(posterPath);
      return `data:${mimeForPoster(posterPath)};base64,${buffer.toString("base64")}`;
    }
    return pathToFileURL(posterPath).href;
  } catch {
    return null;
  }
}

function findShowPoster(showFolder) {
  if (!showFolder) return null;
  const candidates = [
    path.join(showFolder, "poster.jpg"),
    path.join(showFolder, "poster.jpeg"),
    path.join(showFolder, "poster.png"),
    path.join(showFolder, "poster.webp"),
    path.join(showFolder, "folder.jpg"),
    path.join(showFolder, "cover.jpg"),
    path.join(showFolder, `${path.basename(showFolder)}.jpg`),
    path.join(showFolder, `${path.basename(showFolder)}-poster.jpg`)
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // try next
    }
  }
  return null;
}

function ensureShowPoster(show) {
  const existing = findShowPoster(show.folderPath);
  if (existing) return existing;

  for (const episode of show.episodes || []) {
    const episodePoster = findPosterForVideo(episode.filePath);
    if (!episodePoster) continue;
    const target = path.join(show.folderPath || path.dirname(episode.filePath), "poster.jpg");
    try {
      if (show.folderPath) {
        fs.copyFileSync(episodePoster, target);
        return target;
      }
    } catch {
      return episodePoster;
    }
    return episodePoster;
  }

  return null;
}

function parseEpisodeMeta(filePath, rootFolder) {
  const fileName = path.basename(filePath);
  const relative = path.relative(rootFolder, filePath);
  const parts = relative.split(/[/\\]/).filter(Boolean);
  const episodeMatch = fileName.match(EPISODE_NAME_PATTERN);

  let showTitle = null;
  let season = episodeMatch ? Number.parseInt(episodeMatch[1], 10) : 0;
  let episode = episodeMatch ? Number.parseInt(episodeMatch[2], 10) : 0;
  let showFolder = null;

  const tvRootIdx = parts.findIndex((part) => /^(tv shows|anime|series)$/i.test(part));
  if (tvRootIdx >= 0 && parts.length > tvRootIdx + 1) {
    showTitle = parts[tvRootIdx + 1];
    showFolder = path.join(rootFolder, ...parts.slice(0, tvRootIdx + 2));
    if (parts.length > tvRootIdx + 2) {
      const seasonMatch = parts[tvRootIdx + 2].match(SEASON_FOLDER_PATTERN);
      if (seasonMatch) season = Number.parseInt(seasonMatch[1], 10) || season;
    }
  } else {
    const seasonIdx = parts.findIndex((part) => SEASON_FOLDER_PATTERN.test(part));
    if (seasonIdx > 0) {
      showTitle = parts[seasonIdx - 1];
      showFolder = path.join(rootFolder, ...parts.slice(0, seasonIdx));
      season = Number.parseInt(parts[seasonIdx].match(SEASON_FOLDER_PATTERN)[1], 10) || season;
    } else if (episodeMatch && parts.length >= 2 && !/^freezer$/i.test(parts[parts.length - 2])) {
      // e.g. Videos/Breaking Bad/S03E01....mp4
      showTitle = parts[parts.length - 2];
      showFolder = path.join(rootFolder, ...parts.slice(0, -1));
    }
  }

  if (!showTitle && !episodeMatch) return null;

  if (!showTitle) {
    showTitle = titleFromFilename(fileName)
      .replace(EPISODE_NAME_PATTERN, "")
      .replace(/\bEpisode\s*\d+\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim() || "TV Show";
  }

  return {
    kind: "episode",
    showTitle: String(showTitle).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim(),
    showFolder,
    season: season || 1,
    episode: episode || 0,
    title: titleFromFilename(fileName)
  };
}

function isFrozenLibraryPath(filePath, rootFolder) {
  const rel = path.relative(rootFolder, filePath);
  const parts = String(rel || "").split(/[/\\]/).filter(Boolean);
  return /^freezer$/i.test(parts[0] || "");
}

function groupLibraryEntries(rawMovies, rootFolder) {
  const shows = new Map();
  const movies = [];

  for (const item of rawMovies) {
    const tv = parseEpisodeMeta(item.filePath, rootFolder);
    const frozen = isFrozenLibraryPath(item.filePath, rootFolder);
    if (!tv) {
      movies.push({ ...item, kind: "movie", frozen });
      continue;
    }

    const key = `${frozen ? "frozen:" : ""}${tv.showTitle.toLowerCase()}`;
    let show = shows.get(key);
    if (!show) {
      show = {
        kind: "tv-show",
        id: `show-${key.replace(/[^a-z0-9]+/g, "-")}`,
        title: tv.showTitle,
        showTitle: tv.showTitle,
        frozen,
        folderPath: tv.showFolder || path.dirname(item.filePath),
        filePath: tv.showFolder || path.dirname(item.filePath),
        seasons: new Set(),
        episodes: [],
        size: 0,
        modifiedAt: 0,
        posterUrl: null,
        posterPath: null
      };
      shows.set(key, show);
    }

    show.episodes.push({
      kind: "episode",
      filePath: item.filePath,
      fileName: item.fileName,
      title: item.title,
      season: tv.season,
      episode: tv.episode,
      size: item.size,
      modifiedAt: item.modifiedAt,
      posterUrl: item.posterUrl
    });
    show.seasons.add(tv.season);
    show.size += item.size;
    show.modifiedAt = Math.max(show.modifiedAt, item.modifiedAt);
    if (!show.posterUrl && item.posterUrl) show.posterUrl = item.posterUrl;
    if (tv.showFolder && (!show.folderPath || show.folderPath.length > tv.showFolder.length)) {
      show.folderPath = tv.showFolder;
      show.filePath = tv.showFolder;
    }
  }

  const showEntries = [...shows.values()].map((show) => {
    const posterPath = ensureShowPoster(show);
    const posterUrl = posterUrlForPath(posterPath) || show.posterUrl;
    const seasons = [...show.seasons].sort((a, b) => a - b);
    show.episodes.sort((a, b) => {
      if (a.season !== b.season) return a.season - b.season;
      return (a.episode || 0) - (b.episode || 0);
    });
    return {
      kind: "tv-show",
      id: show.id,
      title: show.title,
      showTitle: show.showTitle,
      frozen: Boolean(show.frozen),
      folderPath: show.folderPath,
      filePath: show.filePath,
      episodeCount: show.episodes.length,
      seasonCount: seasons.length,
      seasons,
      episodes: show.episodes,
      size: show.size,
      modifiedAt: show.modifiedAt,
      posterUrl,
      subtitle: `${show.episodes.length} episode${show.episodes.length === 1 ? "" : "s"} · ${seasons.length} season${seasons.length === 1 ? "" : "s"}`
    };
  });

  const entries = [...movies, ...showEntries];
  entries.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return entries;
}

function scanMoviesFolder(folderPath, location, options = {}) {
  const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : 5;

  if (!folderPath) {
    return {
      location,
      folderPath: "",
      exists: false,
      accessible: true,
      error: null,
      movies: [],
      entries: [],
      movieCount: 0,
      showCount: 0,
      episodeCount: 0
    };
  }

  if (!fs.existsSync(folderPath)) {
    return {
      location,
      folderPath,
      exists: false,
      accessible: true,
      error: null,
      movies: [],
      entries: [],
      movieCount: 0,
      showCount: 0,
      episodeCount: 0
    };
  }

  const rawMovies = [];

  const walk = (dir, depth) => {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch (error) {
      if (depth === 0) {
        throw error;
      }
      return;
    }

    for (const name of names) {
      const filePath = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        if (depth < maxDepth) walk(filePath, depth + 1);
        continue;
      }

      if (!stat.isFile() || !isVideoFile(name) || stat.size < MIN_VIDEO_BYTES) continue;

      const posterPath = findPosterForVideo(filePath);
      rawMovies.push({
        filePath,
        fileName: name,
        title: titleFromFilename(name),
        size: stat.size,
        modifiedAt: stat.mtimeMs,
        posterUrl: posterUrlForPath(posterPath)
      });
    }
  };

  try {
    walk(folderPath, 0);
  } catch (error) {
    return {
      location,
      folderPath,
      exists: true,
      accessible: false,
      error: error.message,
      movies: [],
      entries: [],
      movieCount: 0,
      showCount: 0,
      episodeCount: 0
    };
  }

  const entries = groupLibraryEntries(rawMovies, folderPath);
  const movieCount = entries.filter((entry) => entry.kind === "movie").length;
  const showCount = entries.filter((entry) => entry.kind === "tv-show").length;
  const episodeCount = entries
    .filter((entry) => entry.kind === "tv-show")
    .reduce((sum, show) => sum + (show.episodeCount || 0), 0);

  return {
    location,
    folderPath,
    exists: true,
    accessible: true,
    error: null,
    // Keep `movies` as the grouped library entries for existing UI callers.
    movies: entries,
    entries,
    movieCount,
    showCount,
    episodeCount
  };
}

function listDownloadedMovies({ localDir, nasDir }) {
  const local = scanMoviesFolder(localDir, "local");
  const nas = scanMoviesFolder(nasDir, "nas");
  const movieCount = local.movieCount + nas.movieCount;
  const showCount = local.showCount + nas.showCount;
  const episodeCount = local.episodeCount + nas.episodeCount;

  return {
    local,
    nas,
    totalCount: movieCount + showCount,
    movieCount,
    showCount,
    episodeCount
  };
}

module.exports = {
  listDownloadedMovies,
  scanMoviesFolder,
  titleFromFilename,
  posterPathForVideo,
  findPosterForVideo,
  relatedPosterFiles,
  posterUrlForPath,
  findShowPoster,
  groupLibraryEntries,
  parseEpisodeMeta,
  isFrozenLibraryPath
};
