import { useEffect, useReducer, useRef, useState } from "react";
import { Link, useNavigate, useRevalidator } from "react-router";
import { Popover } from "radix-ui";
import {
  Bell,
  Check,
  GraduationCap,
  MessageSquare,
  Receipt,
  Settings,
  UsersRound,
} from "lucide-react";
import { cn, formatRelativeTime } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import {
  canLoadOlder,
  describeNotification,
  emptyFeed,
  feedReducer,
  initialFeedView,
  type FeedCategory,
  type FeedNotification,
  type NotificationFeedPort,
  type NotificationFeedSession,
} from "~/lib/notification-feed";
import { knockFeed } from "~/lib/knock-feed.client";

// ─── The bell and the Notification Feed popover ───
// Only ever talks to the client feed port. Without a feed session (no Knock
// keys) it uses the empty feed, so the popover says "You're all caught up."
// What it shows is the pure `feedReducer` in notification-feed.ts.

function useNotificationFeed(session: NotificationFeedSession | null) {
  const [view, dispatch] = useReducer(feedReducer, initialFeedView);
  const portRef = useRef<NotificationFeedPort>(emptyFeed());
  const revalidator = useRevalidator();

  // The newest token the layout loader has signed, for refreshing the feed's
  // session before its token expires.
  const latestToken = useRef(session?.userToken);
  latestToken.current = session?.userToken;
  const revalidate = useRef(revalidator.revalidate);
  revalidate.current = revalidator.revalidate;

  // The latest view, for callbacks that outlive a render (the scroll
  // observer, the port's replies).
  const viewRef = useRef(view);
  viewRef.current = view;
  // Bumped for every port, so a disposed port's late replies are dropped.
  const generation = useRef(0);

  const userId = session?.userId ?? null;
  const publicApiKey = session?.publicApiKey ?? null;
  const feedChannelId = session?.feedChannelId ?? null;

  useEffect(() => {
    // A new user (DevUI switch) gets a fresh port, a fresh socket and a
    // fresh, empty view. The old port is disposed below, closing its socket,
    // and its late replies are ignored, so nothing from one user's feed
    // reaches another's.
    const mine = ++generation.current;
    const active = () => generation.current === mine;
    dispatch({ type: "reset" });

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
        if (active()) dispatch({ type: "first-page", page });
      })
      .catch((error) => {
        if (active()) dispatch({ type: "load-failed" });
        console.error("[notifications] loading the feed failed:", error);
      });

    // Live updates over this user's one socket. No polling: Knock answers
    // quick repeated reads with 429.
    const unsubscribe = port.subscribe((update) => {
      if (active()) dispatch({ type: "live", update });
    });

    return () => {
      generation.current++;
      unsubscribe();
      port.dispose();
      portRef.current = emptyFeed();
    };
    // The session object is new on every loader run; only a different user,
    // key or channel needs a new port.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, publicApiKey, feedChannelId]);

  function loadOlder() {
    const current = viewRef.current;
    if (!canLoadOlder(current)) return;
    // Mark it loading now, before the next render, so a second scroll event
    // can't send a second request.
    viewRef.current = { ...current, loading: true };
    dispatch({ type: "loading-older" });
    const mine = generation.current;
    portRef.current
      .listNotifications({ after: current.nextCursor })
      .then((page) => {
        if (generation.current === mine) dispatch({ type: "older-page", page });
      })
      .catch((error) => {
        if (generation.current === mine) dispatch({ type: "load-failed" });
        console.error("[notifications] loading older failed:", error);
      });
  }

  function markAllSeen() {
    if (viewRef.current.counts.unseen === 0) return;
    dispatch({ type: "all-seen" });
    portRef.current.markAllSeen().catch((error) => {
      console.error("[notifications] marking all seen failed:", error);
    });
  }

  function markRead(notificationId: string) {
    dispatch({ type: "read", notificationId });
    portRef.current.markRead(notificationId).catch((error) => {
      console.error("[notifications] marking read failed:", error);
    });
  }

  function markAllRead() {
    if (viewRef.current.counts.unread === 0) return;
    dispatch({ type: "all-read" });
    // The bulk channel update, so unloaded Notifications are read too.
    portRef.current.markAllRead().catch((error) => {
      console.error("[notifications] marking all read failed:", error);
    });
  }

  return { ...view, loadOlder, markAllSeen, markRead, markAllRead };
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
            <button
              type="button"
              onClick={feed.markAllRead}
              disabled={feed.counts.unread === 0}
              className="ml-auto text-xs font-medium text-primary hover:underline disabled:opacity-40 disabled:hover:no-underline"
            >
              Mark all as read
            </button>
            <Link
              to="/settings"
              title="Notification settings"
              aria-label="Notification settings"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <Settings className="size-4" />
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto">
            {feed.notifications.length === 0 && !feed.loading ? (
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
                    onMarkRead={feed.markRead}
                  />
                ))}
              </ul>
            )}
            <LoadOlder
              onVisible={feed.loadOlder}
              watch={`${feed.nextCursor}:${feed.notifications.length}`}
              status={
                feed.loading
                  ? "loading"
                  : feed.nextCursor === null && feed.notifications.length > 0
                    ? "done"
                    : "idle"
              }
            />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The bottom of the list. Scrolling it into view asks for an older page.
 * The observer is rebuilt whenever `watch` changes (a new page or cursor),
 * so a short page that leaves the sentinel on screen asks again, but a
 * request that changed nothing doesn't loop.
 */
function LoadOlder({
  onVisible,
  watch,
  status,
}: {
  onVisible: () => void;
  watch: string;
  status: "loading" | "done" | "idle";
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const latest = useRef(onVisible);
  latest.current = onVisible;

  useEffect(() => {
    const element = sentinel.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) latest.current();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [watch]);

  return (
    <div
      ref={sentinel}
      className="p-3 text-center text-xs text-muted-foreground"
    >
      {status === "loading" ? "Loading…" : status === "done" ? "That's everything." : null}
    </div>
  );
}

function NotificationRow({
  notification,
  onOpen,
  onMarkRead,
}: {
  notification: FeedNotification;
  onOpen: (notification: FeedNotification) => void;
  onMarkRead: (notificationId: string) => void;
}) {
  const row = describeNotification(notification);
  const { actor, read } = notification;

  return (
    <li className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent">
      <button
        type="button"
        onClick={() => onOpen(notification)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
      {!read && (
        // Marks this one read without navigating; the popover stays open.
        <button
          type="button"
          onClick={() => onMarkRead(notification.id)}
          title="Mark as read"
          aria-label="Mark as read"
          className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-background hover:text-primary"
        >
          <Check className="size-4" />
        </button>
      )}
    </li>
  );
}
