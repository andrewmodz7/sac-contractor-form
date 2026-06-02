import { NextResponse } from "next/server";
import { findPropertyFolder, uploadFile } from "@/lib/drive";

export const dynamic = "force-dynamic";
// Large photo uploads can take a while; give the route room to run.
export const maxDuration = 300;

/**
 * Build a base timestamp in US Eastern time formatted as
 * MM/DD/YYYY HH:MM:SS (24-hour).
 */
function easternTimestamp(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  let hour = get("hour");
  // Intl can emit "24" for midnight in some environments; normalize to "00".
  if (hour === "24") hour = "00";

  return `${get("month")}/${get("day")}/${get("year")} ${hour}:${get(
    "minute"
  )}:${get("second")}`;
}

/** Derive a file extension from the filename, falling back to the mime type. */
function getExtension(fileName: string, mimeType: string): string {
  const fromName = fileName.includes(".")
    ? fileName.split(".").pop()
    : undefined;
  if (fromName) return fromName.toLowerCase();

  const fromMime = mimeType.split("/").pop();
  return (fromMime || "jpg").toLowerCase();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const property = formData.get("property");
    const jobType = formData.get("jobType");
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);

    if (typeof property !== "string" || !property.trim()) {
      return NextResponse.json(
        { error: "Please choose a property." },
        { status: 400 }
      );
    }
    if (typeof jobType !== "string" || !jobType.trim()) {
      return NextResponse.json(
        { error: "Please choose a job type." },
        { status: 400 }
      );
    }
    if (files.length === 0) {
      return NextResponse.json(
        { error: "Please select at least one photo." },
        { status: 400 }
      );
    }

    let folderId: string | null;
    try {
      folderId = await findPropertyFolder(property);
    } catch (err) {
      console.error("POST /api/submit folder lookup failed:", err);
      const message =
        err instanceof Error && /"Active"/.test(err.message)
          ? 'The "Active" folder could not be found. Please contact the administrator.'
          : "Unable to verify the property right now. Please try again.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    if (!folderId) {
      return NextResponse.json(
        {
          error:
            "This property is no longer accepting submissions, please refresh.",
        },
        { status: 410 }
      );
    }

    const timestamp = easternTimestamp();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = getExtension(file.name, file.type);
      const suffix = i === 0 ? "" : `-${i + 1}`;
      const name = `${jobType} ${timestamp}${suffix}.${ext}`;
      const mimeType = file.type || "application/octet-stream";
      const buffer = Buffer.from(await file.arrayBuffer());

      await uploadFile(folderId, name, mimeType, buffer);
    }

    return NextResponse.json({ count: files.length, property });
  } catch (err) {
    console.error("POST /api/submit failed:", err);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 }
    );
  }
}
