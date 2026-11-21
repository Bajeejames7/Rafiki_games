import path from "node:path";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Express } from "express";
import { logger } from "./logger";

/**
 * Ambassadors Football (the new app: parent hub, offline field mode, M-PESA,
 * Super Admin console), served from this same Render service at /ambassadors
 * so it needs no service of its own.
 *
 * It is a separate app: the prebuilt bundle in ../ambassadors (built from the
 * ambassadors-football project with `node scripts/build-embed.mjs <this folder>`).
 *
 * Database: AMBASSADORS_DATABASE_URL if set; otherwise it shares the
 * interschool database (INTERSCHOOL_DATABASE_URL) but keeps every table in its
 * own Postgres schema, "ambassadors_football", so interschool's tables are never
 * read or changed. If it fails to start, Rafiki Games starts anyway.
 *
 * Optional settings (Render → Environment):
 *   AMBASSADORS_DEMO=0             turn off demo data and the demo sign-in buttons
 *   AMBASSADORS_CREATOR_EMAIL      the Super Admin's email (default: INTERSCHOOL_CREATOR_EMAIL)
 *   AMBASSADORS_MPESA_MODE         mock (default) | sandbox | production, with
 *   AMBASSADORS_MPESA_CONSUMER_KEY / _CONSUMER_SECRET / _SHORTCODE / _PASSKEY
 */
export async function mountAmbassadors(app: Express): Promise<void> {
  const databaseUrl = process.env["AMBASSADORS_DATABASE_URL"] ?? process.env["INTERSCHOOL_DATABASE_URL"];
  if (!databaseUrl) {
    logger.info("Ambassadors Football not mounted (no AMBASSADORS_DATABASE_URL or INTERSCHOOL_DATABASE_URL)");
    return;
  }
  const bundle = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../ambassadors/server.mjs");
  if (!existsSync(bundle)) {
    logger.warn({ bundle }, "Ambassadors Football bundle missing; not mounted");
    return;
  }
  const env = process.env;
  // A stable secret for sign-in tokens, distinct from interschool's.
  const tokenSecret =
    env["AMBASSADORS_TOKEN_SECRET"] ??
    createHash("sha256").update(`ambassadors:${env["INTERSCHOOL_TOKEN_SECRET"] ?? databaseUrl}`).digest("hex");
  const publicBase = (env["AMBASSADORS_PUBLIC_URL"] ?? env["RENDER_EXTERNAL_URL"] ?? "").replace(/\/$/, "");
  try {
    const { createAmbassadors } = await import(pathToFileURL(bundle).href);
    const ambassadors = await Promise.race([
      createAmbassadors({
        databaseUrl,
        dbSchema: env["AMBASSADORS_DATABASE_URL"] ? "" : "ambassadors_football",
        creatorEmail: (env["AMBASSADORS_CREATOR_EMAIL"] ?? env["INTERSCHOOL_CREATOR_EMAIL"] ?? "").trim().toLowerCase(),
        tokenSecret,
        publicUrl: publicBase ? `${publicBase}/ambassadors` : undefined,
        demo: env["AMBASSADORS_DEMO"] !== "0",
        airtableApiKey: env["AMBASSADORS_AIRTABLE_API_KEY"] ?? "",
        mpesa: {
          mode: (env["AMBASSADORS_MPESA_MODE"] as "mock" | "sandbox" | "production" | undefined) ?? "mock",
          consumerKey: env["AMBASSADORS_MPESA_CONSUMER_KEY"] ?? "",
          consumerSecret: env["AMBASSADORS_MPESA_CONSUMER_SECRET"] ?? "",
          shortcode: env["AMBASSADORS_MPESA_SHORTCODE"] ?? "174379",
          passkey: env["AMBASSADORS_MPESA_PASSKEY"] ?? "",
          callbackSecret: createHash("sha256").update(`mpesa:${tokenSecret}`).digest("hex").slice(0, 32),
        },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out after 30s")), 30000).unref()),
    ]);
    app.use("/ambassadors", ambassadors);
    logger.info("Ambassadors Football mounted at /ambassadors");
  } catch (err) {
    logger.error({ err }, "Ambassadors Football failed to start; Rafiki Games continues without it");
  }
}
