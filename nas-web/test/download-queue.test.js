"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DownloadQueue, sanitizeQueueItem } = require("../lib/download-queue");
const { loadQueueState, saveQueueState } = require("../lib/queue-store");

const MOVIE_A = "https://www4.tornadomovies.co/movie/dune/abc123";
const MOVIE_B = "https://www4.tornadomovies.co/movie/oppenheimer/def456";
const EP_URL = "https://www4.tornadomovies.co/series/breaking-bad-season-1/id/ep01-watching.html";

describe("download queue", () => {
  it("enqueues movies in insertion order with pending status", () => {
    const queue = new DownloadQueue();
    const first = queue.add(MOVIE_A, { title: "Dune" });
    const second = queue.add(MOVIE_B, { title: "Oppenheimer" });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(queue.items[0].title, "Dune");
    assert.equal(queue.items[1].title, "Oppenheimer");
    assert.equal(queue.items[0].status, "pending");
    assert.equal(queue.items[0].kind, "movie");
    assert.equal(queue.items[0].destination, "nas");
    assert.equal(queue.items[0].progress, 0);
  });

  it("rejects duplicate pending movie urls", () => {
    const queue = new DownloadQueue();
    assert.equal(queue.add(MOVIE_A).ok, true);
    const dup = queue.add(MOVIE_A);
    assert.equal(dup.ok, false);
    assert.match(dup.error, /already in the queue/i);
    assert.equal(queue.items.length, 1);
  });

  it("allows re-queueing a movie after it is done", () => {
    const queue = new DownloadQueue();
    const added = queue.add(MOVIE_A);
    queue.markDone(added.item.id);
    const again = queue.add(MOVIE_A, { title: "Dune" });
    assert.equal(again.ok, true);
    assert.equal(queue.items.length, 2);
  });

  it("rejects invalid movie urls", () => {
    const queue = new DownloadQueue();
    const result = queue.add("/series/breaking-bad/id");
    assert.equal(result.ok, false);
  });

  it("enqueues TV episodes with PC title shape and duplicate URL protection", () => {
    const queue = new DownloadQueue();
    const added = queue.addEpisode(
      { url: EP_URL, season: 1, episode: 1, title: "Pilot" },
      { showTitle: "Breaking Bad", posterUrl: "https://cdn.example.com/bb.jpg" }
    );
    assert.equal(added.ok, true);
    assert.equal(added.item.kind, "episode");
    assert.equal(added.item.title, "Breaking Bad · S01E01 · Pilot");
    assert.equal(added.item.showTitle, "Breaking Bad");
    assert.equal(added.item.season, 1);
    assert.equal(added.item.episode, 1);
    assert.equal(added.item.episodeTitle, "Pilot");
    assert.equal(added.item.posterUrl, "https://cdn.example.com/bb.jpg");

    const dup = queue.addEpisode({ url: EP_URL, season: 1, episode: 1, title: "Pilot" });
    assert.equal(dup.ok, false);
    assert.match(dup.error, /already in the queue/i);
  });

  it("rejects the same SxxExx even when episode URLs differ", () => {
    const queue = new DownloadQueue();
    const added = queue.addEpisode(
      { url: EP_URL, season: 1, episode: 1, title: "Pilot" },
      { showTitle: "Breaking Bad" }
    );
    assert.equal(added.ok, true);
    const dup = queue.addEpisode(
      {
        url: "https://www4.tornadomovies.co/episode/breaking-bad-season-1/ep01aaa",
        season: 1,
        episode: 1,
        title: "Episode 01"
      },
      { showTitle: "Breaking Bad" }
    );
    assert.equal(dup.ok, false);
    assert.match(dup.error, /already in the queue/i);
    assert.equal(queue.items.length, 1);
  });

  it("rejects a SxxExx that is already loading or downloading", () => {
    const queue = new DownloadQueue();
    const added = queue.addEpisode(
      { url: EP_URL, season: 1, episode: 1, title: "Pilot" },
      { showTitle: "Breaking Bad" }
    );
    queue.setCurrent(added.item.id);
    const dup = queue.addEpisode(
      {
        url: "https://www4.tornadomovies.co/series/breaking-bad-season-1/id/ep01-other-watching.html",
        season: 1,
        episode: 1,
        title: "Pilot"
      },
      { showTitle: "Breaking Bad" }
    );
    assert.equal(dup.ok, false);
    assert.match(dup.error, /already in the queue/i);
  });

  it("addEpisodes reports added and skipped", () => {
    const queue = new DownloadQueue();
    const result = queue.addEpisodes(
      [
        { url: EP_URL, season: 1, episode: 1, title: "Pilot" },
        { url: EP_URL, season: 1, episode: 1, title: "Pilot" },
        { url: `${EP_URL.replace("ep01", "ep02")}`, season: 1, episode: 2, title: "Cat's in the Bag" }
      ],
      { showTitle: "Breaking Bad" }
    );
    assert.equal(result.added.length, 2);
    assert.equal(result.skipped.length, 1);
  });

  it("transitions pending → loading → downloading → done", () => {
    const queue = new DownloadQueue();
    const { item } = queue.add(MOVIE_A, { title: "Dune" });
    queue.setCurrent(item.id);
    assert.equal(queue.items[0].status, "loading");
    queue.markDownloading(item.id);
    assert.equal(queue.items[0].status, "downloading");
    queue.patch(item.id, { progress: 45, qualityLabel: "1080p" });
    assert.equal(queue.items[0].progress, 45);
    assert.equal(queue.items[0].qualityLabel, "1080p");
    queue.markDone(item.id);
    assert.equal(queue.items[0].status, "done");
    assert.equal(queue.items[0].progress, 100);
    assert.equal(queue.items[0].error, null);
  });

  it("marks failed items and can revive them on beginRun", () => {
    const queue = new DownloadQueue();
    const { item } = queue.add(MOVIE_A);
    queue.markFailed(item.id, "boom");
    assert.equal(queue.items[0].status, "failed");
    const began = queue.beginRun();
    assert.equal(began.ok, true);
    assert.equal(queue.items[0].status, "pending");
    assert.equal(queue.running, true);
  });

  it("beginRun fails when empty and when already running", () => {
    const queue = new DownloadQueue();
    assert.equal(queue.beginRun().ok, false);
    queue.add(MOVIE_A);
    assert.equal(queue.beginRun().ok, true);
    assert.equal(queue.beginRun().ok, false);
  });

  it("cannot remove the current downloading item or clear while running", () => {
    const queue = new DownloadQueue();
    const { item } = queue.add(MOVIE_A);
    queue.beginRun();
    queue.setCurrent(item.id);
    assert.equal(queue.remove(item.id).ok, false);
    assert.equal(queue.clear().ok, false);
    queue.finishRun();
    assert.equal(queue.remove(item.id).ok, true);
    queue.add(MOVIE_B);
    assert.equal(queue.clear().ok, true);
    assert.equal(queue.items.length, 0);
  });

  it("snapshot counts match PC queue UI fields", () => {
    const queue = new DownloadQueue();
    queue.add(MOVIE_A);
    queue.addEpisode({ url: EP_URL, season: 1, episode: 1, title: "Pilot" }, { showTitle: "Breaking Bad" });
    const snap = queue.snapshot();
    assert.equal(snap.counts.total, 2);
    assert.equal(snap.counts.pending, 2);
    assert.equal(snap.counts.movies, 1);
    assert.equal(snap.counts.episodes, 1);
    assert.equal(snap.running, false);
    assert.equal(snap.currentId, null);
  });

  it("persists and restores, converting interrupted downloads back to pending", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cinarip-queue-"));
    const file = path.join(dir, "download-queue.json");
    const queue = new DownloadQueue();
    const { item } = queue.add(MOVIE_A, { title: "Dune", posterUrl: "https://cdn.example.com/dune.jpg" });
    queue.setCurrent(item.id);
    queue.markDownloading(item.id);
    saveQueueState(queue.persistableItems(), file);

    const loaded = loadQueueState(file);
    assert.equal(loaded.items.length, 1);
    assert.equal(loaded.items[0].status, "downloading");

    const restored = new DownloadQueue();
    const result = restored.restore(loaded.items);
    assert.equal(result.restored, 1);
    assert.equal(result.interrupted, 1);
    assert.equal(restored.items[0].status, "pending");
    assert.equal(restored.items[0].title, "Dune");
    assert.equal(restored.items[0].posterUrl, "https://cdn.example.com/dune.jpg");
  });

  it("sanitizeQueueItem accepts legacy NAS pending rows", () => {
    const item = sanitizeQueueItem({
      id: "d-old",
      title: "Legacy",
      movieUrl: MOVIE_A,
      status: "pending"
    });
    assert.equal(item.kind, "movie");
    assert.equal(item.status, "pending");
    assert.match(item.movieUrl, /\/movie\/dune\/abc123$/);
  });

  it("addMany skips TV search results", () => {
    const queue = new DownloadQueue();
    const result = queue.addMany([
      { movieUrl: MOVIE_A, title: "Dune" },
      { movieUrl: "https://www4.tornadomovies.co/series/breaking-bad/id", title: "BB", kind: "tv" }
    ]);
    assert.equal(result.added.length, 1);
    assert.equal(result.skipped.length, 1);
  });
});
