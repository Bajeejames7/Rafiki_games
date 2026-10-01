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
  try {
    const { createKienyejiServer } = await import(pathToFileURL(bundle).href);
    // Never hold up Rafiki's start for more than 30s (e.g. its database asleep).
    const kienyeji = await Promise.race([
      createKienyejiServer({
        databaseUrl,
        tokenSecret: process.env["KIENYEJI_TOKEN_SECRET"],
        fcmServiceAccount: process.env["KIENYEJI_FCM_SERVICE_ACCOUNT"],
        log: (msg: string, extra?: unknown) => logger.info({ extra }, `kienyeji: ${msg}`),
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out after 30s")), 30000).unref()),
    ]);
    app.use("/kienyeji", kienyeji.app);
    logger.info("Kienyeji orders mounted at /kienyeji");
    return kienyeji.ping;
  } catch (err) {
    logger.error({ err }, "Kienyeji orders failed to start; Rafiki Games continues without it");
    return null;
  }
}
