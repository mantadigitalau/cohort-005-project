// PROTOTYPE — three radically different Notification Feeds (wayfinder ticket #20).
//   A  Bell popover   — bell in the sidebar header, badge = UNSEEN count,
//                       opening marks everything seen, click marks read.
//   B  Inbox page     — "Notifications" nav item, pill = UNREAD count, a full
//                       page with filters, day groups and per-row actions.
//   C  Drawer + toasts — slide-over grouped by area, archive = done, new
//                       arrivals toast; button shows a dot, no number.
import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellDot,
  Check,
  CheckCheck,
  Inbox,
  Mail,
  MailOpen,
  MessageSquare,
  MessageSquareReply,
  Receipt,
  ReceiptText,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import type { NotificationKind } from "~/lib/notification-catalogue-prototype";
import { NotificationBody, timeAgo, useFeed, type FeedItem } from "./knock-feed";

export const VARIANTS = ["A", "B", "C"] as const;
export type Variant = (typeof VARIANTS)[number];
export const VARIANT_NAMES: Record<Variant, string> = {
  A: "Bell popover",
  B: "Inbox page",
  C: "Drawer + toasts",
};

const KIND_ICON: Record<NotificationKind, React.ComponentType<{ className?: string }>> = {
  refund_requested: Receipt,
  refund_approved: ReceiptText,
  refund_declined: ReceiptText,
  seat_claimed: UserPlus,
  new_question: MessageSquare,
  comment_reply: MessageSquareReply,
};

function KindIcon({ kind, className }: { kind: NotificationKind; className?: string }) {
  const Icon = KIND_ICON[kind] ?? Bell;
  return <Icon className={className} />;
}

function useOpenNotification(onDone?: () => void) {
  const { setStatus } = useFeed();
  const navigate = useNavigate();
  return (item: FeedItem) => {
    if (!item.read_at) setStatus([item.id], "read");
    onDone?.();
    navigate(item.data.url);
  };
}

function FeedProblem() {
  const { error, loading } = useFeed();
  if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="p-4 text-sm text-destructive">Knock: {error}</p>;
  return null;
}

/* ───────────────────────────── A: Bell popover ───────────────────────────── */

