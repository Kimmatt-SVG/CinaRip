const IDENTITY_COOKIE_NAMES = new Set(["identity", "_identity"]);

function isTornadoSite(url) {
  try {
    return /(?:^|\.)tornadomovies\.co$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isIdentityCookieName(name) {
  return IDENTITY_COOKIE_NAMES.has(String(name || "").toLowerCase());
}

async function sessionHasTornadoIdentity(session, siteUrl) {
  if (!session) return false;
  const cookies = [];
  try {
    cookies.push(...(await session.cookies.get({ domain: "tornadomovies.co" })));
  } catch {
    // domain filter is optional
  }
  if (siteUrl) {
    try {
      cookies.push(...(await session.cookies.get({ url: siteUrl })));
    } catch {
      // ignore invalid urls
    }
  }
  return cookies.some((cookie) => isIdentityCookieName(cookie?.name) && cookie?.value);
}

async function pageShowsTornadoLoggedIn(contents) {
  if (!contents || contents.isDestroyed()) return false;
  try {
    return await contents.executeJavaScript(
      `Boolean(document.querySelector('a[href*="/user/logout"], a[href*="logout"], a[href*="signout"], a[href*="sign-out"]'))`
    );
  } catch {
    return false;
  }
}

function isSiteLoginUrl(url) {
  return isTornadoSite(url);
}

function buildCsrfRefreshScript() {
  return `
(async () => {
  const response = await fetch(location.origin + "/tornado-1", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store"
  });
  const html = await response.text();
  const paramMatch = html.match(/name="csrf-param" content="([^"]+)"/i);
  const tokenMatch = html.match(/name="csrf-token" content="([^"]+)"/i);
  const paramMeta = document.querySelector('meta[name="csrf-param"]');
  const tokenMeta = document.querySelector('meta[name="csrf-token"]');

  if (!paramMatch || !tokenMatch || !paramMeta || !tokenMeta) {
    return { ok: false, status: "csrf-meta-not-found" };
  }

  paramMeta.setAttribute("content", paramMatch[1]);
  tokenMeta.setAttribute("content", tokenMatch[1]);

  return {
    ok: true,
    status: "csrf-refreshed",
    param: paramMatch[1],
    tokenLength: tokenMatch[1].length
  };
})();
`;
}

function buildSiteLoginPatchesScript(loginPageUrl) {
  const loginUrlJson = JSON.stringify(loginPageUrl);

  return `
(() => {
  const LOGIN_PAGE = ${loginUrlJson};

  const pushDebug = (type, data = {}) => {
    console.log("[TornadoLoginDebug]", JSON.stringify({ ts: new Date().toISOString(), type, ...data }));
  };

  const updateCsrfFromHtml = (html) => {
    const paramMatch = html.match(/name="csrf-param" content="([^"]+)"/i);
    const tokenMatch = html.match(/name="csrf-token" content="([^"]+)"/i);
    const paramMeta = document.querySelector('meta[name="csrf-param"]');
    const tokenMeta = document.querySelector('meta[name="csrf-token"]');
    if (!paramMatch || !tokenMatch || !paramMeta || !tokenMeta) return null;
    paramMeta.setAttribute("content", paramMatch[1]);
    tokenMeta.setAttribute("content", tokenMatch[1]);
    return { param: paramMatch[1], token: tokenMatch[1] };
  };

  const patchShowLogin = () => {
    if (!window.User || window.__tornadoShowLoginPatched) return;
    if (typeof window.User.showLogin !== "function") return;
    window.User.showLogin = function redirectShowLogin() {
      pushDebug("show-login-redirect", { target: LOGIN_PAGE });
      window.location.href = LOGIN_PAGE;
    };
    window.__tornadoShowLoginPatched = true;
  };

  const patchLoginSubmit = () => {
    if (!window.User || window.__tornadoLoginSubmitPatched) return;
    if (typeof window.User.loginSubmit !== "function") return;

    window.User.loginSubmit = function patchedLoginSubmit(button, flag) {
      if (window.__tornadoLoginBusy) return false;
      window.__tornadoLoginBusy = true;

      const form = document.getElementById("login-form");
      const isModal = Boolean(form?.querySelector('input[name="SignupForm[email]"]'));

      pushDebug("login-submit-click", { mode: isModal ? "modal" : "page" });

      if (!isModal) {
        window.__tornadoLoginBusy = false;
        if (form) form.submit();
        return false;
      }

      const finish = () => {
        if (window.jQuery && button) {
          window.jQuery(button).removeClass("loadButton").attr("disabled", false);
        }
        setTimeout(() => {
          window.__tornadoLoginBusy = false;
        }, 1500);
      };

      if (window.jQuery && button) {
        window.jQuery(button).addClass("loadButton").attr("disabled", true);
      }

      (async () => {
        try {
          if (!form) {
            pushDebug("login-submit-error", { error: "login-form-not-found" });
            finish();
            return;
          }

          await fetch("/user/login", {
            method: "GET",
            credentials: "same-origin",
            headers: { "X-Requested-With": "XMLHttpRequest" }
          });

          const homeRes = await fetch("/tornado-1", {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store"
          });
          const html = await homeRes.text();
          const csrf = updateCsrfFromHtml(html);
          if (!csrf) {
            pushDebug("login-submit-error", { error: "csrf-not-found" });
            finish();
            return;
          }
          pushDebug("csrf-refresh-before-submit", { ok: true, tokenLength: csrf.token.length });

          const params = new URLSearchParams();
          const fd = new FormData(form);
          for (const [key, value] of fd.entries()) {
            params.append(key, value);
          }

          let recaptcha = "";
          try {
            recaptcha = typeof grecaptcha !== "undefined" ? grecaptcha.getResponse() || "" : "";
          } catch {
            recaptcha = "";
          }

          params.set("SignupForm[reCaptcha]", recaptcha);
          params.set(
            "notification",
            String("Notification" in window && Notification.permission === "granted")
          );
          params.set(csrf.param, csrf.token);

          const mid = document.querySelector("#player_block_wrap")?.getAttribute("data-mid");
          if (mid) params.set("m_id", mid);

          pushDebug("login-request", {
            mode: "modal-fetch",
            payloadLength: params.toString().length,
            recaptchaDone: recaptcha.length > 0,
            csrfHeader: true
          });

          const response = await fetch("/user/login", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "X-Requested-With": "XMLHttpRequest",
              "X-CSRF-Token": csrf.token
            },
            body: params.toString()
          });

          const text = await response.text();
          let data = null;
          try {
            data = JSON.parse(text);
          } catch {
            pushDebug("login-error", {
              httpStatus: response.status,
              responseText: text.slice(0, 800)
            });
            finish();
            return;
          }

          window.__tornadoLoginResult = data;
          pushDebug("login-response", {
            httpStatus: response.status,
            success: data.response === true,
            serverMessage: data.msg || data.error || null
          });

          if (data.response === false) {
            try {
              grecaptcha.reset();
            } catch {
              // Ignore recaptcha reset failures.
            }
            if (window.Site?.resizeCaptcha) {
              Site.resizeCaptcha();
              if (window.jQuery) window.jQuery(window).resize(Site.resizeCaptcha);
            }
            if (window.jQuery?.notify) {
              window.jQuery.notify(data.msg, {
                type: "danger",
                animate: { enter: "animated bounceIn", exit: "animated bounceOut" }
              });
            }
            finish();
            return;
          }

          if (flag && window.Player?.getLinks) window.Player.getLinks();
          if (data.html && window.jQuery) window.jQuery("div.auth").html(data.html);
          if (window.jQuery) window.jQuery("#modal_block").modal("hide");
          finish();
        } catch (error) {
          pushDebug("login-error", { thrown: String(error?.message || error) });
          finish();
        }
      })();

      return false;
    };

    window.__tornadoLoginSubmitPatched = true;
  };

  const patchAll = () => {
    patchShowLogin();
    patchLoginSubmit();
  };

  patchAll();
  setInterval(patchAll, 1000);
})();
`;
}

function buildLoginMonitorScript() {
  return `
(() => {
  if (window.__tornadoLoginMonitorInstalled) return;
  window.__tornadoLoginMonitorInstalled = true;
  window.__tornadoLoginResult = null;
  window.__tornadoLoginDebug = [];

  const pushLoginDebug = (type, data = {}) => {
    const entry = { ts: new Date().toISOString(), type, ...data };
    window.__tornadoLoginDebug.push(entry);
    if (window.__tornadoLoginDebug.length > 80) {
      window.__tornadoLoginDebug.shift();
    }
    console.log("[TornadoLoginDebug]", JSON.stringify(entry));
  };

  const recaptchaState = () => {
    let response = "";
    try {
      response = typeof grecaptcha !== "undefined" ? grecaptcha.getResponse() || "" : "";
    } catch (error) {
      return { available: false, error: String(error?.message || error) };
    }
    return {
      available: typeof grecaptcha !== "undefined",
      responseLength: response.length,
      completed: response.length > 0
    };
  };

  const csrfState = () => ({
    param: document.querySelector('meta[name="csrf-param"]')?.getAttribute("content") || null,
    tokenLength:
      document.querySelector('meta[name="csrf-token"]')?.getAttribute("content")?.length || 0
  });

  const formState = () => {
    const form = document.getElementById("login-form");
    if (!form) return { formFound: false };

    const email =
      form.querySelector('input[name="SignupForm[email]"]') ||
      document.getElementById("signupformbuy-email");
    const password =
      form.querySelector('input[name="SignupForm[password]"]') ||
      document.getElementById("signupformbuy-password");

    return {
      formFound: true,
      mode: form.querySelector('input[name="SignupForm[email]"]') ? "modal" : "page",
      emailLength: email?.value?.length || 0,
      passwordLength: password?.value?.length || 0,
      rememberChecked: Boolean(
        form.querySelector('input[name="SignupForm[rememberMe]"][type="checkbox"]')?.checked ||
          document.getElementById("signupformbuy-rememberme")?.checked
      )
    };
  };

  const hookUserLoginSubmit = () => {
    if (!window.User || window.__tornadoLoginSubmitHooked) return;
    if (typeof window.User.loginSubmit !== "function") return;
    window.__tornadoLoginSubmitHooked = true;
  };

  const hookAjax = () => {
    if (!window.jQuery) {
      setTimeout(hookAjax, 250);
      return;
    }

    hookUserLoginSubmit();
    setInterval(hookUserLoginSubmit, 1000);

    window.jQuery(document).ajaxSend((_event, _xhr, settings) => {
      const url = String(settings?.url || "");
      if (settings?.type !== "POST" || !url.includes("/user/login")) return;

      const payload = String(settings.data || "");
      pushLoginDebug("login-request", {
        url,
        payloadLength: payload.length,
        hasEmail: /SignupForm(%5B|\\[)email(%5D|\\])=/i.test(payload),
        hasPassword: /SignupForm(%5B|\\[)password(%5D|\\])=/i.test(payload),
        hasRecaptchaField: /SignupForm(%5B|\\[)reCaptcha(%5D|\\])=/i.test(payload),
        recaptcha: recaptchaState(),
        csrf: csrfState(),
        ...formState()
      });
    });

    window.jQuery(document).ajaxSuccess((_event, xhr, settings, data) => {
      const url = String(settings?.url || "");
      if (settings?.type !== "POST" || !url.includes("/user/login")) return;

      window.__tornadoLoginResult = data;
      pushLoginDebug("login-response", {
        httpStatus: xhr?.status,
        responseType: typeof data,
        response: data,
        serverMessage: data?.msg || data?.error || null,
        success: data?.response === true
      });
    });

    window.jQuery(document).ajaxError((_event, xhr, settings, thrown) => {
      const url = String(settings?.url || "");
      if (!url.includes("/user/login")) return;

      pushLoginDebug("login-error", {
        httpStatus: xhr?.status,
        statusText: xhr?.statusText || null,
        responseText: String(xhr?.responseText || "").slice(0, 800),
        thrown: String(thrown || "")
      });
    });
  };

  hookAjax();
  pushLoginDebug("monitor-installed", { page: location.href });
})();
`;
}

function buildOpenModalScript() {
  return `
(() => {
  if (typeof User !== "undefined" && typeof User.showLogin === "function") {
    User.showLogin();
    return { ok: true, status: "modal-opened" };
  }
  return { ok: false, status: "user-show-login-unavailable" };
})();
`;
}

function buildAutoLoginScript(username, password) {
  const userJson = JSON.stringify(username);
  const passJson = JSON.stringify(password);

  return `
(() => {
  const creds = { username: ${userJson}, password: ${passJson} };

  if (document.querySelector('a[href*="logout"], a[href*="signout"], a[href*="sign-out"]')) {
    return { ok: true, status: "already-logged-in" };
  }

  const setFieldValue = (el, value) => {
    if (!el || value == null) return;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const ensurePageHiddenFields = () => {
    if (typeof changeForm === "function") {
      try {
        changeForm();
      } catch {
        // Ignore plan sync failures on login-only views.
      }
    }

    const prem = document.getElementById("signupformbuy-prem");
    const typePay = document.getElementById("signupformbuy-type_pay");

    if (prem && !prem.value) {
      const activePlan = document.querySelector(".card.active")?.dataset?.plan;
      prem.value = activePlan || prem.querySelector("option")?.value || "1";
      prem.dispatchEvent(new Event("change", { bubbles: true }));
    }

    if (typePay && !typePay.value) {
      const checkedPay = document.querySelector("[name='type_pay']:checked");
      typePay.value =
        checkedPay?.value || typePay.querySelector("option[selected]")?.value || "2";
      typePay.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  const loginForm = document.getElementById("login-form");
  if (!loginForm) {
    return { ok: false, status: "login-form-not-found" };
  }

  const modalEmail = loginForm.querySelector('input[name="SignupForm[email]"]');
  const modalPassword = loginForm.querySelector('input[name="SignupForm[password]"]');
  const modalRemember = loginForm.querySelector('input[name="SignupForm[rememberMe]"][type="checkbox"]');
  const pageEmail = document.getElementById("signupformbuy-email");
  const pagePassword = document.getElementById("signupformbuy-password");
  const pageRemember = document.getElementById("signupformbuy-rememberme");

  const isModalForm = Boolean(modalEmail || modalPassword);
  const email = modalEmail || pageEmail;
  const passwordInput = modalPassword || pagePassword;
  const remember = modalRemember || pageRemember;

  if (!email || !passwordInput) {
    return { ok: false, status: "fields-not-found" };
  }

  if (!isModalForm) {
    const registerForm = document.querySelector(".registerForm");
    const loginFormWrap = document.querySelector(".loginForm");
    if (registerForm) registerForm.style.display = "none";
    if (loginFormWrap) loginFormWrap.style.display = "";
    ensurePageHiddenFields();
  }

  setFieldValue(email, creds.username);
  setFieldValue(passwordInput, creds.password);
  if (remember) remember.checked = true;

  const hasRecaptcha =
    loginForm.querySelector(".g-recaptcha, iframe[src*='recaptcha']") ||
    document.querySelector("script[src*='recaptcha']");

  if (hasRecaptcha || isModalForm) {
    return { ok: false, status: "recaptcha-present", mode: isModalForm ? "modal" : "page" };
  }

  const submitButton = loginForm.querySelector('button[type="submit"], .submit-btn');
  if (submitButton) {
    submitButton.click();
    return { ok: true, status: "submitted", mode: "page" };
  }

  loginForm.submit();
  return { ok: true, status: "submitted-fallback", mode: "page" };
})();
`;
}

async function trySiteAutoLogin(contents, credentials) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, status: "browser-not-ready" };
  }

  if (await pageShowsTornadoLoggedIn(contents)) {
    return { ok: true, status: "already-logged-in" };
  }

  if (!credentials?.username || !credentials?.password) {
    return { ok: false, status: "no-credentials" };
  }

  try {
    return await contents.executeJavaScript(
      buildAutoLoginScript(credentials.username, credentials.password)
    );
  } catch (error) {
    return {
      ok: false,
      status: "inject-failed",
      error: error.message || String(error)
    };
  }
}

