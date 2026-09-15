const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { removeBrokenDownload } = require("./download-cleanup");
const { enrichRequestHeaders } = require("./session-headers");
const { downloadHttpFile } = require("./direct-http-download");
const { normalizeUrl: normalizeDirectDownloadUrl } = require("./direct-download-capture");

const HEADER_NAME_PATTERN = /^[A-Za-z0-9-]+$/;

function findFfmpeg() {
  const fromPath = process.env.PATH?.split(path.delimiter)
    .map((dir) => path.join(dir, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"))
    .find((candidate) => fs.existsSync(candidate));

  if (fromPath) return fromPath;

  const common = [
    "C:\\ffmpeg\\bin\\ffmpeg.exe",
    "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Links", "ffmpeg.exe")
  ];

  for (const candidate of common) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  try {
    const wingetRoot = path.join(
      process.env.LOCALAPPDATA || "",
      "Microsoft",
      "WinGet",
      "Packages"
    );
    if (fs.existsSync(wingetRoot)) {
      const packages = fs.readdirSync(wingetRoot).filter((name) => /ffmpeg/i.test(name));
      for (const pkg of packages) {
        const bin = path.join(wingetRoot, pkg, "ffmpeg-8.1.2-full_build", "bin", "ffmpeg.exe");
        // Prefer any nested bin/ffmpeg.exe
        const matches = [];
        const stack = [path.join(wingetRoot, pkg)];
        while (stack.length && matches.length < 3) {
          const dir = stack.pop();
          let names = [];
          try {
            names = fs.readdirSync(dir);
          } catch {
            continue;
          }
          for (const name of names) {
            const full = path.join(dir, name);
            if (name.toLowerCase() === "ffmpeg.exe") matches.push(full);
            else if (!name.includes(".")) {
              try {
                if (fs.statSync(full).isDirectory()) stack.push(full);
              } catch {
                // skip
              }
            }
          }
        }
        if (matches[0]) return matches[0];
        if (fs.existsSync(bin)) return bin;
      }
    }
  } catch {
    // Ignore winget lookup failures.
  }

  return null;
}

function moviesDirectory() {
  try {
    const { configuredLocalVideoFolder, defaultLocalVideoFolder } = require("./local-config");
    return configuredLocalVideoFolder() || defaultLocalVideoFolder();
  } catch {
    const configured = process.env.HLS_CAPTURE_OUTPUT_DIR;
    if (configured) return path.resolve(configured);
    return path.join(app.getPath("videos"), "Movies");
  }
}

function outputDirectory() {
  return moviesDirectory();
}

function existingFileBytes(outputPath) {
  try {
    return fs.statSync(outputPath).size;
  } catch {
    return 0;
  }
}

function safeOutputName(requestedName, url) {
  let name = requestedName;
  if (!name) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      name = `${host}-stream.mp4`;
    } catch {
      name = "stream.mp4";
    }
  }

  name = name.replace(/[^A-Za-z0-9._ -]+/g, "_").trim();
  if (!name) name = "stream.mp4";
  if (!/\.(mp4|mkv|mov|ts)$/i.test(name)) name += ".mp4";
  return name;
}

function ffmpegHeaderArgs(headers = []) {
  const args = [];
  const headerLines = [];

  for (const header of headers) {
    if (!header?.name || !header?.value) continue;
    if (!HEADER_NAME_PATTERN.test(header.name)) continue;
    if (/[\r\n]/.test(header.value)) continue;

    const lower = header.name.toLowerCase();
    if (lower === "user-agent") {
      args.push("-user_agent", header.value);
    } else if (lower === "referer") {
      args.push("-referer", header.value);
    } else {
      headerLines.push(`${header.name}: ${header.value}`);
    }
  }

  if (headerLines.length) {
    args.push("-headers", `${headerLines.join("\r\n")}\r\n`);
  }

  return args;
}

function isPngStreamFailure(logText) {
  return /Video:\s*png/i.test(logText) || /dimensions not set/i.test(logText);
}

async function streamHeadersForDownload(capturedHeaders = [], pageUrl = "", options = {}) {
  return enrichRequestHeaders(capturedHeaders, {
    pageUrl,
    targetUrl: options.targetUrl || "",
    embedUrl: options.embedUrl || "",
    session: options.session || null
  });
}

