import { NextResponse } from "next/server";
import { fetchAllWalletData, BirdeyeApiError } from "@/lib/birdeye";
import { scoreWallet, generateDemoReport } from "@/lib/scorer";
import { getCachedReport, cacheReport } from "@/lib/db";

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidSolanaAddress(addr: string): boolean {
  const trimmed = addr.trim();
  return BASE58_REGEX.test(trimmed) && trimmed.length >= 32 && trimmed.length <= 44;
}

/** GET /api/wallet/[address] — validates address, checks cache, fetches, scores, caches, returns report */
export async function GET(
  _request: Request,
  { params }: { params: { address: string } }
): Promise<NextResponse> {
  const address = params.address.trim();

  if (!isValidSolanaAddress(address)) {
    return NextResponse.json(
      { error: "Invalid Solana wallet address." },
      { status: 400 }
    );
  }

  const apiKey = process.env.BIRDEYE_API_KEY;
  const cached = getCachedReport(address);
  if (cached && (!apiKey || !cached.demoMode)) {
    return NextResponse.json(cached);
  }

  if (!apiKey) {
    const demo = generateDemoReport(address);
    cacheReport(demo);
    return NextResponse.json(demo);
  }

  try {
    const walletData = await fetchAllWalletData(address);

    if (!walletData) {
      return NextResponse.json(
        { error: "Failed to fetch wallet data." },
        { status: 500 }
      );
    }

    const report = scoreWallet(walletData, address);
    cacheReport(report);
    return NextResponse.json(report);
  } catch (err) {
    console.error("Wallet analysis error:", err);

    if (err instanceof BirdeyeApiError) {
      const status = err.statusCode === 401 || err.statusCode === 403 ? 502 : 500;
      const detail =
        err.statusCode === 401
          ? "Birdeye API key is invalid or the required endpoint is not enabled on your plan. Check BIRDEYE_API_KEY and plan access."
          : err.statusCode === 403
            ? "Birdeye API key does not have permission for this endpoint. Verify plan access."
            : `Birdeye API error: ${err.message}`;
      return NextResponse.json({ error: detail }, { status });
    }

    return NextResponse.json(
      { error: "Failed to analyse wallet. Please try again." },
      { status: 500 }
    );
  }
}
