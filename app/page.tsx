"use client";

import { useEffect, useRef, useState } from "react";

const JOB_TYPES = [
  "General",
  "Demo",
  "Framing",
  "Electrical",
  "Plumbing",
  "Drywall",
  "Finishes",
  "Exterior",
  "Other",
] as const;

type Status = "idle" | "loading" | "uploading" | "success" | "error";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function Home() {
  const [properties, setProperties] = useState<string[]>([]);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);

  const [property, setProperty] = useState("");
  const [jobType, setJobType] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [successInfo, setSuccessInfo] = useState<{
    count: number;
    property: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/properties");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data.error || "Unable to load properties.");
        }
        setProperties(data.properties ?? []);
        setStatus("idle");
      } catch (err) {
        if (cancelled) return;
        setPropertiesError(
          err instanceof Error ? err.message : "Unable to load properties."
        );
        setStatus("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const canSubmit =
    !!property && !!jobType && files.length > 0 && status !== "uploading";

  function resetForm() {
    setProperty("");
    setJobType("");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setStatus("uploading");
    setError(null);
    setProgress(0);

    const formData = new FormData();
    formData.append("property", property);
    formData.append("jobType", jobType);
    files.forEach((f) => formData.append("files", f));

    try {
      const result = await new Promise<{ count: number; property: string }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/submit");

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              setProgress(Math.round((event.loaded / event.total) * 100));
            }
          };

          xhr.onload = () => {
            let data: { error?: string; count?: number; property?: string } = {};
            try {
              data = JSON.parse(xhr.responseText);
            } catch {
              // fall through to generic error below
            }
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({ count: data.count ?? 0, property: data.property ?? "" });
            } else {
              reject(new Error(data.error || "Upload failed. Please try again."));
            }
          };

          xhr.onerror = () =>
            reject(new Error("Network error. Please try again."));

          xhr.send(formData);
        }
      );

      setSuccessInfo(result);
      setStatus("success");
      resetForm();
      setTimeout(() => {
        setStatus("idle");
        setSuccessInfo(null);
        setProgress(0);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setStatus("error");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Photo Submission</h1>
      <p className="mb-6 text-sm text-gray-500">
        Select a property and job type, then add your photos.
      </p>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setError(null);
              if (status === "error") setStatus("idle");
            }}
            className="shrink-0 font-bold leading-none text-red-600 hover:text-red-800"
          >
            ✕
          </button>
        </div>
      )}

      {propertiesError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {propertiesError}
        </div>
      )}

      {status === "success" && successInfo ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-green-200 bg-green-50 px-4 py-10 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-base font-medium text-green-800">
            Uploaded {successInfo.count}{" "}
            {successInfo.count === 1 ? "photo" : "photos"} to{" "}
            {successInfo.property}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label
              htmlFor="property"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Property
            </label>
            <select
              id="property"
              value={property}
              onChange={(e) => setProperty(e.target.value)}
              disabled={status === "uploading"}
              className="h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50"
            >
              <option value="" disabled>
                {properties.length === 0 && !propertiesError
                  ? "Loading properties..."
                  : "Select a property"}
              </option>
              {properties.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="jobType"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Job Type
            </label>
            <select
              id="jobType"
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              disabled={status === "uploading"}
              className="h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50"
            >
              <option value="" disabled>
                Select a job type
              </option>
              {JOB_TYPES.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="photos"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Photos
            </label>
            <input
              ref={fileInputRef}
              id="photos"
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              disabled={status === "uploading"}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-600 file:mr-3 file:min-h-[40px] file:rounded-md file:border-0 file:bg-gray-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white disabled:opacity-50"
            />
            {files.length > 0 && (
              <p className="mt-1.5 text-sm text-gray-500">
                {files.length} {files.length === 1 ? "file" : "files"} selected ·{" "}
                {formatBytes(totalSize)}
              </p>
            )}
          </div>

          {status === "uploading" && (
            <div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-gray-900 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1.5 text-center text-sm text-gray-500">
                {progress}%
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-gray-900 px-4 text-base font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {status === "uploading" ? (
              <span className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
                Uploading...
              </span>
            ) : (
              "Submit"
            )}
          </button>
        </form>
      )}
    </main>
  );
}
