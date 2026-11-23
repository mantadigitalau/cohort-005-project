import { useEffect, useRef, useState } from "react";
import { useNavigate, useRevalidator } from "react-router";
import { Popover } from "radix-ui";
import {
  Bell,
  GraduationCap,
  MessageSquare,
  Receipt,
  UsersRound,
} from "lucide-react";
import { cn, formatRelativeTime } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import {
  describeNotification,
  emptyFeed,
  type FeedCategory,
  type FeedCounts,
  type FeedNotification,
  type NotificationFeedPort,
  type NotificationFeedSession,
} from "~/lib/notification-feed";
import { knockFeed } from "~/lib/knock-feed.client";

// ─── The bell and the Notification Feed popover ───
// Only ever talks to the client feed port. Without a feed session (no Knock
// keys) it uses the empty feed, so the popover says "You're all caught up."

type FeedState = {
  notifications: FeedNotification[];
  counts: FeedCounts;
};

const EMPTY_STATE: FeedState = {
  notifications: [],
  counts: { unseen: 0, unread: 0 },
};

/** Newest first, one entry per Notification. */
function merge(
  current: FeedNotification[],
  incoming: FeedNotification[]
): FeedNotification[] {
  const byId = new Map(current.map((n) => [n.id, n]));
  for (const notification of incoming) byId.set(notification.id, notification);
  return [...byId.values()].sort((a, b) =>
    b.insertedAt.localeCompare(a.insertedAt)
  );
}

function useNotificationFeed(session: NotificationFeedSession | null) {
  const [state, setState] = useState<FeedState>(EMPTY_STATE);
  const portRef = useRef<NotificationFeedPort>(emptyFeed());
  const revalidator = useRevalidator();

  // The newest token the layout loader has signed, for refreshing the feed's
  // session before its token expires.
  const latestToken = useRef(session?.userToken);
  latestToken.current = session?.userToken;
  const revalidate = useRef(revalidator.revalidate);
  revalidate.current = revalidator.revalidate;

  const userId = session?.userId ?? null;
  const publicApiKey = session?.publicApiKey ?? null;
  const feedChannelId = session?.feedChannelId ?? null;

  useEffect(() => {
    // A new user (DevUI switch) gets a fresh port and a fresh, empty state.
    // The old port is disposed below, and its late replies are ignored, so
    // nothing from one user's feed reaches another's.
    let active = true;
    setState(EMPTY_STATE);

    const port =
      session && userId
        ? knockFeed(session, {
            refreshToken: async () => {
              await revalidate.current();
              return latestToken.current;
            },
          })
        : emptyFeed();
    portRef.current = port;

    port
      .listNotifications()
      .then((page) => {
        if (!active) return;
        setState({ notifications: page.notifications, counts: page.counts });
      })
      .catch((error) => {
        console.error("[notifications] loading the feed failed:", error);
      });

    const unsubscribe = port.subscribe((update) => {
      if (!active) return;
      setState((current) => ({
        notifications: merge(current.notifications, update.notifications),
        counts: update.counts,
      }));
    });

    return () => {
      active = false;
      unsubscribe();
      port.dispose();
      portRef.current = emptyFeed();
    };
    // The session object is new on every loader run; only a different user,
    // key or channel needs a new port.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, publicApiKey, feedChannelId]);

  function markAllSeen() {
    if (state.counts.unseen === 0) return;
    setState((current) => ({
      notifications: current.notifications.map((n) => ({ ...n, seen: true })),
      counts: { ...current.counts, unseen: 0 },
    }));
    portRef.current.markAllSeen().catch((error) => {
      console.error("[notifications] marking all seen failed:", error);
    });
  }

  function markRead(notificationId: string) {
    setState((current) => ({
      notifications: current.notifications.map((n) =>
        n.id === notificationId ? { ...n, seen: true, read: true } : n
      ),
      counts: {
        ...current.counts,
        unread: Math.max(0, current.counts.unread - 1),
      },
    }));
    portRef.current.markRead(notificationId).catch((error) => {
      console.error("[notifications] marking read failed:", error);
    });
  }

  return { ...state, markAllSeen, markRead };
}

const CATEGORY_ICONS: Record<FeedCategory, React.ReactNode> = {
  discussion: <MessageSquare />,
  refund: <Receipt />,
  team: <UsersRound />,
  enrollment: <GraduationCap />,
};

function badgeLabel(unseen: number) {
  return unseen > 9 ? "9+" : String(unseen);
}

export function NotificationBell({
  session,
}: {
  session: NotificationFeedSession | null;
}) {
  const feed = useNotificationFeed(session);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  function onOpenChange(next: boolean) {
    setOpen(next);
    // Opening clears the badge: every Notification is now seen, loaded or
    // not. Seen isn't read.
    if (next) feed.markAllSeen();
  }

  function openNotification(notification: FeedNotification) {
    if (!notification.read) feed.markRead(notification.id);
    const { href } = describeNotification(notification);
    if (!href) return;
    setOpen(false);
    navigate(href);
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title="Notifications"
          aria-label={
            feed.counts.unseen > 0
              ? `Notifications, ${feed.counts.unseen} new`
              : "Notifications"
          }
          className="relative rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Bell className="size-4" />
          {feed.counts.unseen > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white tabular-nums">
              {badgeLabel(feed.counts.unseen)}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={12}
          collisionPadding={8}
          className="z-50 flex max-h-[calc(100vh-1rem)] w-[26rem] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
        >
          <div className="flex items-center gap-2 bg-muted/60 px-4 py-3">
            <Bell className="size-4" />
            <h2 className="font-semibold">Notifications</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {feed.notifications.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                You're all caught up.
              </p>
            ) : (
              <ul>
                {feed.notifications.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    onOpen={openNotification}
                  />
                ))}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: FeedNotification;
  onOpen: (notification: FeedNotification) => void;
}) {
  const row = describeNotification(notification);
  const { actor, read } = notification;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(notification)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent"
      >
        <span className="relative shrink-0">
          {actor ? (
            <UserAvatar
              name={actor.name}
              avatarUrl={actor.avatarUrl}
              className={cn("size-9", read && "opacity-60")}
            />
          ) : (
            // Notifications from Cadence itself have no actor.
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground",
                read && "opacity-60"
              )}
            >
              C
            </span>
          )}
          {row.category && (
            <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-popover text-muted-foreground ring-1 ring-border [&_svg]:size-2.5">
              {CATEGORY_ICONS[row.category]}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn("block truncate text-sm", !read && "font-semibold")}
          >
            {row.title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {row.snippet ? `${row.snippet} · ` : ""}
            <span suppressHydrationWarning>
              {formatRelativeTime(notification.insertedAt)}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}