const FFMPEG_OUTPUT_VARIANTS = [
  { id: "copy", label: "stream copy", mode: "copy" },
  { id: "copy-adts", label: "copy with AAC fix", mode: "copy-adts" },
  { id: "hevc-mp4", label: "HEVC copy", mode: "hevc-mp4" },
  { id: "reencode-audio", label: "re-encode audio", mode: "reencode-audio" },
  { id: "video-only", label: "video only", mode: "video-only" }
];

function buildVariantOutputArgs(variant, videoStreamIndex = null) {
  const useIndex =
    videoStreamIndex != null && Number.isFinite(Number(videoStreamIndex));
  const videoMap = useIndex
    ? ["-map", `0:${Number(videoStreamIndex)}`]
    : ["-map", "0:v:0?"];

  switch (variant.mode) {
    case "copy-adts":
      return [
        ...videoMap,
        "-map",
        "0:a:0?",
        "-sn",
        "-dn",
        "-ignore_unknown",
        "-c:v",
        "copy",
        "-c:a",
        "copy",
        "-bsf:a",
        "aac_adtstoasc",
        "-max_muxing_queue_size",
        "9999",
        "-movflags",
        "+faststart"
      ];
    case "hevc-mp4":
      return [
        ...videoMap,
        "-map",
        "0:a:0?",
        "-sn",
        "-dn",
        "-ignore_unknown",
        "-c:v",
        "copy",
        "-tag:v",
        "hvc1",
        "-c:a",
        "copy",
        "-max_muxing_queue_size",
        "9999",
        "-movflags",
        "+faststart"
      ];
    case "reencode-audio":
      return [
        ...videoMap,
        "-map",
        "0:a:0?",
        "-sn",
        "-dn",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-max_muxing_queue_size",
        "9999",
        "-movflags",
        "+faststart"
      ];
    case "video-only":
      return [
        ...videoMap,
        "-sn",
        "-dn",
        "-c:v",
        "copy",
        "-max_muxing_queue_size",
        "9999",
        "-movflags",
        "+faststart"
      ];
    default:
      return [
        ...videoMap,
        "-map",
        "0:a:0?",
        "-sn",
        "-dn",
        "-ignore_unknown",
        "-c",
        "copy",
        "-max_muxing_queue_size",
        "9999",
        "-movflags",
        "+faststart"
      ];
  }
}

function buildFfmpegArgs(
  ffmpegPath,
  url,
  headers,
  outputPath,
  progressPath,
  variant = FFMPEG_OUTPUT_VARIANTS[0],
  videoStreamIndex = null
) {
  return [
    ffmpegPath,
    "-hide_banner",
    "-loglevel",
    "warning",
    "-protocol_whitelist",
    "file,http,https,tcp,tls,crypto",
    "-allowed_extensions",
    "ALL",
    "-allowed_segment_extensions",
    "ALL",
    "-extension_picky",
    "0",
    "-analyzeduration",
    "20000000",
    "-probesize",
    "20000000",
    "-fflags",
    "+genpts",
    ...ffmpegHeaderArgs(headers),
    "-nostats",
    "-progress",
    progressPath,
    "-seg_max_retry",
    "3",
    "-i",
    url,
    ...buildVariantOutputArgs(variant, videoStreamIndex),
    "-y",
    outputPath
  ];
}

function parseProgressFile(progressPath) {
  const progress = {};
  try {
    for (const line of fs.readFileSync(progressPath, "utf8").split(/\r?\n/)) {
      const separator = line.indexOf("=");
      if (separator === -1) continue;
      progress[line.slice(0, separator)] = line.slice(separator + 1);
    }
  } catch {
    // Progress file may not exist yet.
  }
  return progress;
}

function parseClockSeconds(value) {
  if (!value) return 0;
  if (/^\d+(\.\d+)?$/.test(value)) {
    return Number(value) / 1_000_000;
  }

  const match = String(value).match(/(?:(\d+):)?(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!match) return 0;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const micros = Number((match[4] || "0").padEnd(6, "0"));
  return hours * 3600 + minutes * 60 + seconds + micros / 1_000_000;
}

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

// HLS playlists often report a short sliding window (10–15s), not the full movie length.
const SHORT_PLAYLIST_DURATION_SECONDS = 300;

function deriveProgressMetrics(progress, outputSize, startedAt) {
  const outTimeSeconds = parseClockSeconds(progress.out_time_us || progress.out_time);
  const rawDurationSeconds = parseClockSeconds(progress.duration_us || progress.duration);
  const speed = progress.speed || null;

  const durationReliable =
    rawDurationSeconds > SHORT_PLAYLIST_DURATION_SECONDS &&
    (rawDurationSeconds <= 0 || outTimeSeconds <= rawDurationSeconds + 2);
  const durationSeconds = durationReliable ? rawDurationSeconds : 0;

  let percent = null;
  if (durationSeconds > 0 && outTimeSeconds > 0) {
    percent = Math.min(100, Math.round((outTimeSeconds / durationSeconds) * 100));
  }

  const elapsedSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));

  return {
    percent,
    outTimeSeconds,
    durationSeconds,
    outTimeLabel: outTimeSeconds > 0 ? formatClock(outTimeSeconds) : null,
    durationLabel: durationSeconds > 0 ? formatClock(durationSeconds) : null,
    speed,
    elapsedSeconds,
    outputSize
  };
}

