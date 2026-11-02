import { useSyncExternalStore } from "react";

const onChange = (callback: () => void) => {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
};

/** The address's segments, /tools/margin as ["tools", "margin"], kept current as the address changes. */
export const useSegments = (): string[] =>
  useSyncExternalStore(onChange, () => window.location.pathname)
    .replace(/^\//, "")
    .split("/");

/** Pushes a new address and tells every `useSegments`; `popstate` fires on its own only for the back button. */
export const navigate = (path: string) => {
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path + window.location.search);
  window.dispatchEvent(new PopStateEvent("popstate"));
};
