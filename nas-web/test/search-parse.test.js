"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseSearchResults, parseSearchHtml, cleanTitle, yearFromText, diagnoseSearchHtml } = require("../lib/search-parse");
const { movieSearchHtml, mixedSearchHtml } = require("./fixtures");

describe("search HTML parsing", () => {
  it("parses movie cards with posters, titles, years, and canonical urls", () => {
    const result = parseSearchResults(movieSearchHtml);
    assert.equal(result.ok, true);
    assert.equal(result.movies.length, 2);
    assert.equal(result.counts.movies, 2);
    assert.equal(result.counts.tv, 0);

    const dune = result.movies.find((item) => item.movieUrl.includes("/movie/dune/"));
    assert.ok(dune);
    assert.equal(dune.kind, "movie");
    assert.equal(dune.title, "Dune (2021)");
    assert.equal(dune.year, "2021");
    assert.equal(dune.posterUrl, "https://cdn.example.com/dune.jpg");
    assert.match(dune.movieUrl, /\/movie\/dune\/abc123MovieId$/);
  });

  it("skips incomplete movie urls without an id segment", () => {
    const movies = parseSearchHtml(movieSearchHtml);
    assert.equal(movies.some((item) => item.movieUrl.includes("incomplete")), false);
  });

  it("parses mixed movie and TV results with PC field shapes", () => {
    const result = parseSearchResults(mixedSearchHtml);
    assert.equal(result.counts.total, 5);
    assert.equal(result.counts.movies, 1);
    assert.equal(result.counts.tv, 4);

    for (const item of result.movies) {
      assert.ok(["movie", "tv"].includes(item.kind));
      assert.ok(item.movieUrl);
      assert.ok(item.title);
      assert.equal("year" in item || item.year === undefined, true);
    }

    const movie = result.movies.find((item) => item.kind === "movie");
    assert.ok(movie);
    assert.match(movie.movieUrl, /\/movie\/oppenheimer\//);
    assert.equal(movie.title, "Oppenheimer");
    assert.equal(movie.year, "2023");
    assert.equal(movie.posterUrl, "https://cdn.example.com/opp.jpg");

    const tv = result.movies.filter((item) => item.kind === "tv");
    assert.ok(tv.some((item) => /\/series\/breaking-bad\//.test(item.movieUrl)));
    assert.ok(tv.some((item) => /\/tv-series\/the-last-of-us\//.test(item.movieUrl)));
    assert.ok(tv.some((item) => /\/tv\/slow-horses\//.test(item.movieUrl)));
    assert.ok(tv.some((item) => /\/serie\/dark\//.test(item.movieUrl)));

    const lastOfUs = tv.find((item) => item.movieUrl.includes("the-last-of-us"));
    assert.equal(lastOfUs.year, "2023");
    assert.equal(lastOfUs.kind, "tv");
  });

  it("merges duplicate hrefs, preferring posters and real titles", () => {
    const html = `
      <a href="/movie/dune/abc123">Watch Dune Online in HD</a>
      <div class="poster" data-name="Dune" data-img="https://cdn.example.com/dune.jpg">
        <a href="/movie/dune/abc123"><img alt="Dune"></a>
      </div>
    `;
    const movies = parseSearchHtml(html);
    assert.equal(movies.length, 1);
    assert.equal(movies[0].title, "Dune");
    assert.equal(movies[0].posterUrl, "https://cdn.example.com/dune.jpg");
  });

  it("cleans titles and years the same way as the PC scraper", () => {
    assert.equal(cleanTitle("Watch Dune Online in HD"), "Dune");
    assert.equal(cleanTitle("Slow Horses | Tornado Movies"), "Slow Horses");
    assert.equal(yearFromText("The Last of Us (2023) HD"), "2023");
    assert.equal(yearFromText("no year here"), "");
  });

  it("resolves relative poster urls against the Tornado origin", () => {
    const html = `
      <div class="poster" data-name="Dune" data-img="/static/dune.jpg">
        <a href="/movie/dune/abc123"></a>
      </div>
    `;
    const [movie] = parseSearchHtml(html);
    assert.equal(movie.posterUrl, "https://www4.tornadomovies.co/static/dune.jpg");
  });

  it("parses hrefs with escaped slashes", () => {
    const html = `<a href="https://www4.tornadomovies.co\\/movie\\/dune-part-two\\/def456MovieId">Two</a>`;
    const movies = parseSearchHtml(html);
    assert.ok(movies.some((item) => item.movieUrl.includes("/movie/dune-part-two/def456MovieId")));
  });

  it("diagnoses Cloudflare and login walls when no titles are present", () => {
    assert.match(diagnoseSearchHtml("<html>Just a moment... cf-browser-verification</html>"), /Cloudflare/i);
    assert.match(diagnoseSearchHtml("<html><a href='/user/login'>Sign in</a></html>"), /signed-in/i);
    assert.equal(diagnoseSearchHtml(movieSearchHtml), "");
  });
});
