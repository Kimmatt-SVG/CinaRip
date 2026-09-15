const statusEl = document.getElementById("status");
const startButton = document.getElementById("start-freezer");
const coolButton = document.getElementById("cool-down");
const pendingList = document.getElementById("pending-queue");
const coolingList = document.getElementById("cooling-queue");
const failedNote = document.getElementById("failed-note");
const catalogEl = document.getElementById("catalog");
const mountStateEl = document.getElementById("mount-state");
const mountDetailEl = document.getElementById("mount-detail");
const nasStateEl = document.getElementById("nas-state");
const nasDetailEl = document.getElementById("nas-detail");
const nasForm = document.getElementById("nas-form");
const nasOriginInput = document.getElementById("nas-origin");
const nasHostInput = document.getElementById("nas-host");
const nasShareInput = document.getElementById("nas-share");
const nasVideosInput = document.getElementById("nas-videos");
const nasUsernameInput = document.getElementById("nas-username");
const nasPasswordInput = document.getElementById("nas-password");
const downloadSpeedEl = document.getElementById("download-speed");
const uploadSpeedEl = document.getElementById("upload-speed");

function setText(el, value) {
  if (!el) return;
  el.textContent = value;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function getJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function postJson(url, body = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function connectionLabel(state) {
  if (state === "connected") return "Connected";
  if (state === "warning") return "Warning";
  if (state === "error") return "Error";
  if (state === "unconfigured") return "Not configured";
  return "Disconnected";
}

function pillClass(state) {
  if (state === "connected") return "connected";
  if (state === "warning") return "warning";
  if (state === "error") return "error";
  return "disconnected";
}

function setPill(el, state) {
  if (!el) return;
  el.className = `pill ${pillClass(state)}`;
  el.textContent = connectionLabel(state);
}

function formatClock(seconds) {
  const n = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function stageLabel(stage) {
  if (stage === "download") return "Download";
  if (stage === "upload") return "Upload";
  if (stage === "encode") return "Encoding";
  if (stage === "done") return "Done";
  return "Waiting";
}

function progressBar(percent) {
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  return `<div class="xfer-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct.toFixed(0)}"><i style="width:${pct.toFixed(1)}%"></i></div>`;
}

function pendingRow(item) {
  const kind = item.kind === "tv-show" ? "Series" : "Movie";
  const extra = item.episodeCount ? ` · ${item.episodeCount} ep` : "";
  return `<li>
    <div class="queue-head"><span>${escapeHtml(item.title)}</span><span class="kind">${kind}${extra}</span></div>
    <p class="stage">Waiting</p>
  </li>`;
}

function coolingRow(item, rates) {
  const kind = item.kind === "tv-show" ? "Series" : "Movie";
  const extra = item.episodeCount ? ` · ${item.episodeCount} ep` : "";
  const stage = item.stage || "encode";
  const percent = Number(item.percent) || 0;
  let meta = `${percent.toFixed(0)}%`;
  if (stage === "encode") {
    if (item.durationSec) meta += ` · ${formatClock(item.outTimeSec)} / ${formatClock(item.durationSec)}`;
    if (item.fps) meta += ` · ${Number(item.fps).toFixed(0)} fps`;
    if (item.speed) meta += ` · ${escapeHtml(item.speed)}`;
  } else if (stage === "download" || stage === "upload") {
    if (item.bytesTotal) meta += ` · ${formatBytes(item.bytesDone)} / ${formatBytes(item.bytesTotal)}`;
    const speed = stage === "download" ? rates?.downloadLabel : rates?.uploadLabel;
    if (speed && speed !== "—") meta += ` · ${speed}`;
  }
  return `<li>
    <div class="queue-head"><span>${escapeHtml(item.title)}</span><span class="kind">${kind}${extra}</span></div>
    <p class="stage">${stageLabel(stage)}</p>
    ${progressBar(percent)}
    <div class="xfer-meta"><span>${meta}</span></div>
  </li>`;
}

function queueHtml(items, emptyText, renderer) {
  if (!items?.length) return `<li class="empty">${escapeHtml(emptyText)}</li>`;
  return items.map(renderer).join("");
}

function statusLabel(status) {
  switch (status) {
    case "encoding":
      return "Cooling down";
    case "done":
      return "Compressed";
    case "failed":
      return "Failed";
    case "restored":
      return "Original restored";
    default:
      return "Waiting";
  }
}

function catalogCard(item) {
  const isShow = item.kind === "tv-show";
  const poster = item.posterRel
    ? `style="background-image:url('/api/poster?rel=${encodeURIComponent(item.posterRel)}')"`
    : "";
  const failed = item.compressStatus === "failed" ? " failed" : "";
  const badgeClass = item.compressStatus === "failed" ? "failed" : item.compressStatus === "done" ? "done" : item.compressStatus === "encoding" ? "encoding" : "";
  return `<article class="library-card">
    <div class="poster" ${poster}>
      <em data-kind="${isShow ? "tv" : "movie"}">${isShow ? "Series" : "Movie"}</em>
      <span>${escapeHtml(item.title)}</span>
    </div>
    <div class="badge${failed} ${badgeClass}">${statusLabel(item.compressStatus)}</div>
  </article>`;
}

function render(data) {
  const mount = data.connection?.mount || {};
  const nas = data.connection?.nas || {};
  const smb = data.connection?.smb || {};
  const settings = data.connection?.settings || {};
  setPill(mountStateEl, mount.state || "disconnected");
  setText(mountDetailEl, mount.error
    || (mount.writable ? "Freezer/ is writable" : "Checking mount…"));
  setPill(nasStateEl, nas.state === "connected" && smb.state === "connected"
    ? "connected"
    : smb.state === "error" || nas.state === "error"
      ? "error"
      : nas.state || smb.state || "disconnected");
  const nasOrigin = nas.origin || settings.nasOrigin || "https://cinarip.matthewsuess.com";
  const nasBits = [];
  if (nas.state === "connected") nasBits.push(nasOrigin);
  else nasBits.push(nas.error || `HTTP ${nasOrigin}`);
  if (smb.state === "connected") nasBits.push("Share mounted");
  else if (smb.error) nasBits.push(smb.error);
  setText(nasDetailEl, nasBits.join(" · "));
  if (document.activeElement !== nasOriginInput && document.activeElement !== nasHostInput
    && document.activeElement !== nasShareInput && document.activeElement !== nasVideosInput
    && document.activeElement !== nasUsernameInput && document.activeElement !== nasPasswordInput) {
    if (nasOriginInput) nasOriginInput.value = nasOrigin;
    if (nasHostInput) nasHostInput.value = settings.smbHost || "100.95.66.124";
    if (nasShareInput) nasShareInput.value = settings.smbShare || "Public";
    if (nasVideosInput) nasVideosInput.value = settings.smbVideos || "Videos";
    if (nasUsernameInput) nasUsernameInput.value = settings.smbUsername || "";
    if (nasPasswordInput && settings.hasPassword) nasPasswordInput.placeholder = "Saved — leave blank to keep";
  }

  setText(downloadSpeedEl, data.rates?.downloadLabel || "—");
  setText(uploadSpeedEl, data.rates?.uploadLabel || "—");

  const working = Boolean(data.running || data.cooling || data.current);
  if (data.current) {
    setText(statusEl, `${stageLabel(data.current.stage)} · ${data.current.title}`);
  } else if (data.running) {
    setText(statusEl, data.pending?.length ? "Start Freezer is on — waiting to cool down the next title." : "Start Freezer is on — nothing pending.");
  } else {
    setText(statusEl, "Idle — encoding does not start until you press a button.");
  }
  if (startButton) startButton.disabled = working && Boolean(data.running);
  if (coolButton) coolButton.disabled = Boolean(data.current);

  if (pendingList) pendingList.innerHTML = queueHtml(data.pending, "Nothing waiting.", pendingRow);

  const coolingItems = [];
  if (data.current) coolingItems.push(data.current);
  for (const item of data.encoding || []) {
    if (data.current && item.rel === data.current.rel) continue;
    coolingItems.push(item);
  }
  if (coolingList) coolingList.innerHTML = queueHtml(coolingItems, "Nothing encoding.", (item) => coolingRow(item, data.rates));

  const failed = data.failed || [];
  if (failedNote) {
    if (failed.length) {
      failedNote.hidden = false;
      failedNote.textContent = failed.length === 1
        ? `Failed: ${failed[0].title}${failed[0].compressError ? ` — ${failed[0].compressError}` : ""}`
        : `${failed.length} titles failed encode. They stay in the catalog marked Failed.`;
    } else {
      failedNote.hidden = true;
      failedNote.textContent = "";
    }
  }

  const cards = [
    ...(data.catalog?.movies || []).map(catalogCard),
    ...(data.catalog?.shows || []).map(catalogCard)
  ];
  if (catalogEl) {
    catalogEl.innerHTML = cards.length ? cards.join("") : `<p class="catalog-empty">No titles in Freezer/. Put titles in Freezer from CinaRip first.</p>`;
  }
}

async function refresh() {
  try {
    render(await getJson("/api/status"));
  } catch (error) {
    setPill(mountStateEl, "disconnected");
    setText(mountDetailEl, error.message || "Could not reach the worker.");
    setPill(nasStateEl, "disconnected");
    setText(downloadSpeedEl, "—");
    setText(uploadSpeedEl, "—");
    setText(statusEl, error.message || "Could not reach the worker.");
  }
}

if (startButton) {
  startButton.addEventListener("click", async () => {
    try {
      setText(statusEl, "Starting Freezer…");
      render(await postJson("/api/start"));
    } catch (error) {
      setText(statusEl, error.message || "Could not start.");
    }
  });
}

if (coolButton) {
  coolButton.addEventListener("click", async () => {
    try {
      setText(statusEl, "Cooling down…");
      render(await postJson("/api/cool-down"));
    } catch (error) {
      setText(statusEl, error.message || "Could not cool down.");
    }
  });
}

if (nasForm) {
  nasForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      setText(statusEl, "Saving NAS…");
      render(await postJson("/api/nas", {
        origin: nasOriginInput?.value,
        host: nasHostInput?.value,
        share: nasShareInput?.value,
        videosPath: nasVideosInput?.value,
        username: nasUsernameInput?.value,
        password: nasPasswordInput?.value
      }));
      if (nasPasswordInput) nasPasswordInput.value = "";
    } catch (error) {
      setText(statusEl, error.message || "Could not save NAS.");
    }
  });
}

refresh();
setInterval(refresh, 1000);
