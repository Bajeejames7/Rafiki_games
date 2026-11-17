import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Express } from "express";
import { logger } from "./logger";

/**
 * Kienyeji Farm Fresh orders API (website orders + the farm's staff app), served
 * from this same Render service at /kienyeji so it needs no service of its own.
 *
 * It is a separate app with its own database: the prebuilt bundle in
 * ../kienyeji (built from C:\Users\James\Projects\kienyeji_orders\server with
 * `npm run embed`). It is only mounted when KIENYEJI_DATABASE_URL is set, and if
 * it fails to start, Rafiki Games starts anyway — the school's app never depends on it.
 *
 * Returns a keep-alive ping for its database (or null when not mounted).
 */
export async function mountKienyeji(app: Express): Promise<(() => Promise<unknown>) | null> {
  const databaseUrl = process.env["KIENYEJI_DATABASE_URL"];
  if (!databaseUrl) {
    logger.info("Kienyeji orders not mounted (KIENYEJI_DATABASE_URL not set)");
    return null;
  }
  const bundle = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../kienyeji/server.mjs");
  if (!existsSync(bundle)) {
    logger.warn({ bundle }, "Kienyeji bundle missing; not mounted");
    return null;
  }
  // The route is mounted straight away and forwards to the app once it has
  // started. If its database is unreachable at boot, it answers 503 and the
  // start is retried every minute instead of staying down until a redeploy.
  let started: { app: Express; ping: () => Promise<unknown> } | null = null;
  app.use("/kienyeji", (req, res, next) => {
    if (started) return started.app(req, res, next);
    res.status(503).json({ error: "Kienyeji orders is starting; try again in a minute" });
  });

  const tryStart = async () => {
    try {
      const { createKienyejiServer } = await import(pathToFileURL(bundle).href);
      // Never hold up Rafiki's start for more than 30s (e.g. its database asleep).
      started = await Promise.race([
        createKienyejiServer({
          databaseUrl,
          tokenSecret: process.env["KIENYEJI_TOKEN_SECRET"],
          fcmServiceAccount: process.env["KIENYEJI_FCM_SERVICE_ACCOUNT"],
          log: (msg: string, extra?: unknown) => logger.info({ extra }, `kienyeji: ${msg}`),
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out after 30s")), 30000).unref()),
      ]);
      logger.info("Kienyeji orders mounted at /kienyeji");
      return true;
    } catch (err) {
      console.error("[Kienyeji] failed to start; retrying every 60s:", err);
      return false;
    }
  };

  if (!(await tryStart())) {
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      if (await tryStart()) clearInterval(timer);
      busy = false;
    }, 60 * 1000);
  }
  return () => (started ? started.ping() : Promise.resolve());
}
