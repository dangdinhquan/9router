import { NextResponse } from "next/server";
import { getApiKeys, createApiKey, updateApiKey } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";

export const dynamic = "force-dynamic";

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
    const apiKey = await createApiKey(name, machineId);

    const sanitizedMetric = quotaMetric === "tokens" ? "tokens" : "cost";
    const sanitizedPeriod = ["daily", "weekly", "monthly"].includes(quotaPeriod) ? quotaPeriod : "monthly";
    const numericLimit = quotaLimit === null || quotaLimit === undefined || quotaLimit === ""
      ? null
      : Number(quotaLimit);
    const nextPolicy = {
      quotaMetric: sanitizedMetric,
      quotaPeriod: sanitizedPeriod,
      quotaLimit: Number.isFinite(numericLimit) && numericLimit > 0 ? numericLimit : null,
      allowedProviders: Array.isArray(allowedProviders) ? [...new Set(allowedProviders.filter(Boolean))] : [],
      allowedModels: Array.isArray(allowedModels) ? [...new Set(allowedModels.filter(Boolean))] : [],
    };

    const updatedKey = await updateApiKey(apiKey.id, nextPolicy);

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
