import { Readable } from "stream";
import { google, drive_v3 } from "googleapis";

const SCOPE = "https://www.googleapis.com/auth/drive";

let driveClient: drive_v3.Drive | null = null;

/**
 * Create the Drive client once and reuse it across requests. The service
 * account credentials are read from GOOGLE_SERVICE_ACCOUNT_JSON and parsed
 * as JSON; the master folder id is read from MASTER_FOLDER_ID.
 */
export function getDrive(): drive_v3.Drive {
  if (driveClient) return driveClient;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  }

  let credentials: { client_email?: string; private_key?: string };
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [SCOPE],
  });

  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

export function getMasterFolderId(): string {
  const id = process.env.MASTER_FOLDER_ID;
  if (!id) {
    throw new Error("MASTER_FOLDER_ID is not set");
  }
  return id;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * Find the "Active" subfolder inside the master folder and return its id.
 * Throws a clear error if the master folder has no "Active" subfolder.
 */
export async function getActiveFolderId(): Promise<string> {
  const drive = getDrive();
  const masterId = getMasterFolderId();

  const res = await drive.files.list({
    q: `'${masterId}' in parents and name = 'Active' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, name)",
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const active = res.data.files?.[0];
  if (!active?.id) {
    throw new Error('The "Active" subfolder was not found in the master folder');
  }
  return active.id;
}

/**
 * List the property folders inside "Active" (folders only), returning their
 * names sorted alphabetically.
 */
export async function listProperties(): Promise<string[]> {
  const drive = getDrive();
  const activeId = await getActiveFolderId();

  const names: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${activeId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    for (const f of res.data.files ?? []) {
      if (f.name) names.push(f.name);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return names.sort((a, b) => a.localeCompare(b));
}

/**
 * Look up a property folder by exact name inside "Active". Returns the folder
 * id, or null if no matching folder exists.
 */
export async function findPropertyFolder(
  propertyName: string
): Promise<string | null> {
  const drive = getDrive();
  const activeId = await getActiveFolderId();

  // Escape single quotes for the Drive query language.
  const escaped = propertyName.replace(/'/g, "\\'");

  const res = await drive.files.list({
    q: `'${activeId}' in parents and name = '${escaped}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, name)",
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return res.data.files?.[0]?.id ?? null;
}

/**
 * Upload a single file (provided as a Buffer) to the target folder with the
 * given name and mime type.
 */
export async function uploadFile(
  folderId: string,
  name: string,
  mimeType: string,
  buffer: Buffer
): Promise<void> {
  const drive = getDrive();

  await drive.files.create({
    requestBody: {
      name,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id",
    supportsAllDrives: true,
  });
}
