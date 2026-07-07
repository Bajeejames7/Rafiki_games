import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "./lib/migrate";

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

// Run migrations before starting server
runMigrations()
  .then(() => {
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
      
      // Schedule daily reset at midnight (00:00 UTC)
      scheduleNightlyReset();
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to run migrations");
    process.exit(1);
  });

function scheduleNightlyReset() {
  const checkAndReset = async () => {
    const now = new Date();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    
    // Run at midnight UTC (00:00-00:05)
    if (hours === 0 && minutes < 5) {
      const today = now.toISOString().split('T')[0];
      const lastResetKey = 'last_daily_reset';
      
      // Check if already reset today (in-memory tracking)
      if ((global as any)[lastResetKey] !== today) {
        logger.info({ date: today }, "Running automatic daily reset");
        
        try {
          const secret = process.env["CRON_SECRET"] || "dev-secret-change-in-prod";
          const publicUrl = process.env["RENDER_EXTERNAL_URL"] || "http://localhost:3000";
          
          const res = await fetch(`${publicUrl}/api/scores/reset-daily`, {
            method: "POST",
            headers: { "x-cron-secret": secret },
          });
          
          if (res.ok) {
            (global as any)[lastResetKey] = today;
            logger.info({ date: today }, "Daily reset completed successfully");
          } else {
            logger.error({ status: res.status }, "Daily reset failed");
          }
        } catch (err) {
          logger.error({ err }, "Error during daily reset");
        }
      }
    }
  };
  
  // Check every minute
  setInterval(checkAndReset, 60 * 1000);
  logger.info("Daily reset scheduler started (triggers at 00:00 UTC)");
}
