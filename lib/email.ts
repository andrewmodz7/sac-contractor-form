import sgMail from "@sendgrid/mail";

const NOTIFY_TO_EMAIL = "kdanna@shoreacrescapital.com";

/**
 * Send a single notification email summarizing one contractor upload batch.
 *
 * This is a side effect of a successful submit: it must never throw and never
 * affect the request outcome. The caller still wraps it in a try/catch as a
 * second line of defense. There are no retries — a failed send is logged and
 * dropped on purpose (the upload landing in Drive is the job that matters).
 */
export async function sendUploadNotification(params: {
  property: string;
  jobType: string;
  count: number;
  /** Eastern time timestamp already computed by the route for filenames. */
  timestamp: string;
}): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.NOTIFY_FROM_EMAIL;

  if (!apiKey || !from) {
    console.error(
      "Upload notification skipped: SENDGRID_API_KEY or NOTIFY_FROM_EMAIL is not set."
    );
    return;
  }

  sgMail.setApiKey(apiKey);

  const { property, jobType, count, timestamp } = params;

  await sgMail.send({
    to: NOTIFY_TO_EMAIL,
    from,
    subject: `New contractor upload: ${property} - ${jobType}`,
    text: `${count} photo(s) uploaded to ${property} (${jobType}) at ${timestamp} ET`,
  });
}
