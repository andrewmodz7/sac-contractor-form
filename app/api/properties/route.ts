import { NextResponse } from "next/server";
import { listProperties } from "@/lib/drive";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const properties = await listProperties();
    return NextResponse.json({ properties });
  } catch (err) {
    console.error("GET /api/properties failed:", err);

    const message =
      err instanceof Error && /"Active"/.test(err.message)
        ? 'The "Active" folder could not be found. Please contact the administrator.'
        : "Unable to load properties right now. Please try again.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
