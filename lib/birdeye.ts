import { promises as fs } from "fs";
import path from "path";
import type {
  BirdeyeTokenHolding,
  BirdeyeTransaction,
  BirdeyeTokenOverview,
  BirdeyeTokenSecurity,
  BirdeyeOHLCV,
  BirdeyeNewListing,
  BirdeyePrice,
  BirdeyeWalletData,
} from "./types";

const BASE_URL = "https://public-api.birdeye.so";
const LOG_FILE = path.join(
  process.env.VERCEL === "1" || process.env.VERCEL_ENV ? "/tmp" : process.cwd(),
  "api_calls.log"
);

/** Typed error for Birdeye API failures (non-ok, exhausted retries, network) */
export class BirdeyeApiError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly statusCode: number | null,
    message: string
  ) {
    super(message);
    this.name = "BirdeyeApiError";
  }
}

let lastCallTimestamps: number[] = [];

function getRateLimitRps(): number {
  const env = process.env.RATE_LIMIT_RPS;
  return env ? parseInt(env, 10) : 10;
}

async function rateLimitWait(): Promise<void> {
  const rps = getRateLimitRps();
  const now = Date.now();
  lastCallTimestamps = lastCallTimestamps.filter((t) => now - t < 1000);
  if (lastCallTimestamps.length >= rps) {
    const oldest = lastCallTimestamps[0];
    const waitMs = 1000 - (now - oldest) + 10;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  lastCallTimestamps.push(Date.now());
}

async function logApiCall(
  endpoint: string,
  identifier: string,
  statusCode: number
): Promise<void> {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${endpoint}] [${identifier}] [${statusCode}]\n`;
  try {
    await fs.appendFile(LOG_FILE, line, "utf-8");
  } catch {
    try {
      await fs.writeFile(LOG_FILE, line, "utf-8");
    } catch {
      console.error("Failed to write API log");
    }
  }
}

function getApiKey(): string | undefined {
  return process.env.BIRDEYE_API_KEY;
}

/**
 * Core fetch wrapper for Birdeye API.
 * Returns null ONLY when no API key is configured (demo/local mode).
 * Throws BirdeyeApiError for any upstream failure: non-ok status,
 * exhausted 429 retries, or network errors after all retry attempts.
 */
async function birdeyeFetch<T>(
  endpoint: string,
  identifier: string,
  params: Record<string, string> = {},
  retries = 3
): Promise<T | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  await rateLimitWait();

  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set("chain", "solana");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: {
          "X-API-KEY": apiKey,
          accept: "application/json",
        },
      });

      await logApiCall(endpoint, identifier, res.status);

      if (res.status === 429) {
        if (attempt === retries - 1) {
          throw new BirdeyeApiError(
            endpoint,
            429,
            `Birdeye ${endpoint} rate limited after ${retries} attempts`
          );
        }
        const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }

      if (!res.ok) {
        throw new BirdeyeApiError(
          endpoint,
          res.status,
          `Birdeye ${endpoint} returned ${res.status}: ${res.statusText}`
        );
      }

      const json: unknown = await res.json();
      if (
        json &&
        typeof json === "object" &&
        "data" in json &&
        (json as Record<string, unknown>).success !== false
      ) {
        return (json as Record<string, unknown>).data as T;
      }
      return json as T;
    } catch (err) {
      if (err instanceof BirdeyeApiError) throw err;

      console.error(`Birdeye ${endpoint} fetch error:`, err);
      if (attempt === retries - 1) {
        throw new BirdeyeApiError(
          endpoint,
          null,
          `Birdeye ${endpoint} network error after ${retries} attempts`
        );
      }
      const backoff = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  throw new BirdeyeApiError(
    endpoint,
    null,
    `Birdeye ${endpoint} failed after ${retries} attempts`
  );
}

/** Calls /v1/wallet/token_list to fetch wallet token holdings and values */
export async function fetchWalletTokenList(
  wallet: string
): Promise<BirdeyeTokenHolding[]> {
  interface TokenListResponse {
    items?: BirdeyeTokenHolding[];
  }
  const data = await birdeyeFetch<TokenListResponse>(
    "/v1/wallet/token_list",
    wallet,
    { wallet }
  );
  if (!data) return [];
  return data.items ?? [];
}

/** Calls /v1/wallet/tx/list to fetch complete transaction history for a wallet */
export async function fetchWalletTransactions(
  wallet: string
): Promise<BirdeyeTransaction[]> {
  const allTxs: BirdeyeTransaction[] = [];
  let offset = 0;
  const limit = 50;
  const maxPages = 10;

  for (let page = 0; page < maxPages; page++) {
    interface TxListResponse {
      items?: BirdeyeTransaction[];
      solTransfers?: BirdeyeTransaction[];
      [key: string]: unknown;
    }
    const data = await birdeyeFetch<TxListResponse>(
      "/v1/wallet/tx/list",
      wallet,
      { wallet, offset: String(offset), limit: String(limit), tx_type: "swap" }
    );
    if (!data) return allTxs;

    const items = data.items ?? data.solTransfers ?? [];
    if (items.length === 0) break;
    allTxs.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return allTxs;
}

/** Calls /defi/token_overview to fetch token metadata including liquidity and market cap */
export async function fetchTokenOverview(
  tokenAddress: string
): Promise<BirdeyeTokenOverview | null> {
  return birdeyeFetch<BirdeyeTokenOverview>(
    "/defi/token_overview",
    tokenAddress,
    { address: tokenAddress }
  );
}

/** Calls /defi/price to fetch current price for a token */
export async function fetchTokenPrice(
  tokenAddress: string
): Promise<BirdeyePrice | null> {
  return birdeyeFetch<BirdeyePrice>("/defi/price", tokenAddress, {
    address: tokenAddress,
  });
}

/** Calls /defi/ohlcv to fetch price history for entry/exit timing analysis */
export async function fetchTokenOhlcv(
  tokenAddress: string,
  timeFrom: number,
  timeTo: number
): Promise<BirdeyeOHLCV[]> {
  interface OhlcvResponse {
    items?: BirdeyeOHLCV[];
  }
  const data = await birdeyeFetch<OhlcvResponse>(
    "/defi/ohlcv",
    tokenAddress,
    {
      address: tokenAddress,
      type: "1D",
      time_from: String(timeFrom),
      time_to: String(timeTo),
    }
  );
  if (!data) return [];
  return data.items ?? [];
}

/** Calls /defi/token_security to check if tokens traded are rugged or flagged */
export async function fetchTokenSecurity(
  tokenAddress: string
): Promise<BirdeyeTokenSecurity | null> {
  return birdeyeFetch<BirdeyeTokenSecurity>(
    "/defi/token_security",
    tokenAddress,
    { address: tokenAddress }
  );
}

/** Calls /defi/v2/tokens/new_listing to cross-reference for early entry scoring */
export async function fetchNewListings(): Promise<BirdeyeNewListing[]> {
  interface NewListingResponse {
    items?: BirdeyeNewListing[];
  }
  const data = await birdeyeFetch<NewListingResponse>(
    "/defi/v2/tokens/new_listing",
    "global",
    { limit: "50", sort_by: "createdAt", sort_type: "desc" }
  );
  if (!data) return [];
  return data.items ?? [];
}

/** Fetches all wallet data from Birdeye for scoring */
export async function fetchAllWalletData(
  wallet: string
): Promise<BirdeyeWalletData | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const [holdings, transactions] = await Promise.all([
    fetchWalletTokenList(wallet),
    fetchWalletTransactions(wallet),
  ]);

  let newListings: BirdeyeNewListing[] = [];
  try {
    newListings = await fetchNewListings();
  } catch (err) {
    if (err instanceof BirdeyeApiError) {
      console.error(`Skipping new listing enrichment: ${err.message}`);
    } else {
      throw err;
    }
  }

  const tokenAddresses = new Set<string>();
  for (const h of holdings) {
    if (h.address) tokenAddresses.add(h.address);
  }
  for (const tx of transactions) {
    if (tx.tokenAddress) tokenAddresses.add(tx.tokenAddress);
  }

  const uniqueTokens = Array.from(tokenAddresses).slice(0, 20);

  const tokenOverviews = new Map<string, BirdeyeTokenOverview>();
  const tokenSecurities = new Map<string, BirdeyeTokenSecurity>();
  const tokenPrices = new Map<string, number>();
  const tokenOhlcv = new Map<string, BirdeyeOHLCV[]>();

  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60;

  for (const addr of uniqueTokens) {
    try {
      const [overview, security, price, ohlcv] = await Promise.all([
        fetchTokenOverview(addr),
        fetchTokenSecurity(addr),
        fetchTokenPrice(addr),
        fetchTokenOhlcv(addr, thirtyDaysAgo, now),
      ]);

      if (overview) tokenOverviews.set(addr, overview);
      if (security) tokenSecurities.set(addr, security);
      if (price && price.value) tokenPrices.set(addr, price.value);
      if (ohlcv.length > 0) tokenOhlcv.set(addr, ohlcv);
    } catch (err) {
      if (err instanceof BirdeyeApiError) {
        console.error(`Skipping enrichment for token ${addr}: ${err.message}`);
        continue;
      }
      throw err;
    }
  }

  return {
    holdings,
    transactions,
    tokenOverviews,
    tokenSecurities,
    tokenPrices,
    tokenOhlcv,
    newListings,
  };
}
