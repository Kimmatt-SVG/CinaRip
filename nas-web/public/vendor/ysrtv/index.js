/* ysrtv: analog TV effects. vendored from ysrtv@0.1.0 (MIT). */

let motionMode = "auto";

export function setMotion(mode) {
  if (mode === "auto" || mode === "full" || mode === "still") motionMode = mode;
}

export function isStill() {
  if (motionMode === "still") return true;
  if (motionMode === "full") return false;
  return typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function paintNoise(ctx, w, h, dim) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const m = dim ? 90 : 255;
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() * m) | 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function sizeCanvas(cv, el, res) {
  const r = el.getBoundingClientRect();
  cv.width = res;
  cv.height = Math.max(24, Math.round(res * (r.height / Math.max(1, r.width))));
}

function overlayCanvas(el, res, z) {
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  const cv = document.createElement("canvas");
  cv.setAttribute("aria-hidden", "true");
  cv.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;" +
    "pointer-events:none;image-rendering:pixelated;z-index:" + (z == null ? 4 : z) + ";";
  sizeCanvas(cv, el, res);
  el.appendChild(cv);
  return cv;
}

export function staticBurst(el, opts, onMid) {
  if (typeof opts === "function") {
    onMid = opts;
    opts = null;
  }
  opts = opts || {};
  const dur = opts.duration || 260;
  const mid = onMid || opts.onMid;
  const midAt = opts.midAt == null ? 0.45 : opts.midAt;
  const cv = overlayCanvas(el, opts.resolution || 320, opts.zIndex);
  const ctx = cv.getContext("2d");

  return new Promise((resolve) => {
    let swapped = false;
    let done = false;
    function swap() {
      if (!swapped) {
        swapped = true;
        if (mid) mid();
      }
    }
    function finish() {
      if (done) return;
      done = true;
      swap();
      cv.remove();
      resolve();
    }
    if (isStill()) {
      paintNoise(ctx, cv.width, cv.height);
      setTimeout(swap, dur * midAt);
      setTimeout(finish, dur);
      return;
    }
    const t0 = performance.now();
    (function frame() {
      if (done) return;
      paintNoise(ctx, cv.width, cv.height);
      const elapsed = performance.now() - t0;
      if (elapsed > dur * midAt) swap();
      if (elapsed < dur) requestAnimationFrame(frame);
      else finish();
    })();
    setTimeout(finish, dur + 250);
  });
}

export function snow(el, opts) {
  opts = opts || {};
  const interval = opts.interval == null ? 80 : opts.interval;
  const dim = opts.dim !== false;
  const res = opts.resolution || 320;
  const cv = overlayCanvas(el, res, opts.zIndex);
  const ctx = cv.getContext("2d");
  let running = true;
  let last = 0;

  paintNoise(ctx, cv.width, cv.height, dim);
  function loop(t) {
    if (!running) return;
    if (t - last > interval) {
      paintNoise(ctx, cv.width, cv.height, dim);
      last = t;
    }
    requestAnimationFrame(loop);
  }
  if (!isStill()) requestAnimationFrame(loop);

  let ro = null;
  if (typeof ResizeObserver === "function") {
    ro = new ResizeObserver(() => {
      sizeCanvas(cv, el, res);
      paintNoise(ctx, cv.width, cv.height, dim);
    });
    ro.observe(el);
  }

  return {
    canvas: cv,
    stop() {
      running = false;
      if (ro) ro.disconnect();
      cv.remove();
    }
  };
}

const LINE_LEVELS = [
  { a: 0, g: "2px", s: "4px" },
  { a: 0.07, g: "2px", s: "4px" },
  { a: 0.14, g: "2px", s: "4px" },
  { a: 0.26, g: "2px", s: "4px" },
  { a: 0.55, g: "3px", s: "6px" }
];

export function setScanlines(el, level) {
  const L = LINE_LEVELS[Math.max(0, Math.min(4, level | 0))];
  el.style.setProperty("--ysrtv-line-alpha", L.a);
  el.style.setProperty("--ysrtv-line-gap", L.g);
  el.style.setProperty("--ysrtv-line-step", L.s);
}

export function setVignette(el, alpha) {
  el.style.setProperty("--ysrtv-vignette-alpha", alpha === false ? 0 : alpha === true ? 0.5 : alpha);
}
