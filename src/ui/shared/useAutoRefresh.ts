import * as React from "react";

type AutoRefreshOptions = {
  enabled?: boolean;
  intervalMs?: number;
  runOnMount?: boolean;
};

/**
 * Calls `refresh()` on mount (optional) and whenever the tab/window becomes active again.
 * Useful for keeping lists up to date without requiring a full page refresh.
 */
export function useAutoRefresh(
  refresh: () => unknown | Promise<unknown>,
  options?: AutoRefreshOptions
) {
  const enabled = options?.enabled ?? true;
  const intervalMs = options?.intervalMs ?? 0;
  const runOnMount = options?.runOnMount ?? true;

  const refreshRef = React.useRef(refresh);
  React.useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const inFlightRef = React.useRef<Promise<unknown> | null>(null);
  const run = React.useCallback(() => {
    if (!enabled) return;
    if (inFlightRef.current) return;
    const p = Promise.resolve()
      .then(() => refreshRef.current())
      .catch((err) => {
        console.error("Auto refresh failed:", err);
      })
      .finally(() => {
        inFlightRef.current = null;
      });
    inFlightRef.current = p;
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled) return;

    if (runOnMount) run();

    const onFocus = () => run();
    const onVisibility = () => {
      if (!document.hidden) run();
    };
    const onPageShow = () => run();

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);

    let timer: number | null = null;
    if (intervalMs > 0) {
      timer = window.setInterval(run, intervalMs);
    }

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      if (timer != null) window.clearInterval(timer);
    };
  }, [enabled, intervalMs, run, runOnMount]);

  return { refreshNow: run };
}
