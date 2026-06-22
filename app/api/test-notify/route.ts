import { NextResponse } from "next/server";
import { sendUploadNotification } from "@/lib/email";

// TEMPORARY throwaway route to verify the real upload-notification email format.
// Delete after one test. It calls the exact same sendUploadNotification used by
// /api/submit (no duplicated send path / formatting) and CCs amodzelewski so the
// test lands on the same thread as the real kdanna recipient.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mirrors the easternTimestamp helper in app/api/submit/route.ts so the test
 * email's timestamp format matches a real send. Copied here (not imported)
 * because the route's helper is not exported and the real route must not be
 * modified; this copy is throwaway and disappears with the route.
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
  if (hour === "24") hour = "00";

  return `${get("month")}/${get("day")}/${get("year")} ${hour}:${get(
    "minute"
  )}:${get("second")}`;
}

export async function GET() {
  const timestamp = easternTimestamp();

  try {
    await sendUploadNotification({
      property: "1118 Rosa L Jones Drive",
      jobType: "Framing",
      count: 3,
      timestamp,
      cc: "amodzelewski@shoreacrescapital.com",
    });
    return NextResponse.json({
      ok: true,
      to: "kdanna@shoreacrescapital.com",
      cc: "amodzelewski@shoreacrescapital.com",
      timestamp,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
