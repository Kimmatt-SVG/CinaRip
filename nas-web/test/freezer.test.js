"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  toPosixRel,
  isFrozenRel,
  classifyLibraryRel,
  classifyLibraryRels,
  freezerMovieDest,
  thawMovieDest,
  freezerShowDest,
  thawShowDest,
  freezerDestForRel,
  thawDestForRel,
  sidecarPathsForVideo,
  moveVideoWithSidecars,
  freezeMovie,
  thawMovie,
  freezeShow,
  thawShow,
  restoreOriginal,
  discardOriginal,
  readCompressSidecar,
  writeCompressSidecar,
  compressInfoForVideo,
  writableNasError,
  isOriginalVideoName,
  ORIGINALS_DIR
} = require("../lib/freezer");

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-freezer-"));
}

function writeFile(filePath, bytes = 2048) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.alloc(bytes, 7));
}

describe("freezer path helpers", () => {
  it("builds movie and show freeze/thaw destinations", () => {
    const root = "/data/videos";
    assert.equal(freezerMovieDest(root, "Dune.mp4"), path.join(root, "Freezer", "Dune.mp4"));
    assert.equal(thawMovieDest(root, "Dune.mp4"), path.join(root, "Dune.mp4"));
    assert.equal(
      freezerShowDest(root, "Breaking Bad"),
      path.join(root, "Freezer", "TV Shows", "Breaking Bad")
    );
    assert.equal(thawShowDest(root, "Breaking Bad"), path.join(root, "TV Shows", "Breaking Bad"));
  });

  it("maps relative library paths into Freezer without losing Season NN", () => {
    const root = "/data/videos";
    assert.equal(freezerDestForRel(root, "Heat.mp4"), path.join(root, "Freezer", "Heat.mp4"));
    assert.equal(
      freezerDestForRel(root, "TV Shows/The Wire/Season 01/S01E01 - Pilot.mp4"),
      path.join(root, "Freezer", "TV Shows", "The Wire", "Season 01", "S01E01 - Pilot.mp4")
    );
    assert.equal(
      thawDestForRel(root, "Freezer/Heat.mp4"),
      path.join(root, "Heat.mp4")
    );
    assert.equal(
      thawDestForRel(root, "Freezer/TV Shows/The Wire/Season 01/S01E01 - Pilot.mp4"),
      path.join(root, "TV Shows", "The Wire", "Season 01", "S01E01 - Pilot.mp4")
    );
  });

  it("treats Freezer/ as frozen and not as a normal movie folder", () => {
    assert.equal(isFrozenRel("Freezer/Heat.mp4"), true);
    assert.equal(isFrozenRel("Heat.mp4"), false);
    assert.equal(isFrozenRel("TV Shows/The Wire/Season 01/S01E01.mp4"), false);
    assert.equal(isFrozenRel("Freezer/TV Shows/The Wire/Season 01/S01E01.mp4"), true);
    assert.equal(classifyLibraryRel("Dune.mp4").kind, "movie");
    assert.equal(classifyLibraryRel("Dune.mp4").frozen, false);
    assert.equal(classifyLibraryRel("Freezer/Dune.mp4").frozen, true);
    assert.equal(classifyLibraryRel("Freezer/Dune.mp4").kind, "movie");
    assert.equal(classifyLibraryRel("TV Shows/Breaking Bad/Season 01/S01E01.mp4").kind, "tv");
    assert.equal(classifyLibraryRel("Freezer/TV Shows/Breaking Bad/Season 01/S01E01.mp4").kind, "tv");
    assert.equal(classifyLibraryRel("Freezer/TV Shows/Breaking Bad/Season 01/S01E01.mp4").frozen, true);
  });

  it("does not duplicate a fully frozen show into the main library lists", () => {
    const grouped = classifyLibraryRels([
      "Dune.mp4",
      "Freezer/Heat.mp4",
      "TV Shows/Breaking Bad/Season 01/S01E01.mp4",
      "TV Shows/Breaking Bad/Season 01/S01E02.mp4",
      "Freezer/TV Shows/The Wire/Season 01/S01E01.mp4",
      "Freezer/TV Shows/The Wire/Season 01/S01E02.mp4"
    ]);
    assert.deepEqual(grouped.movies, ["Dune.mp4"]);
    assert.deepEqual(grouped.frozenMovies, ["Freezer/Heat.mp4"]);
    assert.equal(grouped.shows.length, 1);
    assert.equal(grouped.shows[0].title, "Breaking Bad");
    assert.equal(grouped.frozenShows.length, 1);
    assert.equal(grouped.frozenShows[0].title, "The Wire");
    assert.equal(
      grouped.shows.some((show) => show.title === "The Wire"),
      false
    );
    assert.equal(
      grouped.frozenShows.some((show) => show.title === "Breaking Bad"),
      false
    );
  });

  it("normalizes mixed slashes in relative paths", () => {
    assert.equal(toPosixRel("Freezer\\Heat.mp4"), "Freezer/Heat.mp4");
    assert.equal(isFrozenRel("Freezer\\TV Shows\\The Wire\\Season 01\\ep.mp4"), true);
  });
});

