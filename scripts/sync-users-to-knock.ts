import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../app/db/schema";
import { notifierFromEnv } from "../app/lib/notifications.server";
import { syncAllUsers } from "../app/lib/users.server";
import { loadDotEnv } from "./load-env";

// ─── One-off backfill ───
// Gives every existing user a Knock profile and, if they have none yet, the
// default preferences. Safe to re-run: sync never overwrites preferences.
// Uses whichever Knock environment KNOCK_SECRET_API_KEY in .env belongs to
// (Development for local work); without a key it only logs.
//
// Run: npm run knock:sync-users

loadDotEnv();

const db = drizzle(new Database("data.db"), { schema });

if (!process.env.KNOCK_SECRET_API_KEY) {
  console.warn("KNOCK_SECRET_API_KEY is not set; nothing will reach Knock.");
}

const { synced, failed } = await syncAllUsers(db, notifierFromEnv());
console.log(`Synced ${synced} users to Knock (${failed} failed).`);
process.exitCode = failed > 0 ? 1 : 0;
