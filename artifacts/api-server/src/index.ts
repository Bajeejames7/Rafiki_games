import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Self-ping every 10 minutes to prevent Render free tier from spinning down.
  // Only runs when a public URL is configured (i.e. in production on Render).
  const publicUrl = process.env["RENDER_EXTERNAL_URL"];
  if (publicUrl) {
    const pingUrl = `${publicUrl}/api/healthz`;
    const TEN_MINUTES = 10 * 60 * 1000;

    setInterval(async () => {
      try {
        const res = await fetch(pingUrl, { signal: AbortSignal.timeout(10000) });
        logger.info({ status: res.status }, "Self-ping OK");
      } catch (err) {
        logger.warn({ err }, "Self-ping failed");
      }
    }, TEN_MINUTES);

    logger.info({ pingUrl }, "Self-ping scheduled every 10 minutes");
  }
});
