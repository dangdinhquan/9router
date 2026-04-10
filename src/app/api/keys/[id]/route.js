import { NextResponse } from "next/server";
import { deleteApiKey, getApiKeyById, updateApiKey } from "@/lib/localDb";

// GET /api/keys/[id] - Get single key
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    return NextResponse.json({ key });
  } catch (error) {
    console.log("Error fetching key:", error);
    return NextResponse.json({ error: "Failed to fetch key" }, { status: 500 });
  }
}

// PUT /api/keys/[id] - Update key
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { isActive, name, quotaMetric, quotaPeriod, quotaLimit, allowedProviders, allowedModels } = body;

    const existing = await getApiKeyById(id);
    if (!existing) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const updateData = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (typeof name === "string" && name.trim()) updateData.name = name.trim();
    if (quotaMetric !== undefined) {
      updateData.quotaMetric = quotaMetric === "tokens" ? "tokens" : "cost";
    }
    if (quotaPeriod !== undefined) {
      updateData.quotaPeriod = ["daily", "weekly", "monthly"].includes(quotaPeriod) ? quotaPeriod : "monthly";
    }
    if (quotaLimit !== undefined) {
      if (quotaLimit === null || quotaLimit === "") {
        updateData.quotaLimit = null;
      } else {
        const numeric = Number(quotaLimit);
        updateData.quotaLimit = Number.isFinite(numeric) && numeric > 0 ? numeric : null;
      }
    }
    if (allowedProviders !== undefined) {
      updateData.allowedProviders = Array.isArray(allowedProviders)
        ? [...new Set(allowedProviders.filter(Boolean))]
        : [];
    }
    if (allowedModels !== undefined) {
      updateData.allowedModels = Array.isArray(allowedModels)
        ? [...new Set(allowedModels.filter(Boolean))]
        : [];
    }

    const updated = await updateApiKey(id, updateData);

    return NextResponse.json({ key: updated });
  } catch (error) {
    console.log("Error updating key:", error);
    return NextResponse.json({ error: "Failed to update key" }, { status: 500 });
  }
}

// DELETE /api/keys/[id] - Delete API key
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    const deleted = await deleteApiKey(id);
    if (!deleted) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Key deleted successfully" });
  } catch (error) {
    console.log("Error deleting key:", error);
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }
}
