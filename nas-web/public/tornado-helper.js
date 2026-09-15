(() => {
  if (!/tornadomovies\.co/i.test(location.hostname || "")) {
    alert("Switch to the Tornado tab, then click this bookmark.");
    return;
  }

  const baked = typeof __CINARIP_NAS_ORIGIN__ === "string" ? __CINARIP_NAS_ORIGIN__ : "";
  let stored = "";
  try {
    stored = localStorage.getItem("cinaripNasOrigin") || "";
  } catch {
    stored = "";
  }
  const nasOrigin = String(baked || stored || "").replace(/\/$/, "");
  if (nasOrigin) {
    try {
      localStorage.setItem("cinaripNasOrigin", nasOrigin);
    } catch {
      // private mode
    }
  }

  function recaptchaToken() {
    try {
      return (window.grecaptcha && grecaptcha.getResponse && grecaptcha.getResponse()) || "";
    } catch {
      return "";
    }
  }

  function injectFinishBar() {
    if (!nasOrigin) return;
    if (document.getElementById("cinarip-finish-bar")) return;

    const bar = document.createElement("button");
    bar.id = "cinarip-finish-bar";
    bar.type = "button";
    bar.textContent = "Finish and close for CinaRip";
    bar.setAttribute("data-cinarip", "finish");
    bar.style.cssText = [
      "position:fixed",
      "left:0",
      "right:0",
      "bottom:0",
      "z-index:2147483647",
      "width:100%",
      "padding:20px 16px",
      "border:0",
      "border-radius:0",
      "background:#2563eb",
      "color:#fff",
      "font:700 20px/1.3 system-ui,Segoe UI,sans-serif",
      "cursor:pointer",
      "box-shadow:0 -8px 32px rgba(0,0,0,.45)",
      "text-align:center",
      "pointer-events:auto"
    ]
      .map((rule) => `${rule} !important`)
      .join(";");

    bar.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        const token = recaptchaToken();
        if (!token) {
          bar.textContent = "Solve the captcha first, then click here.";
          return;
        }
        location.href = `${nasOrigin}/login-bridge.html?rc=${encodeURIComponent(token)}`;
      },
      true
    );

    function mount() {
      if (document.getElementById("cinarip-finish-bar")) return;
      const parent = document.body || document.documentElement;
      if (!parent) {
        document.addEventListener("DOMContentLoaded", mount, { once: true });
        return;
      }
      parent.appendChild(bar);
      if (document.body) {
        document.body.style.setProperty("padding-bottom", "76px", "important");
      }
    }
    mount();
  }

  injectFinishBar();
})();
