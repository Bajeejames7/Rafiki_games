import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Express } from "express";
import { logger } from "./logger";

/**
 * Abel's Ambassadors Football interschool app, served from this same Render
 * service at /interschool so it needs no service of its own.
 *
 * It is a separate app with its own database: the prebuilt bundle in
 * ../interschool (built from github.com/Bajeejames7/interschool_app with
 * `node scripts/build-embed.mjs <path to this folder>`). It is only mounted
 * when INTERSCHOOL_DATABASE_URL is set, and if it fails to start, Rafiki Games
 * starts anyway — the school's app never depends on it.
 */
export async function mountInterschool(app: Express): Promise<void> {
  const databaseUrl = process.env["INTERSCHOOL_DATABASE_URL"];
  if (!databaseUrl) {
    logger.info("Interschool app not mounted (INTERSCHOOL_DATABASE_URL not set)");
    return;
  }
  // dist/index.mjs at runtime; the bundle sits next to dist.
  const bundle = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../interschool/server.mjs");
  if (!existsSync(bundle)) {
    logger.warn({ bundle }, "Interschool bundle missing; not mounted");
    return;
  }
  try {
    const { createInterschool } = await import(pathToFileURL(bundle).href);
    // Never hold up Rafiki's start for more than 30s (e.g. its database asleep).
    const interschool = await Promise.race([
      createInterschool({
        databaseUrl,
        creatorEmail: process.env["INTERSCHOOL_CREATOR_EMAIL"] ?? "",
        tokenSecret: process.env["INTERSCHOOL_TOKEN_SECRET"],
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out after 30s")), 30000).unref()),
    ]);
    app.use("/interschool", interschool);
    logger.info("Interschool app mounted at /interschool");
  } catch (err) {
    logger.error({ err }, "Interschool app failed to start; Rafiki Games continues without it");
  }
}
