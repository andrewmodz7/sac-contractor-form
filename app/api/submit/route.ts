import { Readable } from "stream";
import { NextResponse } from "next/server";
import Busboy from "busboy";
import { findPropertyFolder, uploadFile } from "@/lib/drive";
import { sendUploadNotification } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Build a base timestamp in US Eastern time formatted as
 * MM/DD/YYYY HH:MM:SS (24-hour). Uses Intl with an explicit timeZone so it is
 * correct regardless of the server's timezone (Railway runs in UTC).
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
  const fromName =
    fileName && fileName.includes(".") ? fileName.split(".").pop() : undefined;
  if (fromName) return fromName.toLowerCase();

  const fromMime = mimeType.split("/").pop();
  return (fromMime || "jpg").toLowerCase();
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data") || !request.body) {
    return NextResponse.json(
      { error: "Invalid request. Please try again." },
      { status: 400 }
    );
  }

  // One base timestamp shared by every file in this submission.
  const timestamp = easternTimestamp();

  const fields: Record<string, string> = {};
  // The folder lookup is kicked off as soon as the property field arrives so it
  // is (almost always) resolved by the time the first file part streams in.
  let folderPromise: Promise<string | null> | null = null;
  let folderLookupErrorMessage: string | null = null;
  let acceptedCount = 0;
  const uploads: Promise<void>[] = [];

  const bb = Busboy({ headers: { "content-type": contentType } });

  const parsing = new Promise<void>((resolve, reject) => {
    bb.on("field", (name, value) => {
      fields[name] = value;
      if (name === "property" && value.trim() && !folderPromise) {
        folderPromise = findPropertyFolder(value).catch((err) => {
          console.error("POST /api/submit folder lookup failed:", err);
          const raw = err instanceof Error ? err.message : String(err);
          folderLookupErrorMessage = /"Active"/.test(raw)
            ? 'The "Active" folder could not be found. Please contact the administrator.'
            : "Unable to verify the property right now. Please try again.";
          return null;
        });
      }
    });

    bb.on("file", (_name, fileStream, info) => {
      // The browser serializes FormData in append order (property, jobType,
      // then files), so the fields above are already populated here.
      const upload = (async () => {
        const folderId = folderPromise ? await folderPromise : null;
        if (!folderId) {
          // No valid destination — discard this part so parsing can continue.
          fileStream.resume();
          return;
        }

        acceptedCount += 1;
        const index = acceptedCount; // 1-based order among accepted files
        const ext = getExtension(info.filename, info.mimeType);
        const suffix = index === 1 ? "" : `-${index}`;
        const name = `${fields.jobType} ${timestamp}${suffix}.${ext}`;
        const mimeType = info.mimeType || "application/octet-stream";

        // Pipe the file part straight to Drive — never fully buffered here.
        await uploadFile(folderId, name, mimeType, fileStream);
      })().catch((err) => {
        // Surface the failure to the parse-level promise and stop reading.
        fileStream.resume();
        throw err;
      });

      uploads.push(upload);
    });

    bb.on("error", reject);
    bb.on("close", resolve);
  });

  try {
    Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]).pipe(
      bb
    );
    await parsing;
    await Promise.all(uploads);
  } catch (err) {
    console.error("POST /api/submit failed:", err);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 }
    );
  }

  // Validation happens after parsing so we never buffer the body up front.
  if (!fields.property || !fields.property.trim()) {
    return NextResponse.json(
      { error: "Please choose a property." },
      { status: 400 }
    );
  }
  if (!fields.jobType || !fields.jobType.trim()) {
    return NextResponse.json(
      { error: "Please choose a job type." },
      { status: 400 }
    );
  }
  if (folderLookupErrorMessage) {
    return NextResponse.json(
      { error: folderLookupErrorMessage },
      { status: 500 }
    );
  }

  const folderId = folderPromise ? await folderPromise : null;
  if (!folderId) {
    return NextResponse.json(
      {
        error:
          "This property is no longer accepting submissions, please refresh.",
      },
      { status: 410 }
    );
  }

  if (acceptedCount === 0) {
    return NextResponse.json(
      { error: "Please select at least one photo." },
      { status: 400 }
    );
  }

  // Side effect only: notify Kenneth that a new batch arrived. A failure here
  // must never fail the request — the upload already succeeded in Drive.
  try {
    await sendUploadNotification({
      property: fields.property,
      jobType: fields.jobType,
      count: acceptedCount,
      timestamp,
    });
  } catch (err) {
    console.error("POST /api/submit notification email failed:", err);
  }

  return NextResponse.json({ count: acceptedCount, property: fields.property });
}
