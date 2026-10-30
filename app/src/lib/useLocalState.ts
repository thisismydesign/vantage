import { useCallback, useState } from "react";

const PREFIX = "vantage:";

export function readLocalState<T>(key: string, initial: T): T {
  const stored = window.localStorage.getItem(PREFIX + key);
  if (stored === null) return initial;
  try {
    return JSON.parse(stored) as T;
  } catch {
    return initial;
  }
}

// For UI settings only; data-derived values must not be cached here.
export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => readLocalState(key, initial));

  const set = useCallback(
    (v: T) => {
      setValue(v);
      window.localStorage.setItem(PREFIX + key, JSON.stringify(v));
    },
    [key],
  );

  return [value, set];
}
