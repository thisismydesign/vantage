import { navigate, useSegments } from "./route.ts";

/** The segment after the page's (/tools/margin); `fallback` when it names no tab. */
export function useTab<T extends string>(
  page: string,
  tabs: readonly T[],
  fallback: T,
): [T, (t: T) => void] {
  const sub = useSegments()[1] ?? "";
  const tab = (tabs as readonly string[]).includes(sub) ? (sub as T) : fallback;
  return [tab, (t) => navigate(`/${page}/${t}`)];
}