export function BellPopover() {
  const { items, meta, setStatus, loading, error } = useFeed();
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const openItem = useOpenNotification(() => setOpen(false));

  // Opening the popover = you've seen them. Badge clears, unread dots stay.
  useEffect(() => {
    if (!open) return;
    const unseen = items.filter((i) => !i.seen_at).map((i) => i.id);
    if (unseen.length) setStatus(unseen, "seen");
    function onDown(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shown = unreadOnly ? items.filter((i) => !i.read_at) : items;

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        aria-label={`Notifications, ${meta.unseen_count} new`}
      >
        <Bell className="size-5" />
        {meta.unseen_count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {meta.unseen_count > 9 ? "9+" : meta.unseen_count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-52 top-2 z-50 flex max-h-[80vh] w-96 flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-semibold">Notifications</h2>
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={unreadOnly}
                  onChange={(e) => setUnreadOnly(e.target.checked)}
                />
                Unread only
              </label>
              <button
                className="text-primary hover:underline disabled:opacity-40"
                disabled={meta.unread_count === 0}
                onClick={() =>
                  setStatus(items.filter((i) => !i.read_at).map((i) => i.id), "read")
                }
              >
                Mark all read
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {(loading || error) && <FeedProblem />}
            {!loading && !error && shown.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {unreadOnly ? "No unread Notifications" : "No Notifications yet"}
              </p>
            )}
            {shown.map((item) => (
              <button
                key={item.id}
                onClick={() => openItem(item)}
                className={cn(
                  "flex w-full gap-3 border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-accent",
                  !item.read_at && "bg-primary/5"
                )}
              >
                <KindIcon kind={item.data.kind} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className={cn(!item.read_at && "font-medium")}>
                    <NotificationBody text={item.data.body} />
                  </p>
                  {item.data.detail && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {item.data.detail}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">{timeAgo(item.inserted_at)}</p>
                </div>
                {!item.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── B: Inbox page ─────────────────────────────── */

export function InboxNavItem() {
  const { meta } = useFeed();
  return (
    <NavLink
      to="/notifications"
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Inbox className="size-4" />
      Notifications
      {meta.unread_count > 0 && (
        <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
          {meta.unread_count}
        </span>
      )}
    </NavLink>
  );
}

type InboxFilter = "all" | "unread" | "archived";

function dayGroup(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return "Earlier";
}

export function InboxPage() {
  const { items, archived, meta, setStatus, loading, error } = useFeed();
  const [filter, setFilter] = useState<InboxFilter>("all");
  const openItem = useOpenNotification();

  // Landing on the page = seen.
  useEffect(() => {
    const unseen = items.filter((i) => !i.seen_at).map((i) => i.id);
    if (unseen.length) setStatus(unseen, "seen");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const list =
    filter === "archived" ? archived : filter === "unread" ? items.filter((i) => !i.read_at) : items;
  const groups = new Map<string, FeedItem[]>();
  for (const item of list) {
    const g = dayGroup(item.inserted_at);
    groups.set(g, [...(groups.get(g) ?? []), item]);
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {meta.unread_count} unread · {meta.total_count} in your feed
          </p>
        </div>
        <button
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-40"
          disabled={meta.unread_count === 0}
          onClick={() => setStatus(items.filter((i) => !i.read_at).map((i) => i.id), "read")}
        >
          <CheckCheck className="size-4" /> Mark all as read
        </button>
      </div>

      <div className="mb-4 flex gap-1 border-b">
        {(["all", "unread", "archived"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm capitalize",
              filter === f ? "border-primary font-medium" : "border-transparent text-muted-foreground"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {(loading || error) && <FeedProblem />}
      {!loading && !error && list.length === 0 && (
        <div className="py-16 text-center text-muted-foreground">
          <Inbox className="mx-auto mb-2 size-8" />
          Nothing here.
        </div>
      )}

      {[...groups].map(([group, groupItems]) => (
        <section key={group} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group}
          </h2>
          <ul className="divide-y rounded-lg border">
            {groupItems.map((item) => (
              <li key={item.id} className="group flex items-start gap-4 p-4 hover:bg-accent/50">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  <KindIcon kind={item.data.kind} className="size-4" />
                </div>
                <button onClick={() => openItem(item)} className="min-w-0 flex-1 text-left">
                  <p className={cn("text-sm", !item.read_at && "font-semibold")}>
                    <NotificationBody text={item.data.body} />
                  </p>
                  {item.data.detail && (
                    <p className="mt-1 border-l-2 pl-3 text-sm text-muted-foreground">{item.data.detail}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(item.inserted_at).toLocaleString()}
                  </p>
                </button>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {filter !== "archived" &&
                    (item.read_at ? (
                      <IconAction label="Mark unread" onClick={() => setStatus([item.id], "unread")}>
                        <Mail className="size-4" />
                      </IconAction>
                    ) : (
                      <IconAction label="Mark read" onClick={() => setStatus([item.id], "read")}>
                        <MailOpen className="size-4" />
                      </IconAction>
                    ))}
                  {filter === "archived" ? (
                    <IconAction label="Unarchive" onClick={() => setStatus([item.id], "unarchived")}>
                      <ArchiveRestore className="size-4" />
                    </IconAction>
                  ) : (
                    <IconAction label="Archive" onClick={() => setStatus([item.id], "archived")}>
                      <Archive className="size-4" />
                    </IconAction>
                  )}
                </div>
                {!item.read_at && filter !== "archived" && (
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-primary group-hover:hidden" />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── C: Drawer + toasts ──────────────────────────── */

const AREAS: { title: string; kinds: NotificationKind[] }[] = [
  { title: "Refunds", kinds: ["refund_requested", "refund_approved", "refund_declined"] },
  { title: "Team", kinds: ["seat_claimed"] },
  { title: "Discussion", kinds: ["new_question", "comment_reply"] },
];

export function ActivityDrawer() {
  const { items, setStatus, lastArrivals, loading, error } = useFeed();
  const [open, setOpen] = useState(false);
  const openItem = useOpenNotification(() => setOpen(false));
  const hasUnseen = items.some((i) => !i.seen_at);

  // New arrivals pop a toast instead of growing a number.
  useEffect(() => {
    for (const item of lastArrivals) {
      toast(<span><NotificationBody text={item.data.body} /></span>, {
        icon: <KindIcon kind={item.data.kind} className="size-4" />,
        action: { label: "Open", onClick: () => openItem(item) },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastArrivals]);

  useEffect(() => {
    if (!open) return;
    const unseen = items.filter((i) => !i.seen_at).map((i) => i.id);
    if (unseen.length) setStatus(unseen, "seen");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 top-3 z-40 flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm shadow-sm hover:bg-accent"
      >
        {hasUnseen ? <BellDot className="size-4 text-red-600" /> : <Bell className="size-4" />}
        Activity
      </button>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/30 transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setOpen(false)}
      />
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-screen w-[420px] flex-col border-l bg-background shadow-2xl transition-transform",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">Activity</h2>
            <p className="text-xs text-muted-foreground">
              Dismiss what you've dealt with. {items.length} to go.
            </p>
          </div>
          <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-accent" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {(loading || error) && <FeedProblem />}
          {!loading && !error && items.length === 0 && (
            <div className="py-16 text-center text-muted-foreground">
              <Check className="mx-auto mb-2 size-8" />
              All caught up.
            </div>
          )}
          {AREAS.map((area) => {
            const areaItems = items.filter((i) => area.kinds.includes(i.data.kind));
            if (areaItems.length === 0) return null;
            return (
              <section key={area.title} className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {area.title} <span className="text-muted-foreground">{areaItems.length}</span>
                  </h3>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setStatus(areaItems.map((i) => i.id), "archived")}
                  >
                    Dismiss all
                  </button>
                </div>
                <div className="space-y-2">
                  {areaItems.map((item) => (
                    <div
                      key={item.id}
                      className="group relative rounded-lg border bg-card p-3 pr-9 text-sm shadow-sm hover:border-primary/50"
                    >
                      <button onClick={() => openItem(item)} className="block w-full text-left">
                        <NotificationBody text={item.data.body} />
                        {item.data.detail && (
                          <span className="mt-1 block text-xs text-muted-foreground">{item.data.detail}</span>
                        )}
                        <span className="mt-1.5 block text-xs text-muted-foreground">
                          {timeAgo(item.inserted_at)}
                        </span>
                      </button>
                      <button
                        title="Dismiss"
                        onClick={() => setStatus([item.id], "archived")}
                        className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </aside>
    </>
  );
}
