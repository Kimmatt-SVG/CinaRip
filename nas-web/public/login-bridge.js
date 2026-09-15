const statusEl = document.getElementById("bridge-status");
const params = new URLSearchParams(location.search);
const recaptcha = params.get("rc") || "";
const loginUrl = "https://www4.tornadomovies.co/";

async function postLogin(token) {
  const res = await fetch("/api/tornado/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recaptcha: token })
  });
  return res.json().catch(() => ({}));
}

function notifyAndClose(ok, error) {
  try {
    window.opener?.postMessage({ type: "cinarip-login", ok, error: error || "" }, location.origin);
  } catch {
    // opener may be gone
  }
  if (ok) {
    statusEl.textContent = "Signed in. Closing…";
    setTimeout(() => window.close(), 400);
  }
}

async function completeWithToken(token) {
  statusEl.textContent = "Finishing sign-in…";
  try {
    const result = await postLogin(token);
    if (result.loggedIn === true) {
      notifyAndClose(true);
      return;
    }
    statusEl.textContent = result.error || "Login did not stick. Paste _identity-frontend1 and advanced-frontend on CinaRip Search instead.";
  } catch (error) {
    statusEl.textContent = error.message || "Login failed.";
  }
}

if (recaptcha) {
  completeWithToken(recaptcha);
} else {
  // Tornado refuses iframes (X-Frame-Options: SAMEORIGIN). Load it as a real page.
  location.replace(loginUrl);
}
