import { useCallback, useState } from "react";

const PREFIX = "vantage:";

// Knob values survive reloads; data-derived values must not be cached here.
export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = window.localStorage.getItem(PREFIX + key);
    if (stored === null) return initial;
    try {
      return JSON.parse(stored) as T;
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (v: T) => {
      setValue(v);
      window.localStorage.setItem(PREFIX + key, JSON.stringify(v));
    },
    [key],
  );

  return [value, set];
}
