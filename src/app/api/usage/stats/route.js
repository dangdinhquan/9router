import { NextResponse } from "next/server";
import { getUsageStats } from "@/lib/usageDb";

const VALID_PERIODS = new Set(["24h", "7d", "30d", "60d", "all"]);
const VALID_API_KEY_SCOPES = new Set(["global", "api-key", "no-key"]);

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";
    const apiKeyScope = searchParams.get("apiKeyScope") || "global";

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    if (!VALID_API_KEY_SCOPES.has(apiKeyScope)) {
      return NextResponse.json({ error: "Invalid apiKeyScope" }, { status: 400 });
    }

    const stats = await getUsageStats(period, { apiKeyScope });
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[API] Failed to get usage stats:", error);
    return NextResponse.json({ error: "Failed to fetch usage stats" }, { status: 500 });
  }
}
