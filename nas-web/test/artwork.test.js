"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  posterPathForVideo,
  mediaServerPosterPath,
  pickArtworkUrlFromHtml,
  showFolderFromEpisodePath,
  saveArtworkFromUrl,
  saveShowPoster,
  isUsableArtworkUrl
} = require("../lib/artwork");

describe("artwork sidecars", () => {
  it("names movie posters next to the video like the PC app", () => {
    const video = path.join("/data/videos", "the-return-of-the-king.mp4");
    assert.equal(posterPathForVideo(video), path.join("/data/videos", "the-return-of-the-king-poster.jpg"));
    assert.equal(mediaServerPosterPath(video), path.join("/data/videos", "the-return-of-the-king.jpg"));
  });

  it("picks og:image from movie HTML", () => {
    const html = `
      <meta property="og:image" content="https://cdn.example.com/lotr-poster.jpg">
      <img class="film-poster" src="/tiny.png">
    `;
    assert.equal(
      pickArtworkUrlFromHtml(html, "https://www4.tornadomovies.co/movie/lotr/1"),
      "https://cdn.example.com/lotr-poster.jpg"
    );
  });

  it("rejects junk artwork urls", () => {
    assert.equal(isUsableArtworkUrl("https://x/favicon.ico"), false);
    assert.equal(isUsableArtworkUrl("data:image/png;base64,xx"), false);
    assert.equal(isUsableArtworkUrl("https://cdn.example.com/poster.jpg"), true);
  });

  it("finds the TV show folder from an episode path", () => {
    const episode = path.join("/data/videos", "TV Shows", "Breaking Bad", "Season 01", "S01E01 - Pilot.mp4");
    assert.equal(
      showFolderFromEpisodePath(episode, "/data/videos"),
      path.join("/data/videos", "TV Shows", "Breaking Bad")
    );
  });

  it("writes movie -poster.jpg and a media-server sibling", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-art-"));
    const video = path.join(dir, "Dune.mp4");
    fs.writeFileSync(video, "video");
    const saved = await saveArtworkFromUrl("https://cdn.example.com/dune.jpg", video, {
      downloadToFile: async ({ outputPath }) => {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, Buffer.alloc(512, 7));
      }
    });
    assert.equal(saved, path.join(dir, "Dune-poster.jpg"));
    assert.ok(fs.existsSync(path.join(dir, "Dune-poster.jpg")));
    assert.ok(fs.existsSync(path.join(dir, "Dune.jpg")));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes TV show poster.jpg in the show folder", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-showart-"));
    const showFolder = path.join(dir, "TV Shows", "Breaking Bad");
    const saved = await saveShowPoster("https://cdn.example.com/bb.jpg", showFolder, {
      downloadToFile: async ({ outputPath }) => {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, Buffer.alloc(512, 9));
      }
    });
    assert.equal(saved, path.join(showFolder, "poster.jpg"));
    assert.ok(fs.existsSync(path.join(showFolder, "poster.jpg")));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
