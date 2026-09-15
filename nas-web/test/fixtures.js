"use strict";

const movieSearchHtml = `
<section class="film_list">
  <div class="poster" data-name="Dune (2021)" data-img="https://cdn.example.com/dune.jpg" data-href="/movie/dune/abc123MovieId">
    <a href="/movie/dune/abc123MovieId" title="Watch Dune Online">
      <img src="https://cdn.example.com/dune.jpg" alt="Dune">
    </a>
  </div>
  <div class="poster" data-name="Dune Part Two (2024)" data-img="https://cdn.example.com/dune2.jpg">
    <a href="https://www4.tornadomovies.co/movie/dune-part-two/def456MovieId">
      <img data-src="https://cdn.example.com/dune2.jpg" alt="Dune Part Two">
    </a>
  </div>
  <a href="/movie/incomplete-slug">Skip me</a>
</section>
`;

const mixedSearchHtml = `
<div class="item flw-item">
  <a href="/movie/oppenheimer/movieId789" title="Oppenheimer">
    <img src="https://cdn.example.com/opp.jpg" alt="Oppenheimer">
  </a>
  <span>2023</span>
</div>
<div class="poster tv" data-name="Breaking Bad" data-img="https://cdn.example.com/bb.jpg">
  <a href="/series/breaking-bad/showId111">
    <img alt="Breaking Bad">
  </a>
</div>
<div class="poster" data-name="The Last of Us (2023)">
  <a href="/tv-series/the-last-of-us/showId222">The Last of Us</a>
</div>
<div class="card">
  <a href="/tv/slow-horses/showId333" title="Slow Horses">Slow Horses</a>
</div>
<div class="card">
  <a href="/serie/dark/showId444">Dark</a>
</div>
`;

const tvShowHtml = `
<!doctype html>
<html>
  <head>
    <meta property="og:title" content="Breaking Bad - Season 1">
    <meta property="og:image" content="https://cdn.example.com/bb-poster.jpg">
    <title>Breaking Bad | Tornado</title>
  </head>
  <body>
    <h1>Breaking Bad</h1>
    <select id="season">
      <option>Season 1</option>
      <option>Season 2</option>
    </select>
    <a href="/series/breaking-bad-season-1/seasonId1">Season 1</a>
    <a href="/series/breaking-bad-season-2/seasonId2">Season 2</a>
    <a href="/series/better-call-saul-season-1/otherId">Season 1</a>
    <ul class="episodes">
      <li><a href="/series/breaking-bad-season-1/seasonId1/ep01aaa-watching.html" title="S01E01 Pilot">Pilot</a></li>
      <li><a href="/series/breaking-bad-season-1/seasonId1/ep02bbb-watching.html">Cat's in the Bag...</a></li>
      <li><a href="/series/breaking-bad-season-1/seasonId1/ep03ccc-watching.html">Episode 3</a></li>
      <li><a href="/series/breaking-bad-season-2/seasonId2/ep01ddd-watching.html">Season 2 Episode 1</a></li>
    </ul>
  </body>
</html>
`;

const season2Html = `
<html>
  <head><meta property="og:title" content="Breaking Bad"></head>
  <body>
    <h1>Breaking Bad - Season 2</h1>
    <a href="/series/breaking-bad-season-1/seasonId1">Season 1</a>
    <a href="/series/breaking-bad-season-2/seasonId2">Season 2</a>
    <a href="/series/breaking-bad-season-2/seasonId2/s02e01-watching.html">Seven Thirty-Seven</a>
    <a href="/series/breaking-bad-season-2/seasonId2/s02e02-watching.html">Grilled</a>
  </body>
</html>
`;

const hubShowHtml = `
<html>
  <body>
    <h1>Breaking Bad</h1>
    <a href="/series/breaking-bad-season-1/seasonId1">Season 1</a>
    <a href="/series/breaking-bad/showId111/ep01aaa-watching.html" title="S01E01 Pilot">Pilot</a>
    <a data-href="/series/breaking-bad/showId111/ep02bbb-watching.html">Cat's in the Bag...</a>
    <script>var ep="\\/series\\/breaking-bad\\/showId111\\/ep03ccc-watching.html";</script>
    <a href="/episode/breaking-bad-season-1/ep04id">Episode 4</a>
    <a href="/series/better-call-saul/other/x-watching.html">Wrong show</a>
    <a href="/series/breaking-bad-season-2/seasonId2/s02e01-watching.html">S2</a>
  </body>
</html>
`;

module.exports = {
  movieSearchHtml,
  mixedSearchHtml,
  tvShowHtml,
  season2Html,
  hubShowHtml
};