async function refreshCsrfToken(contents) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, status: "browser-not-ready" };
  }

  try {
    return await contents.executeJavaScript(buildCsrfRefreshScript());
  } catch (error) {
    return {
      ok: false,
      status: "csrf-refresh-failed",
      error: error.message || String(error)
    };
  }
}

async function openLoginModal(contents) {
  if (!contents || contents.isDestroyed()) {
    return { ok: false, status: "browser-not-ready" };
  }

  try {
    return await contents.executeJavaScript(buildOpenModalScript());
  } catch (error) {
    return {
      ok: false,
      status: "modal-open-failed",
      error: error.message || String(error)
    };
  }
}

async function waitForLoginForm(contents, attempts = 12, delayMs = 400) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!contents || contents.isDestroyed()) {
      return false;
    }

    const found = await contents.executeJavaScript(
      'Boolean(document.getElementById("login-form"))'
    );
    if (found) return true;

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return false;
}

function setupSiteAutoLogin(contents, options = {}) {
  const { loadCredentials, onResult, onDebug, loginUrl, homeUrl } = options;
  let pendingManualLogin = false;
  let lastReportedLoginResult = null;

  const installMonitor = () => {
    if (!contents || contents.isDestroyed()) return;
    contents.executeJavaScript(buildLoginMonitorScript()).catch(() => {
      // Ignore monitor install failures.
    });
    contents.executeJavaScript(buildSiteLoginPatchesScript(loginUrl)).catch(() => {
      // Ignore login patch failures.
    });
  };

  const emitDebug = (entry) => {
    onDebug?.(entry);
  };

  const reportLoginResponse = async () => {
    if (!contents || contents.isDestroyed()) return;

    try {
      const response = await contents.executeJavaScript("window.__tornadoLoginResult || null");
      if (!response || typeof response !== "object") return;

      const serialized = JSON.stringify(response);
      if (serialized === lastReportedLoginResult) return;
      lastReportedLoginResult = serialized;

      if (response.response === true) {
        onResult?.({ ok: true, status: "logged-in", server: response });
        return;
      }

      if (response.response === false) {
        onResult?.({
          ok: false,
          status: "server-rejected",
          error: response.msg || response.error || "Login rejected by site",
          server: response
        });
      }
    } catch {
      // Ignore polling failures.
    }
  };

  const runAutoLogin = async () => {
    const url = contents.getURL();
    if (!isTornadoSite(url)) return;

    if (
      (await pageShowsTornadoLoggedIn(contents)) ||
      (await sessionHasTornadoIdentity(contents.session, homeUrl || url))
    ) {
      pendingManualLogin = false;
      onResult?.({ ok: true, status: "already-logged-in" }, { url });
      return;
    }

    const credentials = typeof loadCredentials === "function" ? loadCredentials() : null;
    if (!credentials?.username || !credentials?.password) return;

    installMonitor();

    if (pendingManualLogin) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const found = await waitForLoginForm(contents);
      if (!found) {
        if (await pageShowsTornadoLoggedIn(contents)) {
          pendingManualLogin = false;
          onResult?.({ ok: true, status: "already-logged-in" }, { url });
          return;
        }
        onResult?.({ ok: false, status: "login-form-not-found" }, { url, manual: true });
        pendingManualLogin = false;
        return;
      }
    } else {
      const found = await documentHasLoginForm();
      if (!found) return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    await contents.executeJavaScript("window.__tornadoLoginResult = null").catch(() => {});
    const result = await trySiteAutoLogin(contents, credentials);
    onResult?.(result, { url, manual: pendingManualLogin });
    pendingManualLogin = false;

    if (result?.status === "recaptcha-present") {
      setTimeout(() => reportLoginResponse(), 3000);
      setTimeout(() => reportLoginResponse(), 8000);
      setTimeout(() => reportLoginResponse(), 15000);
    }
  };

  async function documentHasLoginForm() {
    if (!contents || contents.isDestroyed()) return false;
    try {
      return await contents.executeJavaScript('Boolean(document.getElementById("login-form"))');
    } catch {
      return false;
    }
  }

  contents.on("did-finish-load", () => {
    const url = contents.getURL();
    if (!isTornadoSite(url)) return;
    if (!pendingManualLogin && !isPremiumLoginUrl(url)) return;

    installMonitor();
    runAutoLogin().catch(() => {
      pendingManualLogin = false;
    });
  });

  return {
    async requestManualLogin() {
      lastReportedLoginResult = null;

      if (!contents || contents.isDestroyed()) {
        return { ok: false, error: "Browser is not ready." };
      }

      const alreadyIn =
        (await pageShowsTornadoLoggedIn(contents)) ||
        (await sessionHasTornadoIdentity(contents.session, homeUrl || loginUrl));
      if (alreadyIn) {
        pendingManualLogin = false;
        onResult?.({ ok: true, status: "already-logged-in" }, { url: contents.getURL() });
        return { ok: true, status: "already-logged-in", url: contents.getURL() || homeUrl };
      }

      pendingManualLogin = true;
      installMonitor();
      contents.loadURL(loginUrl);
      return { ok: true, url: loginUrl, mode: "premium-page" };
    },
    tryNow: runAutoLogin,
    handleDebugEntry: emitDebug
  };
}

function isPremiumLoginUrl(url) {
  return isTornadoSite(url) && /\/user\/premiummembership/i.test(url);
}

module.exports = {
  isTornadoSite,
  isSiteLoginUrl,
  isPremiumLoginUrl,
  trySiteAutoLogin,
  setupSiteAutoLogin,
  sessionHasTornadoIdentity,
  pageShowsTornadoLoggedIn
};