describe("freezer move with poster sidecars", () => {
  it("moves a movie and its -poster.jpg / .jpg siblings", () => {
    const root = makeRoot();
    const src = path.join(root, "Heat.mp4");
    const poster = path.join(root, "Heat-poster.jpg");
    const sibling = path.join(root, "Heat.jpg");
    const folderPoster = path.join(root, "poster.jpg");
    writeFile(src);
    writeFile(poster, 512);
    writeFile(sibling, 512);
    writeFile(folderPoster, 512);

    const dest = path.join(root, "Freezer", "Heat.mp4");
    const result = moveVideoWithSidecars(src, dest);

    assert.equal(fs.existsSync(src), false);
    assert.equal(fs.existsSync(dest), true);
    assert.ok(fs.statSync(dest).size > 0);
    assert.equal(fs.existsSync(path.join(root, "Freezer", "Heat-poster.jpg")), true);
    assert.equal(fs.existsSync(path.join(root, "Freezer", "Heat.jpg")), true);
    assert.equal(fs.existsSync(poster), false);
    assert.equal(fs.existsSync(sibling), false);
    assert.equal(fs.existsSync(folderPoster), true);
    assert.equal(sidecarPathsForVideo(dest).length, 2);
    assert.equal(result.posters.length, 2);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("freeze and thaw without encoding on the NAS", () => {
  it("freezes a movie as a move and writes a pending sidecar", async () => {
    const root = makeRoot();
    writeFile(path.join(root, "Dune.mp4"));
    writeFile(path.join(root, "Dune-poster.jpg"), 400);
    const result = await freezeMovie(root, "Dune.mp4");
    assert.equal(result.ok, true);
    assert.equal(result.compressed, false);
    assert.equal(result.compressStatus, "pending");
    assert.match(result.reason, /encode worker/);
    assert.equal(result.rel, "Freezer/Dune.mp4");
    assert.equal(fs.existsSync(path.join(root, "Dune.mp4")), false);
    assert.equal(fs.existsSync(path.join(root, "Freezer", "Dune.mp4")), true);
    assert.equal(fs.existsSync(path.join(root, "Freezer", "Dune-poster.jpg")), true);
    assert.equal(readCompressSidecar(path.join(root, "Freezer", "Dune.mp4")).status, "pending");

    const thawed = await thawMovie(root, "Freezer/Dune.mp4");
    assert.equal(thawed.ok, true);
    assert.equal(thawed.rel, "Dune.mp4");
    assert.equal(fs.existsSync(path.join(root, "Dune.mp4")), true);
    assert.equal(fs.existsSync(path.join(root, "Dune-poster.jpg")), true);
    assert.equal(fs.existsSync(path.join(root, "Freezer", "Dune.mp4")), false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("moves a TV show folder under Freezer/TV Shows and keeps Season NN", async () => {
    const root = makeRoot();
    const episode = path.join(root, "TV Shows", "The Wire", "Season 01", "S01E01 - Pilot.mp4");
    const poster = path.join(root, "TV Shows", "The Wire", "poster.jpg");
    writeFile(episode);
    writeFile(poster, 400);
    const result = await freezeShow(root, ["TV Shows/The Wire/Season 01/S01E01 - Pilot.mp4"], {
      showTitle: "The Wire"
    });
    assert.equal(result.ok, true);
    assert.equal(result.compressed, false);
    assert.equal(result.rel, "Freezer/TV Shows/The Wire");
    assert.equal(
      fs.existsSync(path.join(root, "Freezer", "TV Shows", "The Wire", "Season 01", "S01E01 - Pilot.mp4")),
      true
    );
    assert.equal(fs.existsSync(path.join(root, "Freezer", "TV Shows", "The Wire", "poster.jpg")), true);
    assert.equal(fs.existsSync(path.join(root, "TV Shows", "The Wire")), false);
    assert.equal(
      readCompressSidecar(
        path.join(root, "Freezer", "TV Shows", "The Wire", "Season 01", "S01E01 - Pilot.mp4")
      ).status,
      "pending"
    );

    const thawed = await thawShow(
      root,
      ["Freezer/TV Shows/The Wire/Season 01/S01E01 - Pilot.mp4"],
      { showTitle: "The Wire" }
    );
    assert.equal(thawed.ok, true);
    assert.equal(
      fs.existsSync(path.join(root, "TV Shows", "The Wire", "Season 01", "S01E01 - Pilot.mp4")),
      true
    );
    assert.equal(fs.existsSync(path.join(root, "Freezer", "TV Shows", "The Wire")), false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("thaws a compressed movie and keeps the original as a sibling without mixing Season folders", async () => {
    const root = makeRoot();
    writeFile(path.join(root, "Heat.mp4"), 4096);
    await freezeMovie(root, "Heat.mp4");
    const playback = path.join(root, "Freezer", "Heat.mp4");
    const vault = path.join(root, "Freezer", ORIGINALS_DIR, "Heat.mp4");
    writeFile(vault, 4096);
    fs.writeFileSync(playback, Buffer.alloc(512, 3));
    writeCompressSidecar(playback, {
      status: "done",
      originalKept: true,
      originalRel: "Freezer/.originals/Heat.mp4"
    });

    const thawed = await thawMovie(root, "Freezer/Heat.mp4");
    assert.equal(thawed.rel, "Heat.mp4");
    assert.equal(thawed.originalKept, true);
    assert.equal(thawed.qualityRestored, false);
    assert.equal(fs.statSync(path.join(root, "Heat.mp4")).size, 512);
    assert.equal(fs.existsSync(path.join(root, "Heat.original.mp4")), true);
    assert.equal(fs.statSync(path.join(root, "Heat.original.mp4")).size, 4096);
    assert.equal(fs.existsSync(path.join(root, "TV Shows")), false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("restores original bytes when they were kept, and thaw does not claim quality restore after discard", async () => {
    const root = makeRoot();
    writeFile(path.join(root, "Dune.mp4"), 4096);
    await freezeMovie(root, "Dune.mp4");
    const playback = path.join(root, "Freezer", "Dune.mp4");
    const vault = path.join(root, "Freezer", ORIGINALS_DIR, "Dune.mp4");
    writeFile(vault, 4096);
    fs.writeFileSync(playback, Buffer.alloc(200, 9));
    writeCompressSidecar(playback, {
      status: "done",
      originalKept: true,
      originalRel: "Freezer/.originals/Dune.mp4"
    });

    const restored = restoreOriginal(root, "Freezer/Dune.mp4");
    assert.equal(restored.ok, true);
    assert.equal(restored.qualityRestored, true);
    assert.equal(fs.statSync(playback).size, 4096);
    assert.equal(fs.existsSync(vault), false);
    assert.equal(readCompressSidecar(playback).status, "restored");

    writeFile(path.join(root, "Clip.mp4"), 3000);
    await freezeMovie(root, "Clip.mp4");
    const clip = path.join(root, "Freezer", "Clip.mp4");
    const clipOrig = path.join(root, "Freezer", ORIGINALS_DIR, "Clip.mp4");
    writeFile(clipOrig, 3000);
    fs.writeFileSync(clip, Buffer.alloc(100, 1));
    writeCompressSidecar(clip, { status: "done", originalKept: true, originalRel: "Freezer/.originals/Clip.mp4" });
    const discarded = discardOriginal(root, "Freezer/Clip.mp4");
    assert.equal(discarded.originalKept, false);
    assert.equal(fs.existsSync(clipOrig), false);
    const thawed = await thawMovie(root, "Freezer/Clip.mp4");
    assert.equal(thawed.qualityRestored, false);
    assert.equal(fs.statSync(path.join(root, "Clip.mp4")).size, 100);
    assert.equal(isOriginalVideoName("Clip.original.mp4"), true);
    assert.equal(compressInfoForVideo(root, "Clip.mp4").originalKept, false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("maps EACCES to a writable Videos message", () => {
    const err = new Error("EACCES: permission denied");
    err.code = "EACCES";
    assert.match(writableNasError(err).message, /not writable/);
  });
});
