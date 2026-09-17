(() => {
  const STORAGE_KEY = "cinarip.punished";
  const RITE_ASSETS = [
    { match: "img.brand-logo", rite: "/rite/logo.png?v=1" },
    { match: "#tab-library img", rite: "/rite/icons/library.png?v=1" },
    { match: "#tab-search img", rite: "/rite/icons/search.png?v=1" },
    { match: "#tab-freezer img", rite: "/rite/icons/freezer.png?v=1" },
    { match: "#tab-settings img", rite: "/rite/icons/settings.png?v=1" },
    { match: ".freezer-corner img", rite: "/rite/icons/freezer.png" }
  ];

  let running = false;
  let fxOn = false;
  let snowHandle = null;
  const glitchHandles = [];
  const assetOk = Object.create(null);
  let ysrtv = null;
  let tvSound = null;
  let fxLoading = null;
  let essayOn = false;
  let essayApplying = false;
  let essayScheduled = false;
  let essayCursor = 0;
  let essayObserver = null;
  let originalTitle = "";
  const essayRecords = new WeakMap();
  const essayNodes = new Set();
  const ESSAY_ATTRS = ["placeholder", "title", "alt", "aria-label"];
  const KEEP_TEXT_IDS = new Set(["storage-label", "library-summary", "job-label", "download-queue-summary"]);
  const ESSAY_SKIP_SELECTOR = "#storage-label, #library-summary, #job-label, #download-queue-summary, #download-queue-list, .download-queue-item, [data-cursed-keep]";
  const ESSAY = `Piracy is illegal.

You probably already know that. Everyone does.

But I don't think people really think about what that means anymore.

You find a movie online, download a game, grab some software for free. Whatever. It takes five minutes and then you move on with your day.

But somebody made that.

Like, an actual person.

Someone sat there for hours working on the thing you just downloaded. Maybe it was a developer who spent two years making a game. Maybe it was an artist who stayed up until 3 in the morning finishing something. Maybe it was a filmmaker who spent basically everything they had trying to make a movie actually happen.

And then you just take it.

Why?

Seriously.

Why would you do that?

You obviously wanted it. You searched for it. You waited for it to download. You're going to play it, watch it, listen to it, whatever.

So clearly their work meant something to you.

But the person who made it didn't?

That's the part that bothers me.

It's easy to pirate something because you never have to see the person you're taking it from.

There's no one standing there.

Nobody looks you in the eyes.

Nobody asks you why you're doing it.

You just see a download button.

Click.

Wait.

Done.

And that's it.

At least for you.

The people who make this stuff still have to pay rent. They still need to eat. They still have families. They still need money to actually keep making things.

Imagine spending months making something.

You finally release it.

People love it.

Thousands of people are downloading it and talking about it.

Then you look at how many people actually bought it.

Imagine how that feels.

People wanted your work.

They just didn't think you were worth paying for it.

That's sad.

And yeah, one person pirating something probably isn't going to destroy someone's career.

But it's never just one person, is it?

It's thousands.

Sometimes millions.

And eventually somebody pays for that.

Maybe the next project gets a smaller budget.

Maybe people lose their jobs.

Maybe that little developer you liked doesn't make another game.

Maybe that artist just stops.

Then everyone wonders where they went.

And there's another side to piracy people don't think about.

You have absolutely no idea what you're downloading.

You're trusting some random person on the internet who uploaded a cracked program and wrote "100% SAFE" next to it.

Why do you trust them?

You don't know them.

They don't know you.

And they definitely don't care about you.

Maybe the program works perfectly.

Maybe the movie plays.

Maybe the game launches.

Maybe everything seems fine.

But you don't know what else you just installed.

That's the creepy part.

Your computer doesn't always start flashing red when something is wrong.

Sometimes nothing happens.

Everything looks normal.

Your passwords still work.

Your files are still there.

Your computer turns on like it always does.

And something could be sitting there quietly in the background.

You wouldn't even know.

All because you didn't want to pay for something.

And depending on where you live and what you're downloading or sharing, piracy can have actual legal consequences too. Copyright isn't just some warning companies put at the beginning of movies. It's real law.

So next time you're staring at that download button, just think about it for a second.

Think about who made the thing you're about to take.

Not the company logo.

Not the publisher.

The people.

The programmer sitting at their desk.

The person holding the camera.

The musician recording the same part over and over until they finally get it right.

The editor staring at a timeline at 2 AM.

They'll probably never know who you are.

They'll never see you download it.

They'll never knock on your door and ask:

"Why?"

But maybe that's what makes it worse.

Because nobody is stopping you.

Nobody is watching you.

It's just you and that button.

So...

why would you do it?

Why would you hurt the people who made something you wanted badly enough to steal?

Just because you can't see them doesn't mean they're not there.`;
  const SENTENCES = splitEssaySentences(ESSAY);
  const SHORT_SENTENCES = SENTENCES.map((s, i) => (s.length <= 24 ? i : -1)).filter((i) => i >= 0);

  function splitEssaySentences(text) {
    const sentences = [];
    const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    for (const rawLine of lines) {
      let rest = rawLine.trim();
      if (!rest) continue;
      while (rest) {
        const quoted = rest.match(/^"[^"]*[.!?]"/);
        if (quoted) {
          sentences.push(quoted[0]);
          rest = rest.slice(quoted[0].length).trim();
          continue;
        }
        let i = 0;
        let inQuotes = false;
        let end = -1;
        while (i < rest.length) {
          const ch = rest[i];
          if (ch === '"') inQuotes = !inQuotes;
          if (!inQuotes) {
            if (rest.startsWith("...", i) && (i + 3 >= rest.length || /\s/.test(rest[i + 3]))) {
              end = i + 3;
              break;
            }
            if (ch === "." || ch === "?" || ch === "!") {
              end = i + 1;
              break;
            }
            if (ch === ":" && i === rest.length - 1) {
              end = i + 1;
              break;
            }
          }
          i += 1;
        }
        if (end === -1) {
          sentences.push(rest);
          break;
        }
        sentences.push(rest.slice(0, end).trim());
        rest = rest.slice(end).trim();
      }
    }
    return sentences;
  }

  function skipEssayTarget(node) {
    let el = node;
    if (el && el.nodeType === 3) el = el.parentElement;
    while (el && el.nodeType !== 1) el = el.parentElement;
    if (!el) return true;
    if (KEEP_TEXT_IDS.has(el.id)) return true;
    const keep = el.getAttribute && el.getAttribute("data-cursed-keep");
    if (keep != null && keep !== "0") return true;
    if (typeof el.closest === "function" && el.closest(ESSAY_SKIP_SELECTOR)) return true;
    const tag = el.tagName;
    return tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEXTAREA";
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function tween(opts) {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      window.setTimeout(done, (opts.duration || 0) + 120);
      if (typeof window.anime === "function") {
        window.anime({ ...opts, complete: done });
        return;
      }
      const el = opts.targets;
      if (el && opts.opacity != null) {
        el.style.opacity = Array.isArray(opts.opacity) ? String(opts.opacity[opts.opacity.length - 1]) : String(opts.opacity);
      }
    });
  }

  function canMotion() {
    return document.documentElement.classList.contains("motion-on");
  }

  function isOn() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return document.documentElement.classList.contains("is-punished");
    }
  }

  function persist(on) {
    try {
      localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    } catch {
      // ignore quota / private mode
    }
  }

  async function hasAsset(url) {
    if (assetOk[url] != null) return assetOk[url];
    try {
      const res = await fetch(url, { method: "HEAD" });
      assetOk[url] = res.ok;
    } catch {
      assetOk[url] = false;
    }
    return assetOk[url];
  }

  function loadFx() {
    if (!fxLoading) {
      fxLoading = Promise.all([
        import("/vendor/ysrtv/index.js").then((mod) => {
          ysrtv = mod;
        }).catch(() => {}),
        import("/vendor/ysrtv/sound.js").then((mod) => {
          tvSound = mod;
          if (tvSound.setVolume) tvSound.setVolume(0.42);
          if (tvSound.autoUnlock) tvSound.autoUnlock();
        }).catch(() => {})
      ]);
    }
    return fxLoading;
  }

  function unlockTvSound() {
    if (tvSound && typeof tvSound.unlock === "function") tvSound.unlock();
  }

  function stopSnow() {
    if (snowHandle && typeof snowHandle.stop === "function") snowHandle.stop();
    snowHandle = null;
    if (tvSound && typeof tvSound.hiss === "function") tvSound.hiss(false);
  }

  function startSnow(el, opts) {
    stopSnow();
    if (!canMotion() || !ysrtv || typeof ysrtv.snow !== "function" || !el) return;
    snowHandle = ysrtv.snow(el, opts || { dim: true, resolution: 220, interval: 90, zIndex: 6 });
    unlockTvSound();
    if (tvSound && typeof tvSound.hiss === "function") tvSound.hiss(true);
  }

  async function burstStatic(onMid, duration) {
    const fx = document.getElementById("rite-fx");
    if (!fx) {
      onMid?.();
      return;
    }
    fx.hidden = false;
    fx.setAttribute("aria-hidden", "false");
    fx.classList.add("is-bursting");
    unlockTvSound();
    try {
      if (canMotion() && ysrtv && typeof ysrtv.staticBurst === "function") {
        await ysrtv.staticBurst(fx, {
          duration: duration || 480,
          resolution: 240,
          zIndex: 8,
          onMid
        });
        return;
      }
      onMid?.();
      await wait(duration || 280);
    } finally {
      fx.classList.remove("is-bursting");
    }
  }

  function unglitch(el) {
    if (!el || !el.dataset.glitched) return;
    const layers = el.parentElement;
    const container = layers && layers.parentElement;
    if (!layers || !container || !container.parentElement) {
      delete el.dataset.glitched;
      return;
    }
    while (layers.children.length > 1) layers.removeChild(layers.lastChild);
    el.style.removeProperty("grid-area");
    delete el.dataset.glitched;
    container.replaceWith(el);
  }

  function stopGlitch() {
    glitchHandles.splice(0).forEach((handle) => {
      try {
        if (handle && typeof handle.stopGlitch === "function") handle.stopGlitch();
      } catch {
        // ignore
      }
    });
    document.querySelectorAll("[data-glitched]").forEach((el) => unglitch(el));
  }

  function startPowerGlitch(el, options) {
    if (!canMotion() || !el || !window.PowerGlitch || typeof window.PowerGlitch.glitch !== "function") return;
    try {
      glitchHandles.push(window.PowerGlitch.glitch(el, options));
    } catch {
      // ignore layout-sensitive failures
    }
  }

  function startLogoGlitch() {
    startPowerGlitch(document.getElementById("brand-glitch"), {
      playMode: "always",
      hideOverflow: true,
      timing: { duration: 2800, iterations: Infinity, easing: "ease-in-out" },
      glitchTimeSpan: { start: 0.68, end: 0.84 },
      shake: { velocity: 14, amplitudeX: 0.16, amplitudeY: 0.1 },
      slice: {
        count: 5,
        velocity: 14,
        minHeight: 0.04,
        maxHeight: 0.2,
        hueRotate: false,
        cssFilters: "saturate(1.8) contrast(1.15)"
      }
    });
  }

  function startCopyGlitch(copy) {
    if (copy) copy.classList.remove("ysrtv-phosphor", "is-live");
  }

  function stopCopyGlitch(copy) {
    if (copy) copy.classList.remove("ysrtv-phosphor", "is-live");
  }

  function showCrtOverlay() {
    const fx = document.getElementById("rite-fx");
    if (!fx) return;
    fx.hidden = false;
    fx.setAttribute("aria-hidden", "false");
    if (ysrtv && typeof ysrtv.setScanlines === "function") ysrtv.setScanlines(fx, 3);
    if (ysrtv && typeof ysrtv.setVignette === "function") ysrtv.setVignette(fx, 0.58);
  }

  function hideCrtOverlay() {
    const fx = document.getElementById("rite-fx");
    if (!fx) return;
    fx.classList.remove("is-bursting");
    fx.hidden = true;
    fx.setAttribute("aria-hidden", "true");
    fx.style.removeProperty("opacity");
  }

  function startFx() {
    if (fxOn) {
      showCrtOverlay();
      return;
    }
    fxOn = true;
    showCrtOverlay();
    startLogoGlitch();
  }

  function stopFx() {
    fxOn = false;
    stopSnow();
    stopGlitch();
    if (tvSound && typeof tvSound.hum === "function") tvSound.hum(false);
    hideCrtOverlay();
  }

  async function applyRiteGraphics() {
    for (const item of RITE_ASSETS) {
      if (!(await hasAsset(item.rite))) continue;
      document.querySelectorAll(item.match).forEach((img) => {
        if (!img.dataset.riteSrc) img.dataset.riteSrc = img.getAttribute("src") || "";
        img.src = item.rite;
        img.dataset.rite = "1";
      });
    }
    const video = document.getElementById("ambient-video");
    const riteVideo = "/rite/media/plasma-stream.mp4?v=2";
    if (video && (await hasAsset(riteVideo))) {
      if (!video.dataset.riteSrc) video.dataset.riteSrc = video.getAttribute("src") || "";
      video.src = riteVideo;
      video.dataset.rite = "1";
      try {
        video.load();
        video.play().catch(() => {});
      } catch {
        // ignore
      }
    }
  }

  function restoreGraphics() {
    for (const item of RITE_ASSETS) {
      document.querySelectorAll(item.match).forEach((img) => {
        if (img.dataset.riteSrc) {
          img.src = img.dataset.riteSrc;
          delete img.dataset.riteSrc;
        }
        delete img.dataset.rite;
      });
    }
    const video = document.getElementById("ambient-video");
    if (video && video.dataset.riteSrc) {
      video.src = video.dataset.riteSrc;
      delete video.dataset.riteSrc;
      delete video.dataset.rite;
      try {
        video.load();
        video.play().catch(() => {});
      } catch {
        // ignore
      }
    }
  }

  const WARP_MARKS = ["\u0300", "\u0301", "\u0308", "\u0304", "\u0323", "\u0315", "\u0358", "\u0342", "\u0331"];
  const WARP_QUOTES = [
    ["“", "”"],
    ["«", "»"],
    ["「", "」"],
    ["‹", "›"]
  ];

  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function makeRand(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function warpIntensity(targetLen, srcLen) {
    const len = Math.max(targetLen, srcLen);
    if (len <= 10) return 0.22;
    if (len <= 18) return 0.34;
    if (len <= 40) return 0.54;
    if (len <= 90) return 0.74;
    return 0.9;
  }

  function letterSpans(chars) {
    const spans = [];
    let start = -1;
    for (let i = 0; i < chars.length; i += 1) {
      if (/[A-Za-z]/.test(chars[i].ch)) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        spans.push([start, i]);
        start = -1;
      }
    }
    if (start >= 0) spans.push([start, chars.length]);
    return spans;
  }

  function warpEssaySnippet(text, targetLen, seed) {
    const src = String(text || "");
    if (!src) return src;
    const rand = makeRand(hashSeed(`${seed}::${src}::${targetLen}`));
    const short = targetLen <= 18 || src.length <= 16;
    const intensity = warpIntensity(targetLen, src.length);
    let extra = 0;
    const extraCap = short ? 2 : Math.min(18, 4 + Math.floor(src.length * 0.12));
    const chars = [];
    for (const ch of src) chars.push({ ch, marks: "" });

    for (const cell of chars) {
      if (!/[A-Za-z]/.test(cell.ch)) continue;
      const r = rand();
      if (short) {
        if (r < 0.3) cell.ch = cell.ch.toUpperCase();
        else if (r < 0.42) cell.ch = cell.ch.toLowerCase();
      } else if (r < 0.14 + intensity * 0.24) {
        cell.ch = cell.ch.toUpperCase();
      } else if (r < 0.62) {
        cell.ch = cell.ch.toLowerCase();
      }
    }

    const spans = letterSpans(chars);
    if (!short && spans.length && intensity > 0.45 && rand() < 0.75) {
      const longish = spans.filter((span) => span[1] - span[0] >= 4);
      const pick = (longish.length ? longish : spans)[Math.floor(rand() * (longish.length ? longish.length : spans.length))];
      for (let i = pick[0]; i < pick[1]; i += 1) chars[i].ch = chars[i].ch.toUpperCase();
    }

    const doubleBudget = short ? (rand() < 0.5 ? 1 : 0) : 1 + Math.floor(rand() * (1 + intensity * 3));
    let doubled = 0;
    for (let n = 0; n < 24 && doubled < doubleBudget && extra < extraCap; n += 1) {
      const i = Math.floor(rand() * chars.length);
      const cell = chars[i];
      if (!cell || !/[A-Za-z]/.test(cell.ch)) continue;
      if (chars[i + 1] && chars[i + 1].ch.toLowerCase() === cell.ch.toLowerCase()) continue;
      chars.splice(i + 1, 0, { ch: cell.ch, marks: "" });
      extra += 1;
      doubled += 1;
    }

    const markBudget = short
      ? (rand() < 0.55 ? 1 : 0)
      : Math.max(1, Math.floor(chars.length * (0.035 + intensity * 0.07)));
    let marked = 0;
    for (let n = 0; n < chars.length * 2 && marked < markBudget; n += 1) {
      const cell = chars[Math.floor(rand() * chars.length)];
      if (!cell || !/[A-Za-z]/.test(cell.ch) || cell.marks) continue;
      cell.marks = WARP_MARKS[Math.floor(rand() * WARP_MARKS.length)];
      marked += 1;
    }

    if (extra < extraCap) {
      const last = chars[chars.length - 1];
      if (last && /[.!?…]/.test(last.ch) && rand() < 0.55 + intensity * 0.3) {
        if (last.ch === "?" && extraCap - extra >= 1) {
          chars.push({ ch: rand() < 0.5 ? "?" : "!", marks: "" });
          extra += 1;
        } else if (last.ch === "." && !short && extraCap - extra >= 2 && rand() < 0.65) {
          chars.push({ ch: ".", marks: "" }, { ch: ".", marks: "" });
          extra += 2;
        } else if (last.ch === "!" && extraCap - extra >= 1) {
          chars.push({ ch: "!", marks: "" });
          extra += 1;
        }
      }
    }

    if (!short && extraCap - extra >= 2 && spans.length && rand() < 0.55 + intensity * 0.25) {
      const fresh = letterSpans(chars).filter((span) => span[1] - span[0] >= 3);
      if (fresh.length) {
        const [a, b] = fresh[Math.floor(rand() * fresh.length)];
        const q = WARP_QUOTES[Math.floor(rand() * WARP_QUOTES.length)];
        chars.splice(b, 0, { ch: q[1], marks: "" });
        chars.splice(a, 0, { ch: q[0], marks: "" });
        extra += 2;
      }
    }

    if (!short && extra < extraCap && rand() < 0.4 + intensity * 0.25) {
      const spaces = [];
      for (let i = 0; i < chars.length; i += 1) {
        if (chars[i].ch === " ") spaces.push(i);
      }
      if (spaces.length) {
        chars.splice(spaces[Math.floor(rand() * spaces.length)] + 1, 0, { ch: " ", marks: "" });
        extra += 1;
      }
    }

    return chars.map((cell) => cell.ch + cell.marks).join("");
  }

  function pickEssaySnippet(targetLen) {
    const n = SENTENCES.length;
    if (!n) return "";
    const start = ((essayCursor % n) + n) % n;
    const len = Math.max(0, Number(targetLen) || 0);
    const seed = essayCursor;
    let raw = "";
    if (len <= 18) {
      let pick = start;
      if (SHORT_SENTENCES.length) {
        const nearby = SHORT_SENTENCES.find((i) => i >= start);
        pick = nearby == null ? SHORT_SENTENCES[0] : nearby;
      }
      essayCursor += 1;
      raw = SENTENCES[pick];
    } else {
      raw = SENTENCES[start];
      let used = 1;
      const minWant = Math.max(len * 0.72, Math.min(len, 28));
      const cap = Math.max(len * 1.55, len + 24);
      while (used < 10 && raw.length < minWant) {
        const next = SENTENCES[(start + used) % n];
        const combined = `${raw} ${next}`;
        if (combined.length > cap && raw.length >= Math.min(12, len)) break;
        raw = combined;
        used += 1;
      }
      essayCursor += used;
    }
    return warpEssaySnippet(raw, len, seed);
  }

  function shouldSkipEssayElement(el) {
    if (!el || el.nodeType !== 1) return true;
    if (skipEssayTarget(el)) return true;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEMPLATE") return true;
    if (tag === "SVG" || tag === "PATH" || el.closest("svg")) return true;
    if (el.closest("#punished-veil, #rite-fx, #punished-gate")) return true;
    return false;
  }

  function shouldSkipEssayText(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return true;
    if (skipEssayTarget(node)) return true;
    if (!node.nodeValue || !/\S/.test(node.nodeValue)) return true;
    const parent = node.parentElement;
    if (shouldSkipEssayElement(parent)) return true;
    if (parent && parent.closest("script, style, noscript, template, svg, #punished-veil, #rite-fx, #punished-gate")) return true;
    if (parent && (parent.id === "splash-pin" || parent.closest("#splash-pin"))) return true;
    return false;
  }

  function pruneEssayNodes() {
    for (const node of essayNodes) {
      if (!node || !node.isConnected) essayNodes.delete(node);
    }
  }

  function applyEssayToTextNode(node) {
    if (shouldSkipEssayText(node)) return;
    const current = node.nodeValue;
    const prev = essayRecords.get(node);
    if (prev && prev.kind === "text") {
      if (current === prev.snippet) {
        essayNodes.add(node);
        return;
      }
      if (current !== prev.original) prev.original = current;
      node.nodeValue = prev.snippet;
      essayNodes.add(node);
      return;
    }
    const original = current;
    const snippet = pickEssaySnippet(original.trim().length);
    essayRecords.set(node, { kind: "text", original, snippet });
    essayNodes.add(node);
    node.nodeValue = snippet;
  }

  function applyEssayToElement(el) {
    if (shouldSkipEssayElement(el)) return;
    let rec = essayRecords.get(el);
    if (!rec || rec.kind !== "attrs") {
      rec = { kind: "attrs", original: {}, snippet: {} };
    }
    let changed = false;
    for (const attr of ESSAY_ATTRS) {
      if (!el.hasAttribute(attr)) continue;
      const current = el.getAttribute(attr);
      if (current == null || current === "") continue;
      const prevSnippet = rec.snippet[attr];
      const prevOriginal = rec.original[attr];
      if (prevSnippet != null && current === prevSnippet) {
        changed = true;
        continue;
      }
      if (prevSnippet != null && current !== prevOriginal) {
        rec.original[attr] = current;
      } else if (prevOriginal == null) {
        rec.original[attr] = current;
      }
      if (rec.snippet[attr] == null) {
        rec.snippet[attr] = pickEssaySnippet(rec.original[attr].length);
      }
      if (el.getAttribute(attr) !== rec.snippet[attr]) {
        el.setAttribute(attr, rec.snippet[attr]);
      }
      changed = true;
    }
    if (changed) {
      essayRecords.set(el, rec);
      essayNodes.add(el);
    }
  }

  function applyEssayTitle() {
    const current = document.title || "";
    if (!current.trim()) return;
    const rec = essayRecords.get(document.head) || { kind: "title", original: "", snippet: "" };
    if (!rec.original) rec.original = originalTitle || current;
    if (current !== rec.snippet && current !== rec.original) rec.original = current;
    if (!rec.snippet) rec.snippet = pickEssaySnippet(rec.original.length);
    originalTitle = rec.original;
    if (document.title !== rec.snippet) document.title = rec.snippet;
    essayRecords.set(document.head, rec);
    essayNodes.add(document.head);
  }

  function restoreEssayRecord(node) {
    const rec = essayRecords.get(node);
    if (!rec) {
      essayNodes.delete(node);
      return;
    }
    if (rec.kind === "title") {
      document.title = rec.original || originalTitle || document.title;
    } else if (node.isConnected && rec.kind === "text" && node.nodeType === Node.TEXT_NODE) {
      node.nodeValue = rec.original;
    } else if (node.isConnected && rec.kind === "attrs" && node.nodeType === 1) {
      for (const attr of Object.keys(rec.original || {})) {
        const original = rec.original[attr];
        if (original == null) continue;
        node.setAttribute(attr, original);
      }
    }
    essayRecords.delete(node);
    essayNodes.delete(node);
  }

  function pruneSkippedEssayNodes() {
    for (const node of [...essayNodes]) {
      if (!node || !node.isConnected) {
        essayRecords.delete(node);
        essayNodes.delete(node);
        continue;
      }
      if (skipEssayTarget(node)) restoreEssayRecord(node);
    }
  }

  function applyEssayText() {
    if (!essayOn || essayApplying) return;
    essayApplying = true;
    try {
      pruneEssayNodes();
      pruneSkippedEssayNodes();
      applyEssayTitle();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return shouldSkipEssayText(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      });
      let node = walker.nextNode();
      while (node) {
        applyEssayToTextNode(node);
        node = walker.nextNode();
      }
      const elements = document.body.getElementsByTagName("*");
      for (let i = 0; i < elements.length; i += 1) applyEssayToElement(elements[i]);
    } finally {
      essayApplying = false;
    }
  }

  function restoreEssayText() {
    essayApplying = true;
    try {
      for (const node of essayNodes) {
        const rec = essayRecords.get(node);
        if (!rec) continue;
        if (rec.kind === "title") {
          document.title = rec.original || originalTitle || document.title;
        } else if (node.isConnected && rec.kind === "text" && node.nodeType === Node.TEXT_NODE) {
          node.nodeValue = rec.original;
        } else if (node.isConnected && rec.kind === "attrs" && node.nodeType === 1) {
          for (const attr of Object.keys(rec.original || {})) {
            const original = rec.original[attr];
            if (original == null) continue;
            node.setAttribute(attr, original);
          }
        }
        essayRecords.delete(node);
      }
    } finally {
      essayNodes.clear();
      originalTitle = "";
      essayApplying = false;
    }
  }

  function scheduleEssayText() {
    if (!essayOn || essayApplying || essayScheduled) return;
    essayScheduled = true;
    window.requestAnimationFrame(() => {
      essayScheduled = false;
      if (essayOn) applyEssayText();
    });
  }

  function startEssayObserver() {
    if (essayObserver || typeof MutationObserver !== "function") return;
    essayObserver = new MutationObserver(() => {
      scheduleEssayText();
    });
    essayObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ESSAY_ATTRS
    });
  }

  function stopEssayObserver() {
    if (!essayObserver) return;
    essayObserver.disconnect();
    essayObserver = null;
    essayScheduled = false;
  }

  function startEssay() {
    essayOn = true;
    applyEssayText();
    startEssayObserver();
  }

  function stopEssay() {
    essayOn = false;
    stopEssayObserver();
    restoreEssayText();
    essayCursor = 0;
  }

  const SCATTER_BOX_SELECTOR = [
    ".meter-card",
    ".search-form",
    ".login-form",
    ".catalog-detail-body",
    ".catalog-results-head",
    ".show-hero",
    ".freezer-section",
    ".library-card",
    ".catalog-card",
    ".library-delete-card",
    "dialog",
    ".status-banner"
  ].join(",");

  const SCATTER_SELECTOR = [
    ".brand-glitch",
    "#filter.header-filter",
    ".music-mute",
    ".tabs .tab",
    ".meter-card",
    ".search-form",
    ".login-form",
    ".catalog-results-head",
    ".catalog-detail-body",
    ".show-hero",
    ".freezer-section",
    ".library-card",
    ".catalog-card",
    "button.episode",
    "#freezer-filter",
    "button.ghost",
    "a.ghost",
    ".punished-gate",
    ".library-delete-card",
    "dialog",
    ".status-banner"
  ].join(",");

  const SCATTER_VARS = ["--p-dx", "--p-dy", "--p-rot"];
  let scatterOn = false;
  let scatterObs = null;

  function scatterRand(min, max) {
    return min + Math.random() * (max - min);
  }

  function scatterSign() {
    return Math.random() < 0.5 ? -1 : 1;
  }

  function canScatter(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest("#splash, #punished-veil, #rite-fx, .splash-pin-form, #splash-pin")) return false;
    if (el.closest("#download-queue-list, .download-queue-item")) return false;
    if (el.classList.contains("freezer-corner") || el.classList.contains("poster-delete")) return false;
    const parent = el.parentElement;
    if (!parent) return true;
    const scattered = parent.closest(".punished-scatter");
    if (scattered && scattered !== el) return false;
    const box = parent.closest(SCATTER_BOX_SELECTOR);
    if (box && box !== el) return false;
    return true;
  }

  function pinGuardRect() {
    if (!document.documentElement.classList.contains("is-pin-locked")) return null;
    const form = document.getElementById("splash-pin-form");
    if (!form || form.hidden) return null;
    return form.getBoundingClientRect();
  }

  function rectsOverlap(a, b, pad) {
    return !(
      a.right + pad < b.left
      || a.left - pad > b.right
      || a.bottom + pad < b.top
      || a.top - pad > b.bottom
    );
  }

  function clampScatter(el, dx, dy) {
    const pad = 10;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = dx;
    let y = dy;
    if (r.left + x < pad) x = pad - r.left;
    if (r.right + x > vw - pad) x = vw - pad - r.right;
    if (r.top + y < pad) y = pad - r.top;
    if (r.bottom + y > vh - pad) y = vh - pad - r.bottom;
    const pin = pinGuardRect();
    if (pin) {
      const moved = {
        left: r.left + x,
        right: r.right + x,
        top: r.top + y,
        bottom: r.bottom + y
      };
      if (rectsOverlap(moved, pin, 16)) {
        x = 0;
        y = 0;
      }
    }
    return { x, y };
  }

  function scatterAmounts(el) {
    let dist = 16;
    let rot = 4.4;
    if (el.matches(".brand-glitch, #filter.header-filter, .music-mute, .tabs .tab, .punished-gate")) {
      dist = scatterRand(8, 18);
      rot = scatterRand(2.2, 5.8);
    } else if (el.matches(".library-card, .catalog-card, button.episode")) {
      dist = scatterRand(10, 22);
      rot = scatterRand(2.6, 6.8);
    } else if (el.matches(".meter-card, .search-form, .show-hero, .catalog-detail-body, .freezer-section, .library-delete-card")) {
      dist = scatterRand(14, 30);
      rot = scatterRand(3.0, 7.8);
    } else {
      dist = scatterRand(10, 24);
      rot = scatterRand(2.4, 6.5);
    }
    const angle = Math.random() * Math.PI * 2;
    return {
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      rot: scatterSign() * rot
    };
  }

  function clearScatterNode(el) {
    if (!el?.classList) return;
    el.classList.remove("punished-scatter");
    SCATTER_VARS.forEach((name) => el.style.removeProperty(name));
    el.style.removeProperty("transform");
  }

  function clearScatter() {
    document.querySelectorAll(".punished-scatter").forEach(clearScatterNode);
  }

  function applyScatter(root, reroll) {
    if (!scatterOn) return;
    document.querySelectorAll("#download-queue-list .punished-scatter").forEach(clearScatterNode);
    const scope = root && root.querySelectorAll ? root : document;
    const found = scope.querySelectorAll ? [...scope.querySelectorAll(SCATTER_SELECTOR)] : [];
    if (root && root.matches?.(SCATTER_SELECTOR)) found.unshift(root);
    found.forEach((el) => {
      if (!canScatter(el)) {
        if (el.classList.contains("punished-scatter")) clearScatterNode(el);
        return;
      }
      if (el.classList.contains("punished-scatter") && !reroll) return;
      const amt = scatterAmounts(el);
      const clamped = clampScatter(el, amt.dx, amt.dy);
      el.classList.add("punished-scatter");
      el.style.setProperty("--p-dx", `${clamped.x.toFixed(1)}px`);
      el.style.setProperty("--p-dy", `${clamped.y.toFixed(1)}px`);
      el.style.setProperty("--p-rot", `${amt.rot.toFixed(2)}deg`);
    });
  }

  function stopScatterObserver() {
    if (scatterObs) {
      scatterObs.disconnect();
      scatterObs = null;
    }
  }

  function startScatterObserver() {
    stopScatterObserver();
    if (typeof MutationObserver !== "function") return;
    scatterObs = new MutationObserver((records) => {
      if (!scatterOn) return;
      for (const rec of records) {
        rec.addedNodes.forEach((node) => {
          if (!node || node.nodeType !== 1) return;
          if (node.closest?.("#splash, #punished-veil, #rite-fx")) return;
          applyScatter(node, false);
        });
      }
    });
    scatterObs.observe(document.body, { childList: true, subtree: true });
  }

  function startScatter(reroll) {
    scatterOn = true;
    if (reroll) clearScatter();
    applyScatter(document, Boolean(reroll));
    startScatterObserver();
  }

  function stopScatter() {
    scatterOn = false;
    stopScatterObserver();
    clearScatter();
  }

  function applyTheme(opts) {
    document.documentElement.classList.add("is-punished");
    persist(true);
    suppressSplash();
    startScatter(true);
    if (!opts || !opts.deferFx) showCrtOverlay();
    if (window.CinaRipAudio && typeof window.CinaRipAudio.setRiteMusic === "function") {
      window.CinaRipAudio.setRiteMusic(true);
    }
    applyRiteGraphics()
      .catch(() => {})
      .finally(() => {
        if (window.CinaRipAudio && typeof window.CinaRipAudio.refreshMuteIcon === "function") {
          window.CinaRipAudio.refreshMuteIcon();
        }
        syncGate();
        if (!opts || !opts.deferFx) startFx();
        suppressSplash();
        startEssay();
        applyScatter(document, false);
      });
    syncGate();
    startEssay();
  }

  function clearTheme() {
    stopEssay();
    stopScatter();
    stopFx();
    document.documentElement.classList.remove("is-punished");
    persist(false);
    restoreGraphics();
    if (window.CinaRipAudio && typeof window.CinaRipAudio.setRiteMusic === "function") {
      window.CinaRipAudio.setRiteMusic(false);
    }
    if (window.CinaRipAudio && typeof window.CinaRipAudio.refreshMuteIcon === "function") {
      window.CinaRipAudio.refreshMuteIcon();
    }
    syncGate();
    suppressSplash();
  }

  function syncGate() {
    const gate = document.getElementById("punished-gate");
    if (!gate) return;
    const on = document.documentElement.classList.contains("is-punished");
    gate.setAttribute("aria-pressed", on ? "true" : "false");
    gate.classList.toggle("is-on", on);
  }

  function suppressSplash() {
    if (document.documentElement.classList.contains("is-pin-locked")) return;
    const form = document.getElementById("splash-pin-form");
    if (form && !form.hidden) return;
    if (window.CinaRipSplash && typeof window.CinaRipSplash.suppress === "function") {
      window.CinaRipSplash.suppress();
    }
    const splash = document.getElementById("splash");
    if (!splash) return;
    splash.hidden = true;
    splash.setAttribute("aria-hidden", "true");
    splash.setAttribute("aria-busy", "false");
    splash.style.opacity = "0";
    splash.style.pointerEvents = "none";
    splash.style.visibility = "hidden";
  }

  function setRiteRunning(on) {
    document.documentElement.classList.toggle("is-rite-running", Boolean(on));
    suppressSplash();
  }

  async function fadeMusicBack(audio) {
    try {
      if (localStorage.getItem("cinarip.music.muted") === "1") return;
    } catch {
      // ignore
    }
    if (audio && typeof audio.fadeMusic === "function") audio.fadeMusic(0.34, 1800);
  }

  async function runMercy() {
    if (running) return;
    const veil = document.getElementById("punished-veil");
    const copy = document.getElementById("punished-copy");
    const gate = document.getElementById("punished-gate");
    if (!veil) return;
    running = true;
    if (gate) gate.disabled = true;
    if (copy) copy.style.opacity = "0";
    setRiteRunning(true);
    await loadFx();

    const audio = window.CinaRipAudio;
    if (audio && typeof audio.unlock === "function") audio.unlock();
    unlockTvSound();
    if (audio && typeof audio.fadeMusic === "function") audio.fadeMusic(0, 700);

    veil.hidden = false;
    veil.setAttribute("aria-hidden", "false");
    await tween({
      targets: veil,
      opacity: [0, 1],
      duration: 700,
      easing: "easeInOutCubic"
    });
    await burstStatic(() => {
      clearTheme();
    }, 360);
    veil.hidden = true;
    veil.setAttribute("aria-hidden", "true");
    if (audio && typeof audio.setAmbientPlaying === "function") audio.setAmbientPlaying(true);
    await fadeMusicBack(audio);
    if (gate) gate.disabled = false;
    setRiteRunning(false);
    running = false;
  }

  async function runRite() {
    if (running) return;
    const veil = document.getElementById("punished-veil");
    const copy = document.getElementById("punished-copy");
    const gate = document.getElementById("punished-gate");
    if (!veil || !copy) return;
    running = true;
    if (gate) gate.disabled = true;
    setRiteRunning(true);
    await loadFx();

    const audio = window.CinaRipAudio;
    if (audio && typeof audio.unlock === "function") audio.unlock();
    if (audio && typeof audio.primeRiteAudio === "function") audio.primeRiteAudio();
    unlockTvSound();
    if (audio && typeof audio.fadeMusic === "function") audio.fadeMusic(0, 3800);
    if (audio && typeof audio.setAmbientPlaying === "function") audio.setAmbientPlaying(false);

    veil.hidden = false;
    veil.setAttribute("aria-hidden", "false");
    copy.style.opacity = "0";
    await tween({
      targets: veil,
      opacity: [0, 1],
      duration: 3800,
      easing: "easeInOutCubic"
    });
    startSnow(veil);
    await wait(2200);
    await tween({
      targets: copy,
      opacity: [0, 1],
      duration: 1700,
      easing: "easeOutQuad"
    });
    startCopyGlitch(copy);
    await wait(3400);
    stopCopyGlitch(copy);
    await tween({
      targets: copy,
      opacity: 0,
      duration: 2400,
      easing: "easeInQuad"
    });
    stopSnow();
    veil.hidden = true;
    veil.setAttribute("aria-hidden", "true");
    veil.style.opacity = "0";
    copy.style.opacity = "0";
    applyTheme({ deferFx: true });
    suppressSplash();
    startFx();
    if (tvSound && typeof tvSound.hum === "function") tvSound.hum(true);
    if (audio && typeof audio.setAmbientPlaying === "function") audio.setAmbientPlaying(true);
    await fadeMusicBack(audio);
    if (gate) gate.disabled = false;
    setRiteRunning(false);
    running = false;
  }

  function onGateClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const gate = document.getElementById("punished-gate");
    const action = isOn() || document.documentElement.classList.contains("is-punished")
      ? runMercy
      : runRite;
    action().catch(() => {
      running = false;
      setRiteRunning(false);
      stopSnow();
      if (gate) gate.disabled = false;
    });
  }

  function boot() {
    loadFx().catch(() => {});
    if (isOn()) applyTheme();
    else syncGate();
    const gate = document.getElementById("punished-gate");
    if (gate) gate.addEventListener("click", onGateClick);
  }

  window.CinaRipPunished = {
    isOn() {
      return isOn() || document.documentElement.classList.contains("is-punished");
    },
    keepCursedText: skipEssayTarget,
    skipEssayTarget
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
