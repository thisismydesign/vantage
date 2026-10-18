import { createContext, useContext, type ReactNode } from "react";
import { money as fmtMoney } from "./format.ts";
import { useLocalState } from "./useLocalState.ts";

// Masks only what reveals the size of the book; prices, percentage moves and chart shapes are public and stay visible.
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

/** Keeps the currency symbol so it still reads as an amount and the column width holds. */
export function usePrivateMoney() {
  const { hidden } = usePrivacy();
  return (n: number, currency = "EUR", decimals = 0) => {
    if (!hidden) return fmtMoney(n, currency, decimals);
    const symbol = fmtMoney(0, currency, 0).replace(/[\d\s.,-]/g, "");
    return `${symbol}${MASK}`;
  };
}

/** For portfolio-relative percentages; price-relative ones stay visible. */
export function usePrivateText() {
  const { hidden } = usePrivacy();
  return (text: string) => (hidden ? MASK : text);
}

/**
 * Only the base currency: digests also quote public figures (capex, price targets, deal sizes) in the instrument's currency, which reveal nothing about the account.
 */
export function maskAmounts(markdown: string, symbol = "€"): string {
  const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markdown.replace(new RegExp(`(-|−)?${escapedSymbol}\\s?\\d[\\d,.]*`, "g"), (amount) => {
    const sign = amount.startsWith("-") || amount.startsWith("−") ? amount[0] : "";
    return `${sign}${symbol}${MASK}`;
  });
}
