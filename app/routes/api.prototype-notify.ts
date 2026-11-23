// PROTOTYPE — sends a random catalogue Notification to the current DevUI user,
// so you can watch a new one arrive in the Notification Feed.
import type { Route } from "./+types/api.prototype-notify";
import { getCurrentUserId } from "~/lib/session";
import {
  getKnockClient,
  knockUserId,
  PROTOTYPE_WORKFLOW_KEY,
} from "~/lib/knock-prototype.server";
import { SAMPLE_NOTIFICATIONS } from "~/lib/notification-catalogue-prototype";

export async function action({ request }: Route.ActionArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw new Response("Select a user from the DevUI panel", { status: 401 });

  const sample =
    SAMPLE_NOTIFICATIONS[Math.floor(Math.random() * SAMPLE_NOTIFICATIONS.length)];
  try {
    await getKnockClient().workflows.trigger(PROTOTYPE_WORKFLOW_KEY, {
      recipients: [knockUserId(userId)],
      actor: sample.actorId ? knockUserId(sample.actorId) : undefined,
      data: { ...sample.data },
    });
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}
