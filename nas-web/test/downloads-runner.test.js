"use strict";

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DownloadRunner } = require("../lib/downloads");
const { DownloadQueue } = require("../lib/download-queue");

const MOVIE_URL = "https://www4.tornadomovies.co/movie/dune/abc123";
const EP_URL = "https://www4.tornadomovies.co/series/breaking-bad-season-1/id/ep01-watching.html";

function fakeClient(link = { ok: true, best: { url: "https://loadshare.org/download/x?name=Dune.mp4", qualityLabel: "1080p" } }) {
  return {
    findDirectLink: async () => link
  };
}

function makeRunner(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-runner-"));
  const videoRoot = path.join(dir, "videos");
  fs.mkdirSync(videoRoot);
  const runner = new DownloadRunner(overrides.client || fakeClient(), {
    queue: new DownloadQueue(),
    videoRoot,
    storePath: path.join(dir, "download-queue.json"),
    downloadFn:
      overrides.downloadFn ||
      (async ({ outputPath, onProgress }) => {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, Buffer.alloc(512, 1));
        if (onProgress) onProgress({ downloadedBytes: 50, totalBytes: 100 });
        return { outputPath, downloadedBytes: 100, totalBytes: 100 };
      })
  });
  return { runner, dir, videoRoot };
}

describe("DownloadRunner", () => {
  let tmp;

  afterEach(() => {
    if (tmp) {
      fs.rmSync(tmp, { recursive: true, force: true });
      tmp = null;
    }
  });

  it("does not start downloading until start() is called", () => {
    const { runner, dir } = makeRunner();
    tmp = dir;
    runner.enqueue({ movieUrl: MOVIE_URL, title: "Dune" });
    assert.equal(runner.queue.items[0].status, "pending");
    assert.equal(runner.queue.running, false);
    assert.equal(runner.status().counts.pending, 1);
  });

  it("runs one movie to done and writes progress fields", async () => {
    const { runner, dir, videoRoot } = makeRunner();
    tmp = dir;
    runner.enqueue({ movieUrl: MOVIE_URL, title: "Dune" });
    const started = runner.start();
    assert.equal(started.ok, true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const item = runner.queue.items[0];
    assert.equal(item.status, "done");
    assert.equal(item.progress, 100);
    assert.equal(item.qualityLabel, "1080p");
    assert.equal(runner.queue.running, false);
    assert.ok(fs.existsSync(path.join(videoRoot, "Dune.mp4")));
  });

  it("marks failed when the LoadShare lookup fails", async () => {
    const { runner, dir } = makeRunner({
      client: fakeClient({ ok: false, error: "No LoadShare download link found." })
    });
    tmp = dir;
    runner.enqueue({ movieUrl: MOVIE_URL, title: "Dune" });
    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(runner.queue.items[0].status, "failed");
    assert.match(runner.queue.items[0].error, /LoadShare/);
  });

  it("downloads TV episodes into TV Shows/Season folders", async () => {
    const { runner, dir, videoRoot } = makeRunner();
    tmp = dir;
    runner.enqueueEpisode(
      { url: EP_URL, season: 1, episode: 1, title: "Pilot" },
      { showTitle: "Breaking Bad" }
    );
    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const dest = path.join(videoRoot, "TV Shows", "Breaking Bad", "Season 01", "S01E01 - Pilot.mp4");
    assert.ok(fs.existsSync(dest));
    assert.equal(runner.queue.items[0].kind, "episode");
    assert.equal(runner.queue.items[0].status, "done");
  });

  it("processes the queue serially in order", async () => {
    const order = [];
    const { runner, dir } = makeRunner({
      client: {
        findDirectLink: async (movieUrl) => ({
          ok: true,
          best: {
            url: `https://loadshare.org/download/x?name=${/dune/i.test(movieUrl) ? "Dune" : "Oppenheimer"}.mp4`,
            qualityLabel: "1080p"
          }
        })
      },
      downloadFn: async ({ outputPath }) => {
        order.push(path.basename(outputPath));
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, Buffer.alloc(512, 1));
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { outputPath };
      }
    });
    tmp = dir;
    runner.enqueue({ movieUrl: MOVIE_URL, title: "Dune" });
    runner.enqueue({
      movieUrl: "https://www4.tornadomovies.co/movie/oppenheimer/def456",
      title: "Oppenheimer"
    });
    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.deepEqual(order, ["Dune.mp4", "Oppenheimer.mp4"]);
    assert.equal(runner.status().counts.done, 2);
  });

  it("stop() cancels the current HTTP download", async () => {
    let abortCalled = false;
    const { runner, dir } = makeRunner({
      downloadFn: async ({ abortRef }) => {
        abortRef.current = () => {
          abortCalled = true;
        };
        await new Promise((resolve) => setTimeout(resolve, 80));
        if (abortCalled) throw new Error("aborted");
        return { outputPath: "x" };
      }
    });
    tmp = dir;
    runner.enqueue({ movieUrl: MOVIE_URL, title: "Dune" });
    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    runner.stop();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(abortCalled, true);
    assert.equal(runner.queue.running, false);
    assert.equal(runner.queue.items[0].status, "failed");
    assert.match(runner.queue.items[0].error, /Cancel/i);
  });

  it("persists queue items across runner instances", () => {
    const { runner, dir } = makeRunner();
    tmp = dir;
    runner.enqueue({ movieUrl: MOVIE_URL, title: "Dune" });
    const storePath = path.join(dir, "download-queue.json");
    const again = new DownloadRunner(fakeClient(), {
      queue: new DownloadQueue(),
      videoRoot: path.join(dir, "videos"),
      storePath,
      downloadFn: async () => ({})
    });
    assert.equal(again.queue.items.length, 1);
    assert.equal(again.queue.items[0].title, "Dune");
    assert.equal(again.queue.items[0].status, "pending");
  });

  it("saves a movie poster sidecar next to the video", async () => {
    const { runner, dir, videoRoot } = makeRunner();
    tmp = dir;
    runner.enqueue({
      movieUrl: MOVIE_URL,
      title: "Dune",
      posterUrl: "https://cdn.example.com/dune-poster.jpg"
    });
    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(runner.queue.items[0].status, "done");
    assert.ok(fs.existsSync(path.join(videoRoot, "Dune-poster.jpg")));
    assert.ok(fs.existsSync(path.join(videoRoot, "Dune.jpg")));
  });

  it("saves a TV show poster.jpg even if artwork fetch is the same downloadFn", async () => {
    const { runner, dir, videoRoot } = makeRunner();
    tmp = dir;
    runner.enqueueEpisode(
      { url: EP_URL, season: 1, episode: 1, title: "Pilot", posterUrl: "https://cdn.example.com/bb.jpg" },
      { showTitle: "Breaking Bad" }
    );
    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(runner.queue.items[0].status, "done");
    assert.ok(fs.existsSync(path.join(videoRoot, "TV Shows", "Breaking Bad", "poster.jpg")));
  });

  it("still marks the movie done if artwork fails", async () => {
    const { runner, dir, videoRoot } = makeRunner({
      client: {
        findDirectLink: async () => ({
          ok: true,
          best: { url: "https://loadshare.org/download/x?name=Dune.mp4", qualityLabel: "1080p" }
        }),
        downloadToFile: async () => {
          throw new Error("poster blocked");
        }
      }
    });
    tmp = dir;
    runner.enqueue({
      movieUrl: MOVIE_URL,
      title: "Dune",
      posterUrl: "https://cdn.example.com/dune-poster.jpg"
    });
    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(runner.queue.items[0].status, "done");
    assert.ok(fs.existsSync(path.join(videoRoot, "Dune.mp4")));
    assert.equal(fs.existsSync(path.join(videoRoot, "Dune-poster.jpg")), false);
  });

  it("device downloads pick 720p and write outside the library", async () => {
    let requested;
    const { runner, dir, videoRoot } = makeRunner({
      client: {
        findDirectLink: async (movieUrl, options = {}) => {
          requested = options;
          return {
            ok: true,
            best: {
              url: "https://loadshare.org/download/x/720?name=Dune_720.mp4",
              height: 720,
              qualityLabel: "720p"
            }
          };
        }
      }
    });
    tmp = dir;
    runner.deviceRoot = path.join(dir, "device-downloads");
    runner.enqueue({ movieUrl: MOVIE_URL, title: "Dune", destination: "device" });
    assert.equal(runner.queue.items[0].destination, "device");
    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const item = runner.queue.items[0];
    assert.deepEqual(requested, { targetHeight: 720 });
    assert.equal(item.status, "done");
    assert.equal(item.qualityLabel, "720p");
    assert.equal(item.deviceFile, "Dune_720.mp4");
    assert.ok(fs.existsSync(path.join(runner.deviceRoot, "Dune_720.mp4")));
    assert.equal(fs.existsSync(path.join(videoRoot, "Dune_720.mp4")), false);
    assert.equal(fs.existsSync(path.join(videoRoot, "Dune.mp4")), false);
  });

  it("enqueueMany only queues movies from mixed search results", () => {
    const { runner, dir } = makeRunner();
    tmp = dir;
    const result = runner.enqueueMany([
      { kind: "movie", movieUrl: MOVIE_URL, title: "Dune" },
      { kind: "tv", movieUrl: "https://www4.tornadomovies.co/series/breaking-bad/id", title: "BB" }
    ]);
    assert.equal(result.ok, true);
    assert.equal(result.added.length, 1);
    assert.equal(runner.queue.items[0].kind, "movie");
  });
});
