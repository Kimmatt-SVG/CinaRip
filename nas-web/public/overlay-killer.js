(() => {
  if (window.__cinaripOverlayKiller) return;
  window.__cinaripOverlayKiller = true;

  const nativeOpen = window.open.bind(window);
  window.open = function (url) {
    try {
      const host = new URL(String(url || ""), location.href).hostname;
      if (/(^|\.)(google\.com|gstatic\.com|recaptcha\.net|tornadomovies\.co)$/i.test(host)) {
        return nativeOpen.apply(window, arguments);
      }
    } catch {
      // blocked
    }
    return null;
  };

  const JUNK =
    /video can'?t be played|update your browser|enable notifications|congratulations[,!]? you|you(?:'| ha)?ve been selected|claim your (prize|reward)|install (our )?app|download (our )?app|whoops[! ]|adblocker detected|disable your ad.?block|better experience.{0,40}update/i;

  function textOf(el) {
    return String(el.innerText || el.textContent || "")
      .replace(/\s+/g, " ")
      .slice(0, 600);
  }

  function isKeep(el) {
    if (!el) return false;
    if (el.id === "cinarip-finish-bar" || (el.closest && el.closest("#cinarip-finish-bar"))) return true;
    if (!el.querySelector) return false;
    if (el.querySelector("#cinarip-finish-bar, iframe[src*='recaptcha'], iframe[src*='google.com/recaptcha'], #login-form, [name='SignupForm[email]']")) {
      return true;
    }
    return false;
  }

  function covers(el) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (style.position !== "fixed" && style.position !== "absolute") return false;
    const box = el.getBoundingClientRect();
    return box.width >= innerWidth * 0.5 && box.height >= innerHeight * 0.35;
  }

  function shouldRemove(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (isKeep(el)) return false;
    const text = textOf(el);
    if (JUNK.test(text)) return true;
    if (covers(el) && (text.length < 12 || JUNK.test(text))) return true;
    return false;
  }

  function sweep() {
    const nodes = document.querySelectorAll("div,section,aside,dialog,a,button");
    for (const el of [...nodes]) {
      if (!shouldRemove(el)) continue;
      const root =
        el.closest("dialog,[role='dialog'],[class*='modal'],[class*='popup'],[class*='overlay']") || el;
      if (isKeep(root)) continue;
      try {
        root.remove();
      } catch {
        // ignore
      }
    }
    document.documentElement.style.setProperty("overflow", "auto", "important");
    if (document.body) document.body.style.setProperty("overflow", "auto", "important");
  }

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target.closest("a,button");
      if (!target) return;
      const label = textOf(target);
      if (/^update$/i.test(label.trim()) || /update your browser/i.test(label)) {
        event.preventDefault();
        event.stopPropagation();
        try {
          (target.closest("div,section,dialog") || target).remove();
        } catch {
          // ignore
        }
        return;
      }
      if (target.tagName === "A" && target.target === "_blank") {
        try {
          const host = new URL(target.href, location.href).hostname;
          if (!/(^|\.)(tornadomovies\.co|google\.com|recaptcha\.net)$/i.test(host)) {
            event.preventDefault();
            event.stopPropagation();
          }
        } catch {
          event.preventDefault();
        }
      }
    },
    true
  );

  new MutationObserver(sweep).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(sweep, 400);
  sweep();
})();
