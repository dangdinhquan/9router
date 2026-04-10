import { NextResponse } from "next/server";
import { getApiKeys, createApiKey } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";

export const dynamic = "force-dynamic";

function normalizeKeySettings(body = {}) {
  const sanitizedMetric = body.quotaMetric === "tokens" ? "tokens" : "cost";
  const sanitizedPeriod = ["daily", "weekly", "monthly"].includes(body.quotaPeriod) ? body.quotaPeriod : "monthly";
  const numericLimit = body.quotaLimit === null || body.quotaLimit === undefined || body.quotaLimit === ""
    ? null
    : Number(body.quotaLimit);
  return {
    quotaMetric: sanitizedMetric,
    quotaPeriod: sanitizedPeriod,
    quotaLimit: Number.isFinite(numericLimit) && numericLimit > 0 ? numericLimit : null,
    allowedProviders: Array.isArray(body.allowedProviders) ? [...new Set(body.allowedProviders.filter(Boolean))] : [],
    allowedModels: Array.isArray(body.allowedModels) ? [...new Set(body.allowedModels.filter(Boolean))] : [],
  };
}

// GET /api/keys - List API keys
export async function GET() {
  try {
    const keys = await getApiKeys();
    return NextResponse.json({ keys });
  } catch (error) {
    console.log("Error fetching keys:", error);
    return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
  }
}

// POST /api/keys - Create new API key
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, quotaMetric, quotaPeriod, quotaLimit, allowedProviders, allowedModels } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Always get machineId from server
    const machineId = await getConsistentMachineId();
    const nextPolicy = normalizeKeySettings({ quotaMetric, quotaPeriod, quotaLimit, allowedProviders, allowedModels });
    const updatedKey = await createApiKey(name, machineId, nextPolicy);

    return NextResponse.json({
      key: updatedKey.key,
      name: updatedKey.name,
      id: updatedKey.id,
      machineId: updatedKey.machineId,
      isActive: updatedKey.isActive,
      quotaMetric: updatedKey.quotaMetric,
      quotaPeriod: updatedKey.quotaPeriod,
      quotaLimit: updatedKey.quotaLimit,
      allowedProviders: updatedKey.allowedProviders,
      allowedModels: updatedKey.allowedModels,
    }, { status: 201 });
  } catch (error) {
    console.log("Error creating key:", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}
