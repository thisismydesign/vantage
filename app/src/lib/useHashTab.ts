import { useEffect, useState } from "react";

/** The segment after the page's (#/tools/margin); `fallback` when it names no tab. */
export function useHashTab<T extends string>(
  page: string,
  tabs: readonly T[],
  fallback: T,
): [T, (t: T) => void] {
  const read = () => {
    const sub = window.location.hash.replace(/^#\/?/, "").split("/")[1] ?? "";
    return (tabs as readonly string[]).includes(sub) ? (sub as T) : fallback;
  };
  const [tab, setTab] = useState<T>(read);
  useEffect(() => {
    const onChange = () => setTab(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return [tab, (t) => (window.location.hash = `/${page}/${t}`)];
}
