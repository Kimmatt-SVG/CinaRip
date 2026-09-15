"use strict";

const path = require("path");
const { episodeFileLabel, safeShowFolderName } = require("./content-url");

function fileNameFromLink(url, title) {
  try {
    const name = new URL(url).searchParams.get("name");
    if (name) {
      const base = path.basename(name, path.extname(name));
      return `${base.replace(/[<>:"/\\|?*]+/g, "_")}.mp4`;
    }
  } catch {
    // fall through
  }
  const slug = String(title || "movie")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${slug || "movie"}.mp4`;
}

function episodeFileName(season, episode, episodeTitle) {
  const label = episodeFileLabel(season, episode || 1);
  const title = String(episodeTitle || "Episode").replace(/[<>:"/\\|?*]+/g, "_");
  return `${label} - ${title}.mp4`;
}

function movieOutputPath(videoRoot, fileName) {
  return path.join(videoRoot, fileName);
}

function episodeOutputPath(videoRoot, item = {}) {
  const showTitle = safeShowFolderName(item.showTitle || "TV Show");
  const season = Number(item.season) || 1;
  const seasonLabel = `Season ${String(season).padStart(2, "0")}`;
  const fileName = episodeFileName(season, item.episode, item.episodeTitle || item.title);
  return path.join(videoRoot, "TV Shows", showTitle, seasonLabel, fileName);
}

module.exports = {
  fileNameFromLink,
  episodeFileName,
  movieOutputPath,
  episodeOutputPath
};
