"use strict";

(function () {
  const DEFAULT_TTL_SEC = 30 * 60;
  const SESSION_POLL_MS = 20_000;
  const MAX_TIMEOUT_MS = 2_147_483_647;

  let unlocked = false;
  let locking = false;
  let lockTimer = 0;
  let sessionPollTimer = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function setError(message) {
    const el = $("splash-auth-error");
    if (!el) return;
    const text = String(message || "").trim();
    el.textContent = text;
    el.hidden = !text;
  }

  function showSplash() {
    const splash = $("splash");
    if (!splash) return;
    splash.hidden = false;
    splash.removeAttribute("aria-hidden");
    splash.setAttribute("aria-busy", "false");
    splash.style.pointerEvents = "auto";
    splash.style.opacity = "1";
    splash.style.visibility = "visible";
    splash.style.display = "";
  }

  function showPin(show) {
    const form = $("splash-pin-form");
    const ready = $("splash-ready");
    const label = $("splash-label");
    if (label) label.hidden = true;
    if (form) form.hidden = !show;
    if (ready) ready.hidden = show;
    if (show) {
      showSplash();
      $("splash-pin")?.focus();
    }
  }

  function lockDurationLabel(ttlSec) {
    const sec = Math.max(60, Number(ttlSec) || DEFAULT_TTL_SEC);
    if (sec >= 3600 && sec % 3600 === 0) {
      const hours = sec / 3600;
      return hours === 1 ? "1 hour" : `${hours} hours`;
    }
    const minutes = Math.max(1, Math.round(sec / 60));
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }

  function describeLock(ttlSec) {
    const el = $("site-auth-email");
    if (!el) return;
    el.textContent = `Unlock uses the shared APP_PIN. The library re-locks after ${lockDurationLabel(ttlSec)}.`;
  }

  function stopWatchdog() {
    if (lockTimer) {
      window.clearTimeout(lockTimer);
      lockTimer = 0;
    }
    if (sessionPollTimer) {
      window.clearInterval(sessionPollTimer);
      sessionPollTimer = 0;
    }
  }

  async function readJson(url, options) {
    const res = await fetch(url, { credentials: "same-origin", ...(options || {}) });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  async function lockNow() {
    if (locking) return;
    locking = true;
    stopWatchdog();
    unlocked = false;
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      // still reload so the splash is the source of truth
    }
    location.reload();
  }

  function scheduleLock(expiresAt) {
    const expiry = Number(expiresAt) || 0;
    if (!expiry) return;
    const delay = expiry - Date.now();
    if (delay <= 0) {
      lockNow().catch(() => {});
      return;
    }
    const wait = Math.min(delay, MAX_TIMEOUT_MS);
    lockTimer = window.setTimeout(() => {
      lockTimer = 0;
      if (wait < delay) {
        scheduleLock(expiry);
        return;
      }
      lockNow().catch(() => {});
    }, wait);
  }

  function startWatchdog(expiresAt) {
    stopWatchdog();
    scheduleLock(expiresAt);
    sessionPollTimer = window.setInterval(() => {
      readJson("/api/auth/session")
        .then((result) => {
          if (!result.data?.loggedIn) {
            lockNow().catch(() => {});
            return;
          }
          const expiry = Number(result.data.expiresAt) || 0;
          if (expiry && expiry <= Date.now()) lockNow().catch(() => {});
        })
        .catch(() => {});
    }, SESSION_POLL_MS);
  }

  async function submitPin(event) {
    event.preventDefault();
    const input = $("splash-pin");
    const pin = String(input?.value || "");
    if (!pin) {
      setError("Enter the PIN.");
      return;
    }
    const result = await readJson("/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin })
    });
    if (result.data?.ok) {
      setError("");
      unlocked = true;
      startWatchdog(result.data.expiresAt);
      location.assign("/");
      return;
    }
    if (input) input.value = "";
    setError(result.data?.error || "Wrong PIN");
    input?.focus();
  }

  function wire() {
    const form = $("splash-pin-form");
    const ready = $("splash-ready");
    if (form && !form.dataset.pinWired) {
      form.dataset.pinWired = "1";
      form.addEventListener("submit", (event) => {
        submitPin(event).catch(() => setError("Could not reach the lock."));
      });
    }
    if (ready && !ready.dataset.pinWired) {
      ready.dataset.pinWired = "1";
      ready.addEventListener(
        "click",
        (event) => {
          if (unlocked) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          showPin(true);
        },
        true
      );
    }
  }

  async function boot() {
    wire();
    try {
      const [session, config] = await Promise.all([
        readJson("/api/auth/session"),
        readJson("/api/auth/config")
      ]);
      describeLock(config.data?.ttlSec || session.data?.ttlSec);
      unlocked = Boolean(session.data?.loggedIn);
      if (unlocked) {
        showPin(false);
        setError("");
        startWatchdog(session.data?.expiresAt);
        return;
      }
      stopWatchdog();
      showPin(true);
      if (config.status === 404) {
        setError("This app is still running a server without the PIN lock. Restart CinaRip.");
      } else if (!config.data?.configured) {
        setError("Set APP_PIN (or CINARIP_PIN) and restart the app.");
      } else if (config.data?.locked) {
        setError("Too many attempts. Try again in a moment.");
      }
    } catch {
      showPin(true);
      setError("Could not reach the lock.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot().catch(() => {}));
  } else {
    boot().catch(() => {});
  }
})();
