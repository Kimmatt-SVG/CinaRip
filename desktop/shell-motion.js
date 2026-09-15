(() => {
  const api = globalThis.anime || null;

  function motionLevel() {
    if (!api?.animate) return "off";
    const stored = String(localStorage.getItem("streamMotion") || "").toLowerCase();
    if (stored === "reduce" || stored === "off") return stored === "off" ? "off" : "reduce";
    if (stored === "full") return "full";
    // Default to full catalog motion in the desktop app.
    // OS "prefers-reduced-motion" often mirrors Windows animation settings and was
    // skipping every entrance effect; set localStorage.streamMotion = "reduce" to soften.
    return "full";
  }

  function ready() {
    return motionLevel() !== "off";
  }

  function nodesFrom(targets) {
    if (!targets) return [];
    return [...(targets.length != null && !targets.tagName ? targets : [targets])].filter(Boolean);
  }

  function freeze(targets, props) {
    const nodes = nodesFrom(targets);
    if (!nodes.length) return;
    if (api?.set) {
      api.set(nodes, props);
      return;
    }
    if (api?.utils?.set) {
      api.utils.set(nodes, props);
      return;
    }
    for (const node of nodes) {
      if (props.opacity != null) node.style.opacity = String(props.opacity);
      const x = props.x || 0;
      const y = props.y || 0;
      const scale = props.scale != null ? props.scale : 1;
      node.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }
  }

  function clearInline(targets) {
    for (const node of nodesFrom(targets)) {
      node.style.opacity = "";
      node.style.transform = "";
    }
  }

  function animateCatalogHome(root) {
    if (!ready() || !root) return;
    const level = motionLevel();
    const hero = root.querySelector(".anime-hero") || root.querySelector(".catalog-home-hero") || root;
    const panels = root.querySelectorAll(".home-panel");
    freeze(hero, { opacity: 0, y: level === "full" ? 14 : 0 });
    if (panels.length) freeze(panels, { opacity: 0, y: level === "full" ? 16 : 0 });
    api.animate(hero, {
      opacity: 1,
      y: 0,
      duration: level === "full" ? 420 : 160,
      ease: "outCubic",
      onComplete: () => clearInline(hero)
    });
    if (panels.length) {
      api.animate(panels, {
        opacity: 1,
        y: 0,
        duration: level === "full" ? 460 : 160,
        delay: level === "full" ? api.stagger(40, { start: 80 }) : 0,
        ease: "outCubic",
        onComplete: () => clearInline(panels)
      });
    }
    setTimeout(() => {
      clearInline(hero);
      clearInline(panels);
    }, level === "full" ? 900 : 350);
  }

  function animateCatalogGrid(cards) {
    const list = nodesFrom(cards);
    if (!list.length) return;
    if (!ready()) {
      clearInline(list);
      return;
    }

    const level = motionLevel();
    freeze(list, {
      opacity: 0,
      y: level === "full" ? 18 : 0,
      scale: level === "full" ? 0.98 : 1
    });
    api.animate(list, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: level === "full" ? 420 : 160,
      delay: level === "full" ? api.stagger(48, { start: 60 }) : 0,
      ease: "outCubic",
      onComplete: () => clearInline(list)
    });
  }

  function animateCatalogDetail(root) {
    if (!root) return;
    const poster = root.querySelector(".catalog-detail-poster");
    const meta = root.querySelector(".catalog-detail-meta");
    const actions = root.querySelector(".catalog-detail-actions");
    const parts = [poster, meta, actions].filter(Boolean);

    if (!ready()) {
      clearInline(parts);
      return;
    }

    const level = motionLevel();
    if (level === "reduce") {
      freeze(parts, { opacity: 0 });
      api.animate(parts, {
        opacity: 1,
        duration: 180,
        ease: "outQuad",
        onComplete: () => clearInline(parts)
      });
      return;
    }

    if (poster) freeze(poster, { opacity: 0, x: -18, scale: 0.97 });
    if (meta) freeze(meta, { opacity: 0, y: 14 });
    if (actions) freeze(actions, { opacity: 0, y: 10 });

    const timeline = api.createTimeline({
      defaults: { ease: "outCubic" },
      onComplete: () => clearInline(parts)
    });
    if (poster) {
      timeline.add(poster, {
        opacity: 1,
        x: 0,
        scale: 1,
        duration: 420
      });
    }
    if (meta) {
      timeline.add(
        meta,
        {
          opacity: 1,
          y: 0,
          duration: 360
        },
        poster ? "-=260" : 0
      );
    }
    if (actions) {
      timeline.add(
        actions,
        {
          opacity: 1,
          y: 0,
          duration: 320
        },
        "-=220"
      );
    }
  }

  function pulseQueueChrome() {
    const target =
      document.querySelector("#download-queue-summary") ||
      document.querySelector(".download-queue-head strong");
    if (!ready() || !target) return;
    const level = motionLevel();
    api.animate(target, {
      scale: level === "full" ? [1, 1.06, 1] : [1, 1.02, 1],
      duration: level === "full" ? 420 : 180,
      ease: "outQuad",
      onComplete: () => clearInline(target)
    });
  }

  const boundPosters = new WeakSet();

  function mediaTarget(node) {
    return (
      node.querySelector(".catalog-card-poster, .library-banner, .library-banner-fallback") || node
    );
  }

  function animatePosterHover(node, entering) {
    if (!ready() || !node) return;
    const level = motionLevel();
    const media = mediaTarget(node);
    const full = level === "full";
    api.animate(node, {
      y: entering ? (full ? -8 : -3) : 0,
      scale: entering ? (full ? 1.04 : 1.015) : 1,
      duration: entering ? (full ? 220 : 120) : full ? 200 : 110,
      ease: entering ? "outQuad" : "outCubic"
    });
    if (media && media !== node) {
      api.animate(media, {
        scale: entering ? (full ? 1.05 : 1.02) : 1,
        duration: entering ? (full ? 240 : 120) : full ? 200 : 110,
        ease: entering ? "outQuad" : "outCubic"
      });
    }
  }

  function animatePosterPress(node, pressed) {
    if (!ready() || !node) return;
    const level = motionLevel();
    const full = level === "full";
    api.animate(node, {
      scale: pressed ? (full ? 0.96 : 0.985) : full ? 1.04 : 1.015,
      y: pressed ? (full ? -2 : -1) : full ? -8 : -3,
      duration: pressed ? 90 : 160,
      ease: pressed ? "inQuad" : "outBack"
    });
  }

  function animatePosterClick(node) {
    if (!ready() || !node) return;
    const level = motionLevel();
    const full = level === "full";
    api.animate(node, {
      scale: [full ? 0.95 : 0.98, full ? 1.06 : 1.02, 1],
      y: [full ? -2 : -1, full ? -10 : -4, 0],
      duration: full ? 420 : 200,
      ease: "outBack"
    });
  }

  function bindPosterInteractions(targets) {
    const list = nodesFrom(targets);
    for (const node of list) {
      if (!node || boundPosters.has(node)) continue;
      boundPosters.add(node);
      node.classList.add("motion-poster");

      node.addEventListener("pointerenter", () => animatePosterHover(node, true));
      node.addEventListener("pointerleave", () => {
        animatePosterHover(node, false);
        clearInline(mediaTarget(node));
      });
      node.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        animatePosterPress(node, true);
      });
      node.addEventListener("pointerup", () => animatePosterPress(node, false));
      node.addEventListener("pointercancel", () => animatePosterHover(node, false));
      node.addEventListener("click", () => animatePosterClick(node));
    }
  }

  window.shellMotion = {
    ready,
    motionLevel,
    animateCatalogHome,
    animateCatalogGrid,
    animateCatalogDetail,
    pulseQueueChrome,
    bindPosterInteractions,
    animatePosterHover,
    animatePosterClick
  };
})();