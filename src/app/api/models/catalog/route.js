import { NextResponse } from "next/server";
import { getModelCatalog } from "@/lib/modelCatalogService";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("forceRefresh") === "1";
    const catalog = await getModelCatalog({ forceRefresh });
    return NextResponse.json(catalog);
  } catch (error) {
    console.warn("Error getting model catalog:", error?.message || "unknown error");
    return NextResponse.json({ error: "Failed to get model catalog" }, { status: 500 });
  }
}
