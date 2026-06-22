import nodemailer from "nodemailer";

const NOTIFY_TO_EMAIL = "kdanna@shoreacrescapital.com";

/**
 * Send a single notification email summarizing one contractor upload batch.
 *
 * Delivery is over Gmail SMTP using an app password (the same pattern AUGUR and
 * Pulse use). This is a side effect of a successful submit: it must never throw
 * and never affect the request outcome. The caller still wraps it in a
 * try/catch as a second line of defense. There are no retries — a failed send
 * is logged and dropped on purpose (the upload landing in Drive is the job that
 * matters).
 */
export async function sendUploadNotification(params: {
  property: string;
  jobType: string;
  count: number;
  /** Eastern time timestamp already computed by the route for filenames. */
  timestamp: string;
}): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.error(
      "Upload notification skipped: GMAIL_USER or GMAIL_APP_PASSWORD is not set."
    );
    return;
  }

  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  const { property, jobType, count, timestamp } = params;

  await transport.sendMail({
    to: NOTIFY_TO_EMAIL,
    from: user,
    subject: `New contractor upload: ${property} - ${jobType}`,
    text: `${count} photo(s) uploaded to ${property} (${jobType}) at ${timestamp} ET`,
  });
}