class FfmpegRunner {
  constructor() {
    this.activeJob = null;
  }

  getStatus() {
    if (!this.activeJob) {
      return { state: "idle" };
    }

    if (this.activeJob.directActive) {
      let percent = null;
      if (this.activeJob.totalBytes > 0) {
        percent = Math.min(
          100,
          Math.round((this.activeJob.downloadedBytes / this.activeJob.totalBytes) * 100)
        );
      }

      return {
        state: "running",
        jobId: this.activeJob.jobId,
        outputPath: this.activeJob.outputPath,
        outputName: this.activeJob.outputName,
        outputSize: this.activeJob.downloadedBytes || 0,
        lastLogLine: "",
        runningForMs: Date.now() - this.activeJob.startedAt,
        destination: this.activeJob.destination || "local",
        artworkPath: this.activeJob.artworkPath || null,
        qualityLabel: this.activeJob.qualityLabel || null,
        phase:
          percent != null
            ? `Downloading direct file: ${percent}%`
            : this.activeJob.phase || "Downloading direct file...",
        percent,
        indeterminate: percent == null,
        elapsedSeconds: Math.max(0, Math.round((Date.now() - this.activeJob.startedAt) / 1000))
      };
    }

    if (!this.activeJob.process) {
      if (this.activeJob.exitCode != null) {
        const state = this.activeJob.exitCode === 0 ? "finished" : "failed";
        let outputSize = 0;
        try {
          outputSize = fs.statSync(this.activeJob.outputPath).size;
        } catch {
          outputSize = 0;
        }

        let lastLogLine = "";
        try {
          const lines = fs.readFileSync(this.activeJob.logPath, "utf8").split(/\r?\n/).filter(Boolean);
          lastLogLine = lines[lines.length - 1] || "";
        } catch {
          lastLogLine = "";
        }

        return {
          state,
          jobId: this.activeJob.jobId,
          outputPath: this.activeJob.outputPath,
          outputName: this.activeJob.outputName,
          outputSize,
          lastLogLine,
          runningForMs: Date.now() - this.activeJob.startedAt,
          destination: this.activeJob.destination || "local",
          artworkPath: this.activeJob.artworkPath || null,
          qualityLabel: this.activeJob.qualityLabel || null,
          phase:
            state === "finished"
              ? "Download complete"
              : this.activeJob.phase || "Download failed",
          percent: state === "finished" ? 100 : null,
          indeterminate: false
        };
      }

      return {
        state: "running",
        phase: this.activeJob.phase || "Preparing download...",
        percent: this.activeJob.manualPercent,
        indeterminate: this.activeJob.manualPercent == null,
        destination: this.activeJob.destination || "local"
      };
    }

    const {
      jobId,
      outputPath,
      logPath,
      progressPath,
      process: child,
      startedAt,
      destination,
      artworkPath,
      qualityLabel,
      outputName,
      phase
    } = this.activeJob;

    let outputSize = 0;
    try {
      outputSize = fs.statSync(outputPath).size;
    } catch {
      outputSize = 0;
    }

    let lastLogLine = "";
    try {
      const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
      lastLogLine = lines[lines.length - 1] || "";
    } catch {
      lastLogLine = "";
    }

    const progress = parseProgressFile(progressPath);
    const metrics = deriveProgressMetrics(progress, outputSize, startedAt);
    const processRunning = child.exitCode === null;

    let state = "running";
    if (!processRunning) {
      const exitCode = this.activeJob.exitCode;
      state = exitCode === 0 ? "finished" : "failed";
    }

    let statusMessage = phase || "Capturing stream with FFmpeg...";
    if (state === "running") {
      if (metrics.percent != null && metrics.durationLabel) {
        statusMessage = `Capturing video: ${metrics.outTimeLabel || "0:00"} / ${metrics.durationLabel}`;
      } else if (metrics.outTimeLabel) {
        statusMessage = `Capturing video: ${metrics.outTimeLabel} captured`;
      } else if (metrics.outputSize > 0) {
        statusMessage = "Capturing stream segments and writing MP4...";
      } else {
        statusMessage = "Connecting to stream and starting capture...";
      }
    } else if (state === "finished") {
      statusMessage = "Download complete";
    } else if (state === "failed") {
      statusMessage = this.activeJob.phase || "Download failed";
    }

    return {
      state,
      jobId,
      outputPath,
      outputName,
      outputSize,
      lastLogLine,
      runningForMs: Date.now() - startedAt,
      destination: destination || "local",
      artworkPath: artworkPath || null,
      qualityLabel: qualityLabel || null,
      phase: statusMessage,
      percent: state === "finished" ? 100 : metrics.percent,
      speed: metrics.speed,
      outTimeLabel: metrics.outTimeLabel,
      durationLabel: metrics.durationLabel,
      elapsedSeconds: metrics.elapsedSeconds,
      indeterminate: state === "running" && metrics.percent == null
    };
  }

