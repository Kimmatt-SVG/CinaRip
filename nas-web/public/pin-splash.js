"use strict";

(function () {
  const DEFAULT_TTL_SEC = 30 * 60;
  const SESSION_POLL_MS = 20_000;
  const MAX_TIMEOUT_MS = 2_147_483_647;
  const SPLASH_SESSION_KEY = "cinarip.splash.dismissed";

  let unlocked = false;
  let locking = false;
  let lockTimer = 0;
  let sessionPollTimer = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function setLockedClass(locked) {
    document.documentElement.classList.toggle("is-pin-locked", Boolean(locked));
  }

  function forgetSplashDismissed() {
    try {
      sessionStorage.removeItem(SPLASH_SESSION_KEY);
    } catch {
      // ignore quota / private mode
    }
  }

  function setError(message) {
    const el = $("splash-auth-error");
    if (!el) return;
    const text = String(message || "").trim();
    el.textContent = text;
    el.hidden = !text;
  }

  function syncPinLook() {
    const input = $("splash-pin");
    if (input) input.classList.toggle("has-value", Boolean(input.value));
  }

  function clearPinField() {
    const input = $("splash-pin");
    const form = $("splash-pin-form");
    if (form) form.reset();
    if (input) {
      input.value = "";
      input.defaultValue = "";
      input.classList.remove("has-value");
    }
    setError("");
    window.requestAnimationFrame(() => {
      const again = $("splash-pin");
      if (again) {
        again.value = "";
        again.classList.remove("has-value");
      }
    });
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

  function showPin(animate) {
    const form = $("splash-pin-form");
    const label = $("splash-label");
    forgetSplashDismissed();
    setLockedClass(true);
    clearPinField();
    if (label) label.hidden = true;
    if (form) form.hidden = false;
    if (window.CinaRipSplash && typeof window.CinaRipSplash.lock === "function") {
      return window.CinaRipSplash.lock({ animate: Boolean(animate) });
    }
    showSplash();
    $("splash-pin")?.focus();
    return Promise.resolve();
  }

  function hidePinForm() {
    const form = $("splash-pin-form");
    if (form) form.hidden = true;
    setLockedClass(false);
  }

  async function lockNow() {
    if (locking) return;
    locking = true;
    stopWatchdog();
    unlocked = false;
    forgetSplashDismissed();
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      // still show the PIN splash
    }
    await showPin(true);
    locking = false;
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
      setLockedClass(false);
      if (input) {
        input.value = "";
        input.classList.remove("has-value");
      }
      startWatchdog(result.data.expiresAt);
      if (window.CinaRipSplash && typeof window.CinaRipSplash.enter === "function") {
        await window.CinaRipSplash.enter({ refresh: true });
      }
      hidePinForm();
      return;
    }
    if (input) input.value = "";
    setError(result.data?.error || "Wrong PIN");
    input?.focus();
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

  function wire() {
    const form = $("splash-pin-form");
    const lockForm = $("site-logout-form");
    if (form && !form.dataset.pinWired) {
      form.dataset.pinWired = "1";
      form.addEventListener("submit", (event) => {
        submitPin(event).catch(() => setError("Could not reach the lock."));
      });
      $("splash-pin")?.addEventListener("input", syncPinLook);
    }
    if (lockForm && !lockForm.dataset.pinWired) {
      lockForm.dataset.pinWired = "1";
      lockForm.addEventListener("submit", (event) => {
        event.preventDefault();
        lockNow().catch(() => {});
      });
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
        hidePinForm();
        setError("");
        startWatchdog(session.data?.expiresAt);
        if (window.CinaRipSplash && typeof window.CinaRipSplash.enter === "function") {
          window.CinaRipSplash.enter({ refresh: false });
        }
        return;
      }
      stopWatchdog();
      showPin(false);
      if (config.status === 404) {
        setError("This app is still running a server without the PIN lock. Restart CinaRip.");
      } else if (!config.data?.configured) {
        setError("Set APP_PIN (or CINARIP_PIN) and restart the app.");
      } else if (config.data?.locked) {
        setError("Too many attempts. Try again in a moment.");
      }
    } catch {
      showPin(false);
      setError("Could not reach the lock.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot().catch(() => {}));
  } else {
    boot().catch(() => {});
  }
})();
