// Interactive Brokers Flex Web Service client for the Deno runtime. A port of
// tools/ibkr/flex.ts: the same two-step request/download and the same parsed
// shapes, so statements read the same way here and in the repo's tools.

import { XMLParser } from "npm:fast-xml-parser@5";

const BASE = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";

// 1019 = statement still generating; 1018 = request throttled. Everything else
// (bad token, expired token, unknown query) is a setup problem, not a blip.
const RETRYABLE = new Set(["1018", "1019"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
});

export class FlexError extends Error {
  code: string;
  retryable: boolean;
  constructor(message: string, code: string, retryable: boolean) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export interface FlexPosition {
  accountId: string;
  symbol: string;
  description: string;
  currency: string;
  assetCategory: string;
  quantity: number;
  markPrice: number | null;
  positionValue: number | null;
  costBasisMoney: number | null;
  unrealizedPnl: number | null;
  /** IBKR's own rate to the account's base currency, when the query reports it. */
  fxRateToBase: number | null;
}

export interface FlexTrade {
  accountId: string;
  conid: string;
  symbol: string;
  description: string;
  assetCategory: string;
  currency: string;
  fxRateToBase: number | null;
  tradeId: string;
  orderId: string;
  /** ISO 8601 local exchange time, e.g. 2026-03-04T15:30:01. */
  dateTime: string;
  side: "buy" | "sell";
  /** Signed: positive buys, negative sells. */
  quantity: number;
  price: number;
  multiplier: number;
  proceeds: number;
  commission: number;
  netCash: number;
  fifoPnlRealized: number | null;
  openClose: string | null;
}

export interface FlexTrades {
  accountId: string;
  whenGenerated: string;
  fromDate: string;
  toDate: string;
  trades: FlexTrade[];
}

export interface FlexStatement {
  accountId: string;
  whenGenerated: string;
  toDate: string;
  positions: FlexPosition[];
  nav: { total: number; cash: number; stock: number; currency: string } | null;
  cash: { value: number; currency: string } | null;
}

function asArray<T>(v: unknown): T[] {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]) as T[];
}
const numOrNull = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function readStatus(xml: string): Record<string, string> | null {
  const doc = parser.parse(xml) as Record<string, Record<string, string>>;
  return doc.FlexStatementResponse ?? null;
}

async function get(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "vantage/1.0" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new FlexError(`${(err as Error).message} reaching Flex Web Service`, "transport", true);
  }
  if (!res.ok) {
    throw new FlexError(
      `HTTP ${res.status} from Flex Web Service`,
      String(res.status),
      res.status >= 500,
    );
  }
  return res.text();
}

/** Step 1: ask IBKR to generate the statement; returns a reference code. */
export async function requestStatement(token: string, queryId: string) {
  const xml = await get(
    `${BASE}/SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`,
  );
  const body = readStatus(xml);
  if (!body || body.Status !== "Success") {
    const code = String(body?.ErrorCode ?? "unknown");
    throw new FlexError(
      `Flex request refused: ${body?.ErrorMessage ?? xml.slice(0, 200)}`,
      code,
      RETRYABLE.has(code),
    );
  }
  return { referenceCode: String(body.ReferenceCode), url: String(body.Url) };
}

/** Step 2: download the generated statement. Throws a retryable error while it is still building. */
export async function downloadStatement(token: string, referenceCode: string, url: string) {
  const xml = await get(
    `${url}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(referenceCode)}&v=3`,
  );
  const body = readStatus(xml);
  if (body && body.Status !== "Success") {
    const code = String(body.ErrorCode ?? "unknown");
    throw new FlexError(
      String(body.ErrorMessage ?? "Flex download failed"),
      code,
      RETRYABLE.has(code),
    );
  }
  return xml;
}

/** Request and download with patience: IBKR takes seconds to a minute to build a statement. */
export async function fetchStatement(token: string, queryId: string, budgetMs = 90_000) {
  const started = Date.now();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let ref: { referenceCode: string; url: string } | undefined;
  for (let attempt = 0; !ref; attempt++) {
    try {
      ref = await requestStatement(token, queryId);
    } catch (e) {
      const err = e as FlexError;
      if (!err.retryable || Date.now() - started > budgetMs) throw err;
      await sleep(Math.min(5_000 * (attempt + 1), 15_000));
    }
  }
  for (let attempt = 0; ; attempt++) {
    try {
      return await downloadStatement(token, ref.referenceCode, ref.url);
    } catch (e) {
      const err = e as FlexError;
      if (!err.retryable || Date.now() - started > budgetMs) throw err;
      await sleep(Math.min(5_000 * (attempt + 1), 15_000));
    }
  }
}

