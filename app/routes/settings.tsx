import { useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import type { Route } from "./+types/settings";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { UserRole, RefundStatus, users } from "~/db/schema";
import { AlertTriangle } from "lucide-react";
import { data, isRouteErrorResponse, Link } from "react-router";
import { db } from "~/db";
import { eq } from "drizzle-orm";
import { formatPrice } from "~/lib/utils";
import { listRefundRequestsForBuyer } from "~/lib/refunds.server";
import { Switch } from "~/components/ui/switch";
import {
  DEFAULT_PREFERENCES,
  notifierFromEnv,
  type PreferenceCategory,
} from "~/lib/notifications.server";
import {
  getPreferenceSwitches,
  type PreferenceSwitch,
} from "~/lib/notification-preferences.server";
import { updateProfile } from "~/lib/users.server";

const settingsSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty."),
  bio: z.string().trim().optional(),
});

const PREFERENCE_CATEGORIES = Object.keys(DEFAULT_PREFERENCES) as [
  PreferenceCategory,
  ...PreferenceCategory[],
];

/** One switch flipped in the Notifications card. */
const setPreferenceSchema = z.object({
  intent: z.literal("set-preference"),
  category: z.enum(PREFERENCE_CATEGORIES),
  enabled: z.enum(["on", "off"]).transform((value) => value === "on"),
});

const PREFERENCE_LABELS: Record<
  PreferenceCategory,
  { label: string; description: string }
> = {
  "refund-request-updates": {
    label: "Refund Request updates",
    description:
      "When a Refund Request you raised is received, approved or declined.",
  },
  "open-refund-requests": {
    label: "Open Refund Requests",
    description: "When a buyer raises a Refund Request for you to decide.",
  },
  "seat-claims": {
    label: "Seat claims",
    description: "When someone claims a Seat on your Team Licence.",
  },
  enrollments: {
    label: "Enrollments",
    description: "When a Student enrolls on one of your courses.",
  },
  "discussion-questions": {
    label: "Discussion Questions",
    description: "When someone asks a question on one of your lessons.",
  },
  "discussion-replies": {
    label: "Discussion Replies",
    description: "When someone replies to your comment.",
  },
};

const PREFERENCE_NOT_SAVED = "Your Notification setting could not be saved.";

export function meta() {
  return [
    { title: "Settings — Cadence" },
    { name: "description", content: "Edit your profile details" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to edit your details.", {
      status: 401,
    });
  }

  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!currentUser) {
    throw data("User not found.", { status: 404 });
  }

  const refundRequests = listRefundRequestsForBuyer(db, currentUserId);

  // The rest of /settings still works if the Notification vendor is down.
  let notificationSwitches: PreferenceSwitch[] | null = null;
  try {
    notificationSwitches = await getPreferenceSwitches(
      db,
      notifierFromEnv(),
      currentUserId
    );
  } catch (error) {
    console.error("[notifications] loading preferences failed:", error);
  }

  return {
    notificationSwitches,
    user: {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      bio: currentUser.bio,
      role: currentUser.role,
    },
    refundRequests,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in.", { status: 401 });
  }

  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();
  if (!currentUser) {
    throw data("User not found.", { status: 404 });
  }

  const formData = await request.formData();

  if (formData.get("intent") === "set-preference") {
    const preference = parseFormData(formData, setPreferenceSchema);
    if (!preference.success) {
      throw data("That setting could not be saved.", { status: 400 });
    }
    try {
      await notifierFromEnv().setPreference(
        currentUser.id,
        preference.data.category,
        "feed",
        preference.data.enabled
      );
    } catch (error) {
      console.error("[notifications] saving a preference failed:", error);
      throw data(PREFERENCE_NOT_SAVED, { status: 502 });
    }
    return { preferenceSaved: true };
  }

  const parsed = parseFormData(formData, settingsSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  const { name, bio } = parsed.data;

  await updateProfile(db, notifierFromEnv(), currentUser.id, name, bio || null);
  return { success: true };
}

/**
 * The server action throws when a Notification switch can't be saved, like
 * any action that can't continue. A switch is optimistic, though, so one
 * failed save must not swap /settings for the ErrorBoundary: this catches
 * that one failure and hands it to the switch, which falls back to the saved
 * value and shows a toast. Every other submission passes straight through.
 */