  setPhase(message, percent = null) {
    if (!this.activeJob) return;
    this.activeJob.phase = message;
    if (percent != null) {
      this.activeJob.manualPercent = percent;
    }
  }

  beginPrepare(options = {}) {
    this.activeJob = {
      jobId: `prep-${Date.now()}`,
      destination: options.destination || "local",
      phase: options.phase || "Preparing download...",
      manualPercent: options.percent ?? 5,
      startedAt: Date.now()
    };
  }

  finishJob(job, code) {
    try {
      if (job.progressPath && fs.existsSync(job.progressPath)) {
        fs.unlinkSync(job.progressPath);
      }
    } catch {
      // Best effort cleanup.
    }

    job.exitCode = code;

    if (code !== 0) {
      removeBrokenDownload(job.outputPath);
    } else if (typeof job.onComplete === "function") {
      try {
        job.onComplete(job);
      } catch {
        // Post-download steps should not crash the download flow.
      }
    }

    if (typeof job.onFinished === "function") {
      try {
        job.onFinished(code, job);
      } catch {
        // Finish handlers should not crash the download flow.
      }
    }
  }

  launchAttempt(job) {
    const variant = FFMPEG_OUTPUT_VARIANTS[job.variantIndex];
    if (!variant) {
      this.finishJob(job, job.exitCode ?? 1);
      return;
    }

    if (job.variantIndex > 0) {
      removeBrokenDownload(job.outputPath);
      try {
        if (fs.existsSync(job.progressPath)) fs.unlinkSync(job.progressPath);
      } catch {
        // Best effort cleanup.
      }
      job.phase = `Retrying capture (${variant.label})...`;
    }

    const args = buildFfmpegArgs(
      job.ffmpegPath,
      job.url,
      job.headers,
      job.outputPath,
      job.progressPath,
      variant,
      job.videoStreamIndex
    );
    const child = spawn(args[0], args.slice(1), {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const logStream = fs.createWriteStream(job.logPath, {
      flags: job.variantIndex > 0 ? "a" : "w"
    });
    if (job.variantIndex > 0) {
      logStream.write(`\n--- Retry: ${variant.label} ---\n`);
    }
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    job.process = child;
    job.phase = job.phase || "Capturing stream with FFmpeg...";
    this.activeJob = job;

    child.on("close", (code) => {
      if (this.activeJob?.jobId !== job.jobId) return;

      job.process = null;
      job.exitCode = code;

      const logText = (() => {
        try {
          return fs.readFileSync(job.logPath, "utf8");
        } catch {
          return "";
        }
      })();

      if (code !== 0 && isPngStreamFailure(logText)) {
        job.phase = "Stream is a PNG preview slideshow, not the movie";
        this.finishJob(job, code);
        return;
      }

      if (code !== 0 && job.variantIndex + 1 < FFMPEG_OUTPUT_VARIANTS.length) {
        job.variantIndex += 1;
        this.launchAttempt(job);
        return;
      }

      this.finishJob(job, code);
    });
  }

  async start(url, headers = [], outputName = null, options = {}) {
    if (this.isJobRunning()) {
      throw new Error("A download is already running.");
    }

    const ffmpegPath = findFfmpeg();
    if (!ffmpegPath) {
      throw new Error("ffmpeg was not found. Install it and add it to your PATH.");
    }

    const outputDir = options.outputDir || outputDirectory();
    fs.mkdirSync(outputDir, { recursive: true });

    const safeName = safeOutputName(outputName, url);
    const outputPath = path.join(outputDir, safeName);
    const logPath = `${outputPath}.log`;
    const progressPath = `${outputPath}.progress`;
    const jobId = `${Date.now()}`;

    try {
      fs.unlinkSync(progressPath);
    } catch {
      // No previous progress file.
    }

    const job = {
      jobId,
      url,
      headers,
      ffmpegPath,
      outputPath,
      outputName: safeName,
      logPath,
      progressPath,
      startedAt: Date.now(),
      destination: options.destination || "local",
      artworkPath: options.artworkPath || null,
      qualityLabel: options.qualityLabel || null,
      videoStreamIndex: options.videoStreamIndex ?? null,
      phase: options.phase || "Capturing stream with FFmpeg...",
      manualPercent: null,
      onComplete: options.onComplete || null,
      onFinished: options.onFinished || null,
      variantIndex: 0,
      process: null,
      exitCode: null
    };

    this.launchAttempt(job);

    return {
      ok: true,
      jobId,
      outputPath,
      pid: job.process?.pid ?? null
    };
  }

  async startDirect(url, headers = [], outputName = null, options = {}) {
    if (this.isJobRunning()) {
      throw new Error("A download is already running.");
    }

    const downloadUrl = normalizeDirectDownloadUrl(url) || url;

    const outputDir = options.outputDir || outputDirectory();
    fs.mkdirSync(outputDir, { recursive: true });

    const safeName = safeOutputName(outputName, downloadUrl);
    const outputPath = path.join(outputDir, safeName);
    const logPath = `${outputPath}.log`;
    const jobId = `${Date.now()}`;

    const job = {
      jobId,
      url: downloadUrl,
      headers,
      mode: "direct-http",
      outputPath,
      outputName: safeName,
      logPath,
      startedAt: Date.now(),
      destination: options.destination || "local",
      artworkPath: options.artworkPath || null,
      qualityLabel: options.qualityLabel || null,
      phase: options.phase || "Downloading direct file...",
      manualPercent: null,
      downloadedBytes: 0,
      totalBytes: 0,
      directActive: true,
      onComplete: options.onComplete || null,
      onFinished: options.onFinished || null,
      process: null,
      exitCode: null,
      abortRef: { current: null }
    };

    this.activeJob = job;

    downloadHttpFile({
      url: downloadUrl,
      outputPath,
      headers,
      logPath,
      abortRef: job.abortRef,
      onProgress: ({ downloadedBytes, totalBytes, resuming, resumeFrom }) => {
        if (this.activeJob?.jobId !== job.jobId) return;
        job.downloadedBytes = downloadedBytes;
        job.totalBytes = totalBytes;
        if (resuming && resumeFrom > 0) {
          const gb = (resumeFrom / (1024 * 1024 * 1024)).toFixed(2);
          job.phase = `Connection interrupted — resuming from ${gb} GB...`;
        } else {
          job.phase = "Downloading direct file...";
        }
      }
    })
      .then(() => {
        if (this.activeJob?.jobId !== job.jobId) return;
        job.directActive = false;
        job.downloadedBytes = existingFileBytes(job.outputPath) || job.downloadedBytes;
        job.phase = "Download complete";
        this.finishJob(job, 0);
      })
      .catch((error) => {
        if (this.activeJob?.jobId !== job.jobId) return;
        job.phase = error.message || "Direct download failed";
        job.directActive = false;
        this.finishJob(job, 1);
      });

    return {
      ok: true,
      jobId,
      outputPath,
      mode: "direct-http"
    };
  }

  isJobRunning() {
    if (!this.activeJob) return false;
    if (this.activeJob.directActive) return true;
    return this.activeJob.process?.exitCode === null;
  }

  async stop() {
    if (this.activeJob?.directActive) {
      this.activeJob.phase = "Stopping download...";
      this.activeJob.abortRef?.current?.();
      return { ok: true, state: "stopping" };
    }

    if (!this.activeJob?.process || this.activeJob.process.exitCode !== null) {
      this.activeJob = null;
      return { ok: true, state: "idle" };
    }

    this.activeJob.phase = "Stopping download...";
    this.activeJob.process.kill("SIGTERM");
    return { ok: true, state: "stopping" };
  }

  clearJob() {
    this.activeJob = null;
  }
}

module.exports = {
  FfmpegRunner,
  findFfmpeg,
  moviesDirectory,
  outputDirectory,
  safeOutputName,
  streamHeadersForDownload
};
