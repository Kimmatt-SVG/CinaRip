const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { app } = require("electron");

function credentialsPath() {
  return path.join(app.getPath("userData"), "nas-credentials.json");
}

function loadNasCredentials() {
  try {
    const raw = JSON.parse(fs.readFileSync(credentialsPath(), "utf8"));
    return {
      username: raw.username || "",
      password: raw.password || ""
    };
  } catch {
    return { username: "", password: "" };
  }
}

function saveNasCredentials({ username, password }) {
  const existing = loadNasCredentials();
  fs.mkdirSync(path.dirname(credentialsPath()), { recursive: true });
  fs.writeFileSync(
    credentialsPath(),
    JSON.stringify(
      {
        username: String(username || "").trim(),
        password: password ? String(password) : existing.password
      },
      null,
      2
    )
  );
}

function clearNasCredentials() {
  try {
    fs.unlinkSync(credentialsPath());
  } catch {
    // No saved credentials.
  }
}

function uncPathParts(folderPath) {
  if (!folderPath || !folderPath.startsWith("\\\\")) return null;
  const parts = folderPath.replace(/^\\\\+/, "").split("\\").filter(Boolean);
  if (parts.length < 2) return null;
  return {
    shareRoot: `\\\\${parts[0]}\\${parts[1]}`,
    subPath: parts.length > 2 ? parts.slice(2).join("\\") : "",
    folderPath
  };
}

function uncShareRoot(folderPath) {
  return uncPathParts(folderPath)?.shareRoot || null;
}

function ensureUncTargetFolder(folderPath) {
  const parsed = uncPathParts(folderPath);
  if (!parsed) return;

  fs.accessSync(parsed.shareRoot, fs.constants.R_OK | fs.constants.W_OK);

  if (!parsed.subPath) return;

  if (!fs.existsSync(parsed.folderPath)) {
    fs.mkdirSync(parsed.folderPath, { recursive: true });
  }
}

function isPermissionError(error) {
  const code = error?.code || "";
  const message = String(error?.message || error || "").toLowerCase();
  return (
    code === "EACCES" ||
    code === "EPERM" ||
    /access is denied|permission|credentials|logon|1326|5\b/.test(message)
  );
}

function connectUncShare(shareRoot, username, password) {
  if (process.platform !== "win32") {
    return { ok: true };
  }

  if (!username) {
    return {
      ok: false,
      needsCredentials: true,
      error: "NAS sign-in required. Enter your NAS username and password."
    };
  }

  const args = ["use", shareRoot, `/user:${username}`];
  if (password) args.push(password);

  const result = spawnSync("net", args, {
    encoding: "utf8",
    windowsHide: true
  });

  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  if (result.status === 0) {
    return { ok: true };
  }

  if (/already connected|1219|multiple connections to a server/i.test(output)) {
    return { ok: true };
  }

  if (/1326|86|user name or password|access is denied|logon failure/i.test(output)) {
    return {
      ok: false,
      error: "NAS sign-in failed. Check your username and password."
    };
  }

  return {
    ok: false,
    error: output || "Could not sign in to the NAS share."
  };
}

function isNetworkPathNotFoundError(error) {
  const message = String(error?.message || error || "");
  return (
    /system error 67|network name cannot be found|bad network path|bad netpath|ENOENT/i.test(
      message
    ) || error?.code === "ENOENT"
  );
}

function isMissingPathError(error) {
  const code = error?.code || "";
  const message = String(error?.message || error || "").toLowerCase();
  return code === "ENOENT" || /no such file or directory|not found/.test(message);
}

function prepareNasAccess(folderPath, credentials = null) {
  const creds = credentials || loadNasCredentials();

  if (process.env.NAS_USERNAME) {
    creds.username = process.env.NAS_USERNAME;
  }
  if (process.env.NAS_PASSWORD) {
    creds.password = process.env.NAS_PASSWORD;
  }

  const parsed = uncPathParts(folderPath);
  const shareRoot = parsed?.shareRoot || null;

  if (shareRoot) {
    const connected = connectUncShare(shareRoot, creds.username, creds.password);
    if (!connected.ok) {
      return connected;
    }
  }

  try {
    ensureUncTargetFolder(folderPath);
    fs.accessSync(folderPath, fs.constants.R_OK | fs.constants.W_OK);
    return { ok: true, path: folderPath };
  } catch (error) {
    if (isMissingPathError(error) && shareRoot) {
      try {
        ensureUncTargetFolder(folderPath);
        fs.accessSync(folderPath, fs.constants.R_OK | fs.constants.W_OK);
        return { ok: true, path: folderPath, createdFolder: true };
      } catch (retryError) {
        return {
          ok: false,
          error:
            `NAS folder "${folderPath}" does not exist and could not be created. ` +
            `Confirm the share "${shareRoot}" is correct. (${retryError.message})`
        };
      }
    }

    if (isPermissionError(error) && !creds.username) {
      return {
        ok: false,
        needsCredentials: true,
        error:
          "NAS folder is not writable. Sign in with your NAS username and password."
      };
    }

    const hint = isNetworkPathNotFoundError(error)
      ? `Windows cannot reach "${shareRoot || folderPath}". Confirm the UNC path in nas-config.json (for example, \\\\NAS\\Media\\Videos).`
      : shareRoot
        ? "Check that the NAS is online and your account can write to this folder."
        : "Check that the folder exists and you have write access.";

    return {
      ok: false,
      error: `Could not write to NAS folder "${folderPath}". ${hint} (${error.message})`
    };
  }
}

module.exports = {
  loadNasCredentials,
  saveNasCredentials,
  clearNasCredentials,
  uncShareRoot,
  uncPathParts,
  connectUncShare,
  prepareNasAccess,
  isPermissionError
};
