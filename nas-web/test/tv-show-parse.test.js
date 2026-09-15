"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseTvShowPage,
  parseSeasonEpisode,
  episodeCode,
  buildTvShowPlan,
  normalizeEpisodeNumbers,
  guessSeasonHubUrls,
  guessShowHubUrls,
  seasonFromOptionLabel
} = require("../lib/tv-show-parse");
const { tvShowHtml, season2Html, hubShowHtml } = require("./fixtures");

const SHOW_URL = "https://www4.tornadomovies.co/series/breaking-bad-season-1/seasonId1";

describe("TV show episode list parsing", () => {
  it("parses seasons, posters, and SxxExx episode models from show HTML", () => {
    const scan = parseTvShowPage(tvShowHtml, SHOW_URL);
    assert.equal(scan.ok, true);
    assert.equal(scan.showTitle, "Breaking Bad");
    assert.equal(scan.posterUrl, "https://cdn.example.com/bb-poster.jpg");
    assert.equal(scan.season, 1);
    assert.ok(scan.seasons.some((season) => season.number === 1));
    assert.ok(scan.seasons.some((season) => season.number === 2));
    assert.equal(scan.episodeCount, 3);
    assert.equal(scan.episodes[0].season, 1);
    assert.equal(scan.episodes[0].episode, 1);
    assert.equal(scan.episodes[0].title, "Pilot");
    assert.match(scan.episodes[0].url, /ep01aaa-watching\.html$/);
    assert.equal(episodeCode(scan.episodes[0]), "S01E01");
    assert.equal(scan.episodes[1].title, "Cat's in the Bag...");
    assert.equal(scan.episodes[2].episode, 3);
  });

  it("does not include other shows or other seasons in the episode list", () => {
    const scan = parseTvShowPage(tvShowHtml, SHOW_URL);
    assert.equal(
      scan.episodes.some((episode) => episode.url.includes("better-call-saul")),
      false
    );
    assert.equal(
      scan.episodes.some((episode) => episode.url.includes("season-2")),
      false
    );
  });

  it("parses a different season page independently", () => {
    const scan = parseTvShowPage(season2Html, "https://www4.tornadomovies.co/series/breaking-bad-season-2/seasonId2", {
      season: 2
    });
    assert.equal(scan.season, 2);
    assert.equal(scan.episodes.length, 2);
    assert.equal(scan.episodes[0].title, "Seven Thirty-Seven");
    assert.equal(scan.episodes[0].season, 2);
    assert.equal(scan.episodes[1].episode, 2);
  });

  it("fills missing episode numbers in document order like the PC scraper", () => {
    const normalized = normalizeEpisodeNumbers(
      [
        { url: "b", title: "Second", season: 1, episode: 0 },
        { url: "a", title: "First", season: 1, episode: 0 }
      ],
      1
    );
    assert.equal(normalized[0].episode, 1);
    assert.equal(normalized[1].episode, 2);
  });

  it("parses season/episode tokens from labels", () => {
    assert.deepEqual(parseSeasonEpisode("S01E05 Pilot"), { season: 1, episode: 5 });
    assert.deepEqual(parseSeasonEpisode("1x08"), { season: 1, episode: 8 });
    assert.equal(parseSeasonEpisode("Episode 12").episode, 12);
  });

  it("builds a PC-shaped tvShowPlan", () => {
    const scan = parseTvShowPage(tvShowHtml, SHOW_URL);
    const plan = buildTvShowPlan(scan);
    assert.equal(plan.showTitle, "Breaking Bad");
    assert.equal(plan.season, 1);
    assert.equal(plan.episodes.length, 3);
    assert.ok(plan.scannedAt);
    assert.ok(Array.isArray(plan.notes));
  });

  it("finds hub-page episodes without -season-N in the show URL", () => {
    const scan = parseTvShowPage(hubShowHtml, "https://www4.tornadomovies.co/series/breaking-bad/showId111");
    assert.ok(scan.episodeCount >= 3, `expected hub episodes, got ${scan.episodeCount}`);
    assert.ok(scan.episodes.some((episode) => /ep01aaa-watching/.test(episode.url)));
    assert.ok(scan.episodes.some((episode) => /ep02bbb-watching/.test(episode.url)));
    assert.ok(scan.episodes.some((episode) => /ep03ccc-watching/.test(episode.url)));
    assert.equal(scan.episodes.some((episode) => episode.url.includes("better-call-saul")), false);
    assert.equal(scan.episodes.some((episode) => episode.url.includes("season-2")), false);
  });

  it("treats /episode/ paths as episode links", () => {
    const scan = parseTvShowPage(
      '<a href="/episode/breaking-bad-season-1/ep04id">Crazy Handful of Nothin</a>',
      SHOW_URL
    );
    assert.equal(scan.episodes.length, 1);
    assert.match(scan.episodes[0].url, /\/episode\/breaking-bad-season-1\/ep04id/);
  });

  it("collapses duplicate href, data-href, watching.html, and /episode/ links for the same SxxExx", () => {
    const html = `
      <h1>Breaking Bad</h1>
      <a data-href="/series/breaking-bad-season-1/seasonId1/ep01aaa-watching.html">Episode 01</a>
      <a href="/series/breaking-bad-season-1/seasonId1/ep01aaa-watching.html" title="S01E01 Pilot">Pilot</a>
      <a href="/episode/breaking-bad-season-1/ep01aaa">Episode 01</a>
      <a href="/episode/breaking-bad-season-1/otherid01">S01E01</a>
      <a href="/series/breaking-bad-season-1/seasonId1/ep02bbb-watching.html">Cat's in the Bag...</a>
    `;
    const scan = parseTvShowPage(html, SHOW_URL);
    assert.equal(scan.episodes.length, 2);
    assert.equal(scan.episodes[0].episode, 1);
    assert.equal(scan.episodes[0].title, "Pilot");
    assert.match(scan.episodes[0].url, /ep01aaa-watching\.html$/);
    assert.equal(scan.episodes[1].episode, 2);
    assert.equal(scan.episodes[1].title, "Cat's in the Bag...");
  });

  it("reads season URLs from option values and data-season tabs", () => {
    const scan = parseTvShowPage(
      `
        <h1>The Office</h1>
        <select id="season">
          <option value="/series/the-office-us-season-1/s1id">Season 1</option>
          <option value="/series/the-office-us-season-2/s2id">Season 2</option>
        </select>
        <a data-season="1" data-href="/series/the-office-us-season-1/s1id">Season 1</a>
      `,
      "https://www4.tornadomovies.co/series/the-office/showIdOffice"
    );
    const season1 = scan.seasons.find((entry) => entry.number === 1);
    const season2 = scan.seasons.find((entry) => entry.number === 2);
    assert.ok(season1?.url);
    assert.match(season1.url, /the-office-us-season-1\/s1id/);
    assert.match(season2.url, /the-office-us-season-2\/s2id/);
  });

  it("keeps episodes when the hub slug is a prefix of the season slug", () => {
    const scan = parseTvShowPage(
      `
        <h1>The Office</h1>
        <a href="/series/the-office-us-season-1/s1id/ep01-watching.html" title="S01E01 Pilot">Pilot</a>
        <a href="/series/lost-in-space-season-1/x/nope-watching.html">Wrong show</a>
      `,
      "https://www4.tornadomovies.co/series/the-office/showIdOffice"
    );
    assert.equal(scan.episodes.length, 1);
    assert.equal(scan.episodes[0].title, "Pilot");
    assert.match(scan.episodes[0].url, /the-office-us-season-1/);
  });

  it("finds onclick and JSON watching links", () => {
    const scan = parseTvShowPage(
      `
        <h1>Dark</h1>
        <button onclick="location.href='/series/dark-season-1/id/ep01-watching.html'">1</button>
        <script>var ep={"url":"\\/series\\/dark-season-1\\/id\\/ep02-watching.html"};</script>
      `,
      "https://www4.tornadomovies.co/series/dark/showIdDark"
    );
    assert.equal(scan.episodes.length, 2);
    assert.ok(scan.episodes.some((episode) => /ep01-watching/.test(episode.url)));
    assert.ok(scan.episodes.some((episode) => /ep02-watching/.test(episode.url)));
  });

  it("guesses /series/{slug}-season-N hubs when the option list has no href", () => {
    const urls = guessSeasonHubUrls(
      "https://www4.tornadomovies.co/series/dark/showIdDark",
      2,
      ""
    );
    assert.ok(urls.some((url) => /\/series\/dark-season-2$/.test(url)));
    assert.ok(urls.some((url) => /\/series\/dark-season-2\/showIdDark$/.test(url)));
  });

  it("parses bare option numbers and Season Three labels", () => {
    assert.equal(seasonFromOptionLabel("2"), 2);
    assert.equal(seasonFromOptionLabel("S3"), 3);
    assert.equal(seasonFromOptionLabel("Season Three"), 3);
    assert.equal(seasonFromOptionLabel("3rd Season"), 3);
    const scan = parseTvShowPage(
      `
        <h1>Attack on Titan</h1>
        <select id="season">
          <option>1</option>
          <option selected>2</option>
          <option>Season Three</option>
        </select>
        <a href="/series/attack-on-titan-season-2/s2id/ep01-watching.html">Episode 1</a>
      `,
      "https://www4.tornadomovies.co/series/attack-on-titan-season-2/s2id"
    );
    assert.deepEqual(
      scan.seasons.map((entry) => entry.number),
      [1, 2, 3]
    );
  });

  it("does not reuse another season's id when guessing a different season page", () => {
    const urls = guessSeasonHubUrls(
      "https://www4.tornadomovies.co/series/attack-on-titan-season-3/s3id",
      2,
      ""
    );
    assert.equal(urls.some((url) => /\/s3id$/.test(url)), false);
    assert.ok(urls.some((url) => /\/series\/attack-on-titan-season-2$/.test(url)));
    const hubs = guessShowHubUrls("https://www4.tornadomovies.co/series/attack-on-titan-season-3/s3id");
    assert.ok(hubs.some((url) => /\/series\/attack-on-titan$/.test(url)));
  });
});
