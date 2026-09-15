"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyContentUrl,
  canonicalMoviePageUrl,
  extractMovieIdFromUrl,
  extractDownloadIds,
  extractPageDownloadIds,
  mergeDownloadIds,
  extractEpisodeWatchId,
  isCatalogTvItem,
  isWatchingEpisodeUrl,
  episodeFileLabel,
  catalogCounts,
  titleFromUrl,
  canonicalContentUrl,
  toSeasonHubUrl,
  slugMatchesCurrentShow
} = require("../lib/content-url");

describe("content-url", () => {
  it("classifies movie pages like the PC scraper", () => {
    const result = classifyContentUrl("/movie/dune/abc123");
    assert.equal(result.kind, "movie");
    assert.match(result.canonical, /\/movie\/dune\/abc123$/);
  });

  it("classifies TV series, tv, serie, and series paths as tv", () => {
    for (const href of [
      "/series/breaking-bad/showId",
      "/tv-series/the-last-of-us/id",
      "/tv/slow-horses/id",
      "/serie/dark/id"
    ]) {
      const result = classifyContentUrl(href);
      assert.equal(result.kind, "tv", href);
      assert.ok(result.canonical.includes(href.replace(/^\//, "")), href);
    }
  });

  it("keeps at most four TV path segments", () => {
    const result = classifyContentUrl(
      "/series/breaking-bad-season-1/seasonId/ep01-watching.html"
    );
    assert.equal(result.kind, "tv");
    assert.match(result.canonical, /\/series\/breaking-bad-season-1\/seasonId\/ep01-watching.html$/);
  });

  it("extracts movie ids and watching ids the same way as desktop", () => {
    assert.equal(extractMovieIdFromUrl("https://www4.tornadomovies.co/movie/dune/abc123"), "abc123");
    assert.equal(
      extractEpisodeWatchId("/series/breaking-bad-season-1/id/bnlun6q0-watching.html"),
      "bnlun6q0"
    );
    assert.ok(isWatchingEpisodeUrl("/series/foo-season-1/id/x-watching.html"));
  });

  it("prefers watching ids in extractDownloadIds", () => {
    const ids = extractDownloadIds(
      "https://www4.tornadomovies.co/series/breaking-bad-season-1/NXRv9c1C/bnlun6q0-watching.html"
    );
    assert.equal(ids[0], "bnlun6q0");
    assert.ok(ids.includes("NXRv9c1C"));
  });

  it("builds SxxExx labels and catalog counts like the PC UI", () => {
    assert.equal(episodeFileLabel(1, 4), "S01E04");
    const items = [
      { kind: "movie", movieUrl: "/movie/a/1" },
      { kind: "tv", movieUrl: "/series/b/2" },
      { movieUrl: "/series/c/3" }
    ];
    assert.equal(isCatalogTvItem(items[1]), true);
    assert.equal(isCatalogTvItem(items[0]), false);
    assert.deepEqual(catalogCounts(items), { total: 3, movies: 1, tv: 2 });
  });

  it("titles from slugs match the PC titleFromUrl helper", () => {
    assert.equal(titleFromUrl("/movie/dune-part-two/id", "movie"), "Dune Part Two");
    assert.equal(titleFromUrl("/series/breaking-bad-season-1/id", "tv"), "Breaking Bad");
  });

  it("canonical movie helper rejects incomplete movie urls", () => {
    assert.equal(canonicalMoviePageUrl("/movie/dune"), null);
    assert.ok(canonicalMoviePageUrl("/movie/dune/abc123"));
  });

  it("canonical content url preserves watching episode paths", () => {
    const url =
      "https://www4.tornadomovies.co/series/breaking-bad-season-1/NXRv9c1C/bnlun6q0-watching.html";
    assert.equal(canonicalContentUrl(url), url);
  });

  it("strips watching pages to a season hub and keeps tv-series prefix", () => {
    assert.equal(
      toSeasonHubUrl(
        "https://www4.tornadomovies.co/tv-series/the-last-of-us-season-1/abc/ep01-watching.html"
      ),
      "https://www4.tornadomovies.co/tv-series/the-last-of-us-season-1/abc"
    );
    assert.equal(
      toSeasonHubUrl("https://www4.tornadomovies.co/series/breaking-bad-season-1"),
      "https://www4.tornadomovies.co/series/breaking-bad-season-1"
    );
  });

  it("matches hub slugs to longer season slugs without mixing unrelated shows", () => {
    assert.equal(
      slugMatchesCurrentShow("/series/the-office-us-season-1/id", "the-office"),
      true
    );
    assert.equal(
      slugMatchesCurrentShow(
        "/series/sword-art-online-alicization-war-of-underworld-season-1/id",
        "sword-art-online-alicization-war-of-underworld-sub-eng"
      ),
      true
    );
    assert.equal(slugMatchesCurrentShow("/series/better-call-saul-season-1/id", "breaking-bad"), false);
    assert.equal(slugMatchesCurrentShow("/series/lost-in-space-season-1/id", "lost"), false);
  });

  it("reads play_button data-id from movie HTML like the PC scraper", () => {
    const html = `
      <div id="player_block_wrap" data-mid="59821">
        <a class="play_button" data-id="lotrFellowshipId99">Play</a>
      </div>
      <script>jQuery.get("/getdownload/nestedApiId55/true")</script>
    `;
    const ids = extractPageDownloadIds(html);
    assert.ok(ids.includes("lotrFellowshipId99"));
    assert.ok(ids.includes("59821"));
    assert.ok(ids.includes("nestedApiId55"));
  });

  it("puts page download ids ahead of URL ids", () => {
    const merged = mergeDownloadIds(["pageIdAAAA"], extractDownloadIds("/movie/dune/urlIdBBBB"));
    assert.equal(merged[0], "pageIdAAAA");
    assert.ok(merged.includes("urlIdBBBB"));
  });
});
