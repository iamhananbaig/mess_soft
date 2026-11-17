/**
 * After a deploy, a tab that was already open still runs the old app, whose
 * lazily-loaded pages point at JS files that no longer exist. Instead of an
 * error screen, reload once to pick up the new version. The timestamp guard
 * stops a reload loop if the failure is something else (e.g. offline).
 */
const KEY = 'stale-build-reload-at';

export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Unable to preload/i.test(msg);
}

/** Reload once per minute at most. Returns true if a reload was started. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // storage unavailable — still reload; worst case the user sees the error screen next time
  }
  window.location.reload();
  return true;
}

/** Vite fires this when a lazy page's JS or CSS fails to load. */
export function watchForStaleBuild() {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewVersion()) event.preventDefault();
  });
}
