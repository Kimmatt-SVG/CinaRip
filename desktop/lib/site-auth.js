const fs = require("fs");
const path = require("path");
const { app } = require("electron");

function credentialsPath() {
  return path.join(app.getPath("userData"), "site-credentials.json");
}

function loadSiteCredentials() {
  try {
    const raw = JSON.parse(fs.readFileSync(credentialsPath(), "utf8"));
    return {
      username: raw.username || "",
      password: raw.password || "",
      autoLogin: Boolean(raw.autoLogin)
    };
  } catch {
    return { username: "", password: "", autoLogin: false };
  }
}

function saveSiteCredentials({ username, password, autoLogin = true }) {
  const existing = loadSiteCredentials();
  fs.mkdirSync(path.dirname(credentialsPath()), { recursive: true });
  fs.writeFileSync(
    credentialsPath(),
    JSON.stringify(
      {
        username: String(username || "").trim(),
        password: password ? String(password) : existing.password,
        autoLogin: Boolean(autoLogin)
      },
      null,
      2
    )
  );
}

function clearSiteCredentials() {
  try {
    fs.unlinkSync(credentialsPath());
  } catch {
    // No saved credentials.
  }
}

module.exports = {
  loadSiteCredentials,
  saveSiteCredentials,
  clearSiteCredentials
};
