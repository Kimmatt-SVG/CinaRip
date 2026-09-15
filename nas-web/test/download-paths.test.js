"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  fileNameFromLink,
  episodeFileName,
  movieOutputPath,
  episodeOutputPath
} = require("../lib/download-paths");

describe("HTTP download filename and path helpers", () => {
  it("uses the LoadShare name query when present", () => {
    const name = fileNameFromLink(
      "https://loadshare.org/download/file?name=Dune_2021_1080p.mkv&token=1",
      "Ignored"
    );
    assert.equal(name, "Dune_2021_1080p.mp4");
  });

  it("falls back to a slug from the title", () => {
    assert.equal(fileNameFromLink("https://loadshare.org/download/x", "Dune Part Two"), "dune-part-two.mp4");
  });

  it("strips illegal filename characters from LoadShare names", () => {
    const name = fileNameFromLink("https://loadshare.org/download/x?name=Foo<>Bar.mp4", "x");
    assert.equal(name, "Foo_Bar.mp4");
  });

  it("builds PC-matching TV episode paths under TV Shows/Season NN", () => {
    const dest = episodeOutputPath("/data/videos", {
      showTitle: "Breaking Bad",
      season: 1,
      episode: 1,
      episodeTitle: "Pilot"
    });
    assert.equal(
      dest,
      path.join("/data/videos", "TV Shows", "Breaking Bad", "Season 01", "S01E01 - Pilot.mp4")
    );
  });

  it("sanitizes show folders and episode titles", () => {
    assert.equal(episodeFileName(2, 3, "Grilled"), "S02E03 - Grilled.mp4");
    assert.equal(episodeFileName(2, 3, "Hello/World"), "S02E03 - Hello_World.mp4");
    const dest = episodeOutputPath("/videos", {
      showTitle: "Show: A/B",
      season: 12,
      episode: 8,
      episodeTitle: "Hello/World"
    });
    assert.ok(dest.includes("Show_ A_B"));
    assert.ok(dest.includes("Season 12"));
    assert.ok(dest.endsWith("S12E08 - Hello_World.mp4"));
  });

  it("places movies in the video root", () => {
    assert.equal(movieOutputPath("/data/videos", "dune.mp4"), path.join("/data/videos", "dune.mp4"));
  });
});
