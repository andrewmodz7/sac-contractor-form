# Contractor Photo Submission

A mobile-first Next.js 14 (App Router, TypeScript, Tailwind) app that lets
contractors submit job-site photos. There is no authentication — the form is
meant to be opened directly on a phone. **Google Drive is the data layer**: a
service account reads the list of active properties from Drive and uploads the
submitted photos back into the matching property folder.

## How it works

The app expects a Drive folder hierarchy like this:

```
Master folder (MASTER_FOLDER_ID)
└── Active
    ├── 123 Main St
    ├── 456 Oak Ave
    └── ...
```

- **Form page (`/`)** — three fields: a property dropdown (populated from
  Drive), a job-type dropdown, and a multi-file photo input with camera capture
  enabled on mobile.
- **`GET /api/properties`** — lists the children of the master folder, finds the
  `Active` subfolder, lists the property subfolders inside it, and returns their
  names sorted alphabetically.
- **`POST /api/submit`** — looks up the target property folder inside `Active`
  by name. If it no longer exists, it returns `410` so the contractor knows to
  refresh. Otherwise it builds a base timestamp in US Eastern time
  (`MM/DD/YYYY HH:MM:SS`, 24-hour) and uploads each file named
  `{job type} {timestamp}.{ext}`, with `-2`, `-3`, … suffixes for additional
  files in the same submission.

## Environment variables

| Variable                      | Description                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The **entire** service account key JSON, as a single string.                              |
| `MASTER_FOLDER_ID`            | The Drive folder id of the master folder (the one that contains the `Active` subfolder).  |

See [`.env.example`](./.env.example) for the format.

## Service account auth model

This app authenticates to Google Drive with a **service account** (not an OAuth
user flow), so it runs unattended with no sign-in. The setup:

1. In the Google Cloud Console, create a project and **enable the Google Drive
   API**.
2. Create a **service account** and generate a **JSON key**.
3. Share the master Drive folder (and everything under it) with the service
   account's email address (`...@...iam.gserviceaccount.com`), granting at least
   **Editor** access so it can list folders and upload files.
4. Put the full JSON key into `GOOGLE_SERVICE_ACCOUNT_JSON` and the master
   folder id into `MASTER_FOLDER_ID`.

The app requests the `https://www.googleapis.com/auth/drive` scope and creates
the Drive client once, reusing it across requests. The folder id comes from the
share link: `https://drive.google.com/drive/folders/<THIS_IS_THE_ID>`.

> The folder must be owned/shared in a way the service account can see. If you
> use a Shared Drive, add the service account as a member of that Shared Drive.

## Local development

```bash
# 1. install dependencies
npm install

# 2. create your env file
cp .env.example .env.local
# then edit .env.local and fill in both variables

# 3. run the dev server
npm run dev
```

Open http://localhost:3000.

To produce a production build:

```bash
npm run build
npm start
```

## Deploying to Railway

Railway detects Next.js automatically — **no config files are needed**.

1. Create a new Railway project from this GitHub repo.
2. In the Railway dashboard, go to your service's **Variables** and add:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — paste the **entire** service account JSON
     contents as one string.
   - `MASTER_FOLDER_ID` — the master folder id.
3. Railway installs dependencies, runs `next build`, and starts the app.
4. Railway **auto-deploys on every push to `main`**.

## Project structure

```
app/
  page.tsx                 # the form (client component)
  layout.tsx
  globals.css
  api/
    properties/route.ts    # GET — list property folders
    submit/route.ts        # POST — upload photos
lib/
  drive.ts                 # Drive client + helpers
.env.example
README.md
```
