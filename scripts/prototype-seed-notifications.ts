// PROTOTYPE — seeds Knock's Development environment with sample catalogue
// Notifications for the Notification Feed prototype (wayfinder ticket #20).
// Run: npm run prototype:seed-notifications
import Database from "better-sqlite3";
import {
  getKnockClient,
  knockUserId,
  PROTOTYPE_WORKFLOW_KEY,
} from "../app/lib/knock-prototype.server";
import { SAMPLE_NOTIFICATIONS } from "../app/lib/notification-catalogue-prototype";

const sqlite = new Database("data.db", { readonly: true });
const users = sqlite
  .prepare("select id, name, email from users")
  .all() as { id: number; name: string; email: string }[];

const knock = getKnockClient();

// Identify everyone, so every DevUI user has a (possibly empty) feed.
for (const user of users) {
  await knock.users.update(knockUserId(user.id), {
    name: user.name,
    email: user.email,
  });
}
console.log(`Identified ${users.length} users in Knock`);

for (const sample of SAMPLE_NOTIFICATIONS) {
  await knock.workflows.trigger(PROTOTYPE_WORKFLOW_KEY, {
    recipients: sample.recipientIds.map(knockUserId),
    actor: sample.actorId ? knockUserId(sample.actorId) : undefined,
    data: { ...sample.data },
  });
  console.log(`→ ${sample.data.kind} to ${sample.recipientIds.join(", ")}`);
}
console.log("Done. Feeds update within a few seconds.");
