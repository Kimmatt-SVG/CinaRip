"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { downloadSocketOptions, isLoadshareHostname } = require("../lib/http-download");

describe("downloadSocketOptions", () => {
  it("prefers IPv6 for ip6 LoadShare hosts and does not force IPv4 for LoadShare", () => {
    assert.equal(isLoadshareHostname("vip-1-1-ip6.loadshare.org"), true);
    assert.equal(isLoadshareHostname("loadshare.net"), true);
    assert.equal(isLoadshareHostname("cdn.example.com"), false);

    const ip6 = downloadSocketOptions("https://vip-1-1-ip6.loadshare.org/download/1/x");
    assert.equal(ip6.family, 6);
    assert.equal(ip6.family === 4, false);

    const apex = downloadSocketOptions("https://loadshare.org/download/x");
    assert.equal(apex.family, undefined);
    assert.equal(apex.autoSelectFamily, true);

    const other = downloadSocketOptions("https://www4.tornadomovies.co/movie/x");
    assert.deepEqual(other, {});
  });
});
