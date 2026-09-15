const PAGE_LOAD_TIMEOUT_MS = 90_000;
const FRESH_LINK_TIMEOUT_MS = 22_000;
const JOB_WAIT_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const JOB_POLL_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

async function fetchLinkWithTimeout(deps, item) {
  try {
    const result = await withTimeout(
      deps.fetchFreshLink?.(item),
      FRESH_LINK_TIMEOUT_MS,
      "Fresh link timed out."
    );
    return result || { ok: false, error: "Could not generate a fresh download link." };
  } catch (error) {
    return { ok: false, error: error.message || String(error), timedOut: true };
  }
}

async function waitForJobComplete(runner, shouldContinue, timeoutMs = JOB_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!shouldContinue()) {
      return { ok: false, cancelled: true };
    }

    const status = runner.getStatus();
    if (status.state === "finished") {
      return { ok: true, status };
    }
    if (status.state === "failed") {
      return { ok: false, status, error: status.lastLogLine || status.phase || "Download failed" };
    }
    if (status.state === "idle") {
      return { ok: false, error: "Download ended before completion." };
    }

    await sleep(JOB_POLL_MS);
  }

  return { ok: false, error: "Download timed out." };
}

async function loadMoviePage(loadPage, url, shouldContinue) {
  if (!shouldContinue()) {
    return { ok: false, cancelled: true };
  }

  try {
    await loadPage(url, PAGE_LOAD_TIMEOUT_MS);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

function isRetryableDownloadError(error) {
  const text = String(error || "");
  return /expired|HTTP 40[13]|HTTP 416|fresh link|token|interrupted|ECONNRESET|ETIMEDOUT/i.test(text);
}

async function processQueueItem(item, queue, deps) {
  if (item.kind === "episode") {
    if (!deps.processEpisode) {
      return { failed: "Episode downloads are not available in this queue." };
    }

    queue.setCurrent(item.id);
    deps.onDebug?.("item-start", `Processing episode ${item.title}`, {
      itemId: item.id,
      movieUrl: item.movieUrl,
      destination: item.destination,
      kind: "episode"
    });
    deps.onProgress?.({
      phase: "loading",
      item,
      snapshot: queue.snapshot()
    });

    const outcome = await deps.processEpisode(item, queue);
    if (outcome?.cancelled || queue.cancelRequested) {
      return { cancelled: true };
    }
    if (outcome?.ok) {
      return { ok: true };
    }
    return { failed: outcome?.error || "Episode download failed." };
  }

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (queue.cancelRequested) {
      return { cancelled: true };
    }

    queue.setCurrent(item.id);
    deps.onDebug?.("item-start", `Processing ${item.title}`, {
      itemId: item.id,
      movieUrl: item.movieUrl,
      destination: item.destination,
      attempt
    });
    deps.onProgress?.({
      phase: attempt === 1 ? "loading" : "retrying",
      item,
      attempt,
      snapshot: queue.snapshot()
    });

    const page = await loadMoviePage(deps.loadPage, item.movieUrl, () => !queue.cancelRequested);
    if (page.cancelled) return { cancelled: true };
    if (!page.ok) {
      deps.onDebug?.("item-page-fail", page.error || "Page load failed", {
        itemId: item.id,
        movieUrl: item.movieUrl,
        attempt
      });
      if (attempt < maxAttempts) continue;
      return { failed: page.error };
    }

    deps.onProgress?.({
      phase: "fetching-link",
      item,
      attempt,
      snapshot: queue.snapshot()
    });

    const link = await fetchLinkWithTimeout(deps, item);
    if (!link?.ok) {
      deps.onDebug?.("item-link-fail", link?.error || "Fresh link failed", {
        itemId: item.id,
        movieUrl: item.movieUrl,
        attempt,
        timedOut: Boolean(link?.timedOut)
      });
      return { failed: link?.error || "Could not generate a fresh download link." };
    }

    deps.onProgress?.({
      phase: "preparing",
      item,
      attempt,
      snapshot: queue.snapshot()
    });

    const download = await deps.startDownload(item.destination, link);
    if (queue.cancelRequested) return { cancelled: true };
    if (!download.ok) {
      deps.clearJob?.();
      deps.onDebug?.("item-download-fail", download.error || "Download failed to start", {
        itemId: item.id,
        attempt
      });
      if (attempt < maxAttempts && isRetryableDownloadError(download.error)) continue;
      return { failed: download.error || "Download failed to start." };
    }

    queue.markDownloading(item.id);
    deps.onProgress?.({
      phase: "downloading",
      item,
      attempt,
      snapshot: queue.snapshot()
    });

    const finished = await waitForJobComplete(
      deps.runner,
      () => !queue.cancelRequested,
      JOB_WAIT_TIMEOUT_MS
    );

    deps.clearJob?.();

    if (finished.cancelled) {
      await deps.stopDownload?.();
      return { cancelled: true };
    }

    if (!finished.ok) {
      deps.onDebug?.("item-job-fail", finished.error || "Download job failed", {
        itemId: item.id,
        attempt
      });
      if (attempt < maxAttempts && isRetryableDownloadError(finished.error)) continue;
      return { failed: finished.error || "Download failed." };
    }

    deps.onDebug?.("item-done", `Finished ${item.title}`, { itemId: item.id, attempt });
    return { ok: true };
  }

  return { failed: "Download failed after multiple attempts." };
}

async function processPendingItems(queue, deps, results) {
  while (!queue.cancelRequested) {
    const item = queue.nextPending();
    if (!item) break;

    const outcome = await processQueueItem(item, queue, deps);

    if (outcome.cancelled) {
      results.cancelled = true;
      queue.markSkipped(item.id, "Cancelled");
      break;
    }

    if (outcome.ok) {
      queue.markDone(item.id);
      results.completed += 1;
      results.items.push({ id: item.id, ok: true });
      deps.onProgress?.({
        phase: "item-complete",
        item,
        snapshot: queue.snapshot()
      });
      continue;
    }

    queue.markFailed(item.id, outcome.failed);
    results.failed += 1;
    results.items.push({ id: item.id, ok: false, error: outcome.failed });
    deps.onProgress?.({
      phase: "item-failed",
      item,
      error: outcome.failed,
      snapshot: queue.snapshot()
    });
  }
}

async function processDownloadQueue(queue, deps) {
  const begin = queue.beginRun();
  if (!begin.ok) return begin;

  const results = {
    ok: true,
    completed: 0,
    failed: 0,
    cancelled: false,
    items: []
  };

  try {
    await processPendingItems(queue, deps, results);

    if (!queue.cancelRequested) {
      const retried = queue.requeueFailed();
      if (retried) {
        results.failed = Math.max(0, results.failed - retried);
        deps.onProgress?.({
          phase: "retry-pass",
          retried,
          snapshot: queue.snapshot()
        });
        await processPendingItems(queue, deps, results);
      }
    }
  } finally {
    queue.finishRun();
    deps.onProgress?.({
      phase: "complete",
      snapshot: queue.snapshot(),
      results
    });
  }

  if (results.cancelled) {
    results.ok = false;
  }

  return results;
}

module.exports = {
  processDownloadQueue,
  waitForJobComplete,
  isRetryableDownloadError,
  withTimeout,
  FRESH_LINK_TIMEOUT_MS
};
