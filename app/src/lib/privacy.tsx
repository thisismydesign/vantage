import { createContext, useContext, type ReactNode } from "react";
import { money as fmtMoney } from "./format.ts";
import { useLocalState } from "./useLocalState.ts";

/**
 * Hides what the account is worth, not what the market did. Prices, percentage
 * moves and chart shapes are public information and stay visible — only figures
 * that reveal the size of the book are masked, so the app stays readable over a
 * shoulder or on a shared screen.
 *
 * State lives in a context rather than per-hook local state: the toggle sits in
 * the header and the values it hides are in the views, so they must share one
 * instance.
 */
const PrivacyContext = createContext<{ hidden: boolean; setHidden: (v: boolean) => void }>({
  hidden: false,
  setHidden: () => {},
});

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useLocalState("privacy:hidden", false);
  return <PrivacyContext value={{ hidden, setHidden }}>{children}</PrivacyContext>;
}

export const usePrivacy = () => useContext(PrivacyContext);

const MASK = "•••••";

/**
 * `money`, but masked when hiding. Keeps the currency symbol so the row still
 * reads as an amount and the column width does not jump.
 */
export function usePrivateMoney() {
  const { hidden } = usePrivacy();
  return (n: number, currency = "EUR", decimals = 0) => {
    if (!hidden) return fmtMoney(n, currency, decimals);
    const symbol = fmtMoney(0, currency, 0).replace(/[\d\s.,-]/g, "");
    return `${symbol}${MASK}`;
  };
}

/** Percentages that are portfolio-relative rather than price-relative. */
export function usePrivateText() {
  const { hidden } = usePrivacy();
  return (text: string) => (hidden ? MASK : text);
}

/**
 * Digests are rendered markdown, so amounts are masked in the source text
 * rather than at a call site.
 *
 * Only the base currency is masked. A digest mixes the human's own figures
 * with public ones — company capex, analyst price targets, deal sizes — and
 * those are quoted in the instrument's currency, almost always USD. Masking
 * every currency symbol hid "$38.29 Billion in new AI Memory Chip Fabs" and
 * "PT $1,014", which reveal nothing about the account.
 *
 * Percentages are left alone throughout: they describe the market, not the
 * size of the holding.
 */
export function maskAmounts(markdown: string, symbol = "€"): string {
  const esc = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markdown.replace(
    new RegExp(`(-|−)?${esc}\\s?\\d[\\d,.]*`, "g"),
    (m) => `${m.startsWith("-") || m.startsWith("−") ? m[0] : ""}${symbol}${MASK}`,
  );
}