export async function clientAction({
  request,
  serverAction,
}: Route.ClientActionArgs) {
  const formData = await request.clone().formData();
  if (formData.get("intent") !== "set-preference") return serverAction();
  try {
    return await serverAction();
  } catch (error) {
    if (!isRouteErrorResponse(error)) throw error;
    return {
      preferenceError:
        typeof error.data === "string" ? error.data : PREFERENCE_NOT_SAVED,
    };
  }
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { user, refundRequests, notificationSwitches } = loaderData;
  const openCount = refundRequests.filter(
    (refundRequest) => refundRequest.status === RefundStatus.Open
  ).length;
  const fetcher = useFetcher();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      toast.success("Profile updated successfully.");
    }
    if (fetcher.state === "idle" && fetcher.data?.errors) {
      const firstError = Object.values(fetcher.data.errors)[0] as string | undefined;
      if (firstError) toast.error(firstError);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Settings</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Update your profile details
        </p>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <h2 className="text-lg font-semibold">Profile</h2>
        </CardHeader>
        <CardContent>
          <fetcher.Form method="post" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                ref={nameInputRef}
                id="name"
                name="name"
                type="text"
                defaultValue={user.name}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={user.email}
                disabled
                className="text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed.
              </p>
            </div>
            {user.role === UserRole.Instructor && (
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  name="bio"
                  rows={4}
                  defaultValue={user.bio ?? ""}
                  placeholder="Tell students about yourself..."
                />
                <p className="text-xs text-muted-foreground">
                  Your bio is shown on your course pages.
                </p>
              </div>
            )}
            <Button
              type="submit"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle" ? "Saving..." : "Save Changes"}
            </Button>
          </fetcher.Form>
        </CardContent>
      </Card>

      <Card className="mt-8 max-w-md">
        <CardHeader>
          <h2 className="text-lg font-semibold">Notifications</h2>
          <p className="text-sm text-muted-foreground">
            Choose what shows up in your Notification feed.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {notificationSwitches ? (
            notificationSwitches.map((preferenceSwitch) => (
              <PreferenceSwitchRow
                key={preferenceSwitch.category}
                preferenceSwitch={preferenceSwitch}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Notification settings are unavailable right now. Try again
              later.
            </p>
          )}
        </CardContent>
      </Card>

      {refundRequests.length > 0 && (
        <Card id="refund-requests" className="mt-8 max-w-md scroll-mt-8">
          <CardHeader>
            <h2 className="text-lg font-semibold">Refund Requests</h2>
            {openCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {openCount === 1
                  ? "One refund request is waiting on us."
                  : `${openCount} refund requests are waiting on us.`}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {refundRequests.map((refundRequest) => (
              <div key={refundRequest.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    to={`/courses/${refundRequest.courseSlug}`}
                    className="font-medium hover:underline"
                  >
                    {refundRequest.courseTitle}
                  </Link>
                  <RefundStatusBadge status={refundRequest.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatPrice(refundRequest.amountPaid)} · raised{" "}
                  {new Date(refundRequest.requestedAt).toLocaleDateString()}
                  {refundRequest.resolvedAt && (
                    <>
                      {" "}
                      · decided{" "}
                      {new Date(refundRequest.resolvedAt).toLocaleDateString()}
                    </>
                  )}
                </p>
                <p className="mt-2 text-sm">{refundRequest.reason}</p>
                {refundRequest.decisionNote && (
                  <p className="mt-2 rounded-md bg-muted p-2 text-sm">
                    <span className="font-medium">Our note: </span>
                    {refundRequest.decisionNote}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * One Notification switch. It flips as soon as it is clicked and saves
 * straight away. If the save fails, the value falls back to what the server
 * holds and a toast says so.
 */
function PreferenceSwitchRow({
  preferenceSwitch,
}: {
  preferenceSwitch: PreferenceSwitch;
}) {
  const fetcher = useFetcher<typeof clientAction>();
  const { category } = preferenceSwitch;
  const { label, description } = PREFERENCE_LABELS[category];
  const id = `preference-${category}`;

  // While saving (and reloading after) show the value just submitted. Once
  // idle, show what the server holds: the new value after a successful save,
  // the old one after a failed save.
  const submitted = fetcher.formData?.get("enabled");
  const checked =
    typeof submitted === "string"
      ? submitted === "on"
      : preferenceSwitch.enabled;

  const error =
    fetcher.state === "idle" && fetcher.data && "preferenceError" in fetcher.data
      ? fetcher.data.preferenceError
      : null;

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, fetcher.data]);

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(enabled) => {
          fetcher.submit(
            {
              intent: "set-preference",
              category,
              enabled: enabled ? "on" : "off",
            },
            { method: "post" }
          );
        }}
      />
    </div>
  );
}

const REFUND_STATUS_BADGES: Record<
  RefundStatus,
  { label: string; className: string }
> = {
  [RefundStatus.Open]: {
    label: "Open",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  },
  [RefundStatus.Approved]: {
    label: "Approved",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  [RefundStatus.Declined]: {
    label: "Declined",
    className: "bg-muted text-muted-foreground",
  },
};

function RefundStatusBadge({ status }: { status: RefundStatus }) {
  const badge = REFUND_STATUS_BADGES[status];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 404) {
      title = "User not found";
      message =
        typeof error.data === "string" ? error.data : "User not found.";
    } else {
      title = `Error ${error.status}`;
      message =
        typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
