"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { pickBestLink, qualityLabel } = require("../lib/tornado");

function link(height, name = "Movie") {
  return {
    url: `https://loadshare.org/download/x/${height}?name=${name}_${height}.mp4`,
    height,
    qualityLabel: qualityLabel(height)
  };
}

describe("pickBestLink", () => {
  it("picks the highest resolution by default", () => {
    const best = pickBestLink([link(720), link(2160), link(1080)]);
    assert.equal(best.height, 2160);
    assert.equal(best.qualityLabel, "4K");
  });

  it("picks exact 720p when targeting a device download", () => {
    const best = pickBestLink([link(2160), link(1080), link(720), link(480)], { targetHeight: 720 });
    assert.equal(best.height, 720);
    assert.equal(best.qualityLabel, "720p");
  });

  it("falls back to the next lower resolution when 720p is missing", () => {
    const best = pickBestLink([link(1080), link(480), link(360)], { targetHeight: 720 });
    assert.equal(best.height, 480);
  });

  it("uses the next higher file when nothing at or below 720 exists", () => {
    const best = pickBestLink([link(2160), link(1080)], { targetHeight: 720 });
    assert.equal(best.height, 1080);
  });
});