function firstStatement(xml: string): Record<string, unknown> {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const response = doc.FlexQueryResponse as Record<string, unknown> | undefined;
  const statements = response?.FlexStatements as Record<string, unknown> | undefined;
  const statement = asArray<Record<string, unknown>>(statements?.FlexStatement)[0];
  if (!statement) throw new FlexError("No FlexStatement in the response", "parse", false);
  return statement;
}

/** Flex writes "yyyy-MM-dd;HHmmss" when the query's date and time formats are the defaults. */
function flexDateTime(v: string | undefined): string {
  if (!v) return "";
  const [date, time] = v.split(/[;, ]/);
  if (!time) return date;
  const t = time.replace(/:/g, "");
  return `${date}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6) || "00"}`;
}

export function parseTrades(xml: string): FlexTrades {
  const statement = firstStatement(xml);
  const section = statement.Trades as Record<string, unknown> | undefined;
  const rows = asArray<Record<string, string>>(section?.Trade);
  const trades: FlexTrade[] = rows
    .filter((r) => !r.levelOfDetail || r.levelOfDetail === "EXECUTION")
    .map((r) => {
      const quantity = Number(r.quantity);
      return {
        accountId: r.accountId,
        conid: String(r.conid ?? ""),
        symbol: r.symbol,
        description: r.description ?? "",
        assetCategory: r.assetCategory ?? "",
        currency: r.currency,
        fxRateToBase: numOrNull(r.fxRateToBase),
        tradeId: String(r.tradeID ?? r.transactionID ?? ""),
        orderId: String(r.ibOrderID ?? r.orderID ?? ""),
        dateTime: flexDateTime(r.dateTime) || r.tradeDate || "",
        side: r.buySell?.startsWith("SELL") || quantity < 0 ? "sell" : "buy",
        quantity,
        price: Number(r.tradePrice),
        multiplier: numOrNull(r.multiplier) ?? 1,
        proceeds: numOrNull(r.proceeds) ?? 0,
        commission: numOrNull(r.ibCommission) ?? 0,
        netCash:
          numOrNull(r.netCash) ?? (numOrNull(r.proceeds) ?? 0) + (numOrNull(r.ibCommission) ?? 0),
        fifoPnlRealized: numOrNull(r.fifoPnlRealized),
        openClose: r.openCloseIndicator || null,
      };
    });
  return {
    accountId: String(statement.accountId ?? trades[0]?.accountId ?? ""),
    whenGenerated: String(statement.whenGenerated ?? ""),
    fromDate: String(statement.fromDate ?? ""),
    toDate: String(statement.toDate ?? ""),
    trades,
  };
}

export function parseStatement(xml: string): FlexStatement {
  const statement = firstStatement(xml);
  const openPositions = statement.OpenPositions as Record<string, unknown> | undefined;
  const rows = asArray<Record<string, string>>(openPositions?.OpenPosition);
  const positions: FlexPosition[] = rows.map((r) => ({
    accountId: r.accountId,
    symbol: r.symbol,
    description: r.description ?? "",
    currency: r.currency,
    assetCategory: r.assetCategory ?? "",
    quantity: Number(r.position),
    markPrice: numOrNull(r.markPrice),
    positionValue: numOrNull(r.positionValue),
    costBasisMoney: numOrNull(r.costBasisMoney),
    unrealizedPnl: numOrNull(r.fifoPnlUnrealized),
    fxRateToBase: numOrNull(r.fxRateToBase),
  }));
  const navSection = statement.EquitySummaryInBase as Record<string, unknown> | undefined;
  const navRows = asArray<Record<string, string>>(navSection?.EquitySummaryByReportDateInBase);
  const last = navRows.at(-1);
  const cashSection = statement.CashReport as Record<string, unknown> | undefined;
  const cashRows = asArray<Record<string, string>>(cashSection?.CashReportCurrency);
  const cashRow =
    cashRows.find((r) => r.levelOfDetail === "BASE_SUMMARY") ??
    cashRows.find((r) => r.currency === "BASE_SUMMARY") ??
    cashRows[0];
  const baseCurrency = String(last?.currency ?? "");
  return {
    accountId: String(statement.accountId ?? positions[0]?.accountId ?? ""),
    whenGenerated: String(statement.whenGenerated ?? ""),
    toDate: String(statement.toDate ?? ""),
    positions,
    cash: cashRow
      ? {
          value: Number(cashRow.endingCash),
          currency:
            cashRow.currency === "BASE_SUMMARY" ? baseCurrency : String(cashRow.currency ?? ""),
        }
      : null,
    nav: last
      ? {
          total: Number(last.total),
          cash: Number(last.cash),
          stock: Number(last.stock),
          currency: String(last.currency ?? ""),
        }
      : null,
  };
}
