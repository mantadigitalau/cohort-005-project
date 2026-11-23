// PROTOTYPE — Notification Feed (wayfinder ticket #20). Throwaway.
// Talks to Knock's headless feed API straight from the browser, authenticated
// with the public API key + a server-signed user token (enhanced security).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { NotificationData } from "~/lib/notification-catalogue-prototype";

export interface FeedAuth {
  knockUserId: string;
  userToken: string;
  publicApiKey: string;
  feedChannelId: string;
}

export interface FeedItem {
  id: string;
  inserted_at: string;
  seen_at: string | null;
  read_at: string | null;
  archived_at: string | null;
  data: NotificationData;
}

interface FeedMeta {
  unseen_count: number;
  unread_count: number;
  total_count: number;
}

type MessageStatus = "seen" | "read" | "unread" | "archived" | "unarchived";

interface FeedState {
  items: FeedItem[];
  archived: FeedItem[];
  meta: FeedMeta;
  loading: boolean;
  error: string | null;
  /** Items that arrived since the last poll; variants can toast them. */
  lastArrivals: FeedItem[];
  setStatus: (ids: string[], status: MessageStatus) => Promise<void>;
  refresh: () => Promise<void>;
}

const EMPTY_META: FeedMeta = { unseen_count: 0, unread_count: 0, total_count: 0 };
const FeedContext = createContext<FeedState | null>(null);

const KNOCK_API = "https://api.knock.app/v1";
const POLL_MS = 8000;

export function KnockFeedProvider({
  auth,
  children,
}: {
  auth: FeedAuth | null;
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [archived, setArchived] = useState<FeedItem[]>([]);
  const [meta, setMeta] = useState<FeedMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastArrivals, setLastArrivals] = useState<FeedItem[]>([]);
  const knownIds = useRef<Set<string> | null>(null);

  const headers = auth
    ? {
        Authorization: `Bearer ${auth.publicApiKey}`,
        "X-Knock-User-Token": auth.userToken,
        "Content-Type": "application/json",
      }
    : undefined;

  const refresh = useCallback(async () => {
    if (!auth) return;
    const base = `${KNOCK_API}/users/${auth.knockUserId}/feeds/${auth.feedChannelId}`;
    try {
      const [live, arch] = await Promise.all([
        fetch(`${base}?page_size=50`, { headers }).then((r) => r.json()),
        fetch(`${base}?page_size=50&archived=only`, { headers }).then((r) =>
          r.json()
        ),
      ]);
      if (!live.entries) throw new Error(live.message ?? "Feed request failed");
      const entries = live.entries as FeedItem[];
      if (knownIds.current) {
        setLastArrivals(entries.filter((e) => !knownIds.current!.has(e.id)));
      }
      knownIds.current = new Set(entries.map((e) => e.id));
      setItems(entries);
      setArchived((arch.entries ?? []) as FeedItem[]);
      setMeta(live.meta ?? EMPTY_META);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.knockUserId, auth?.userToken]);

  useEffect(() => {
    knownIds.current = null;
    setLoading(true);
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const setStatus = useCallback(
    async (ids: string[], status: MessageStatus) => {
      if (!auth || ids.length === 0) return;
      const now = new Date().toISOString();
      // optimistic
      setItems((prev) =>
        prev.map((i) =>
          !ids.includes(i.id)
            ? i
            : {
                ...i,
                seen_at: status === "seen" || status === "read" ? (i.seen_at ?? now) : i.seen_at,
                read_at: status === "read" ? now : status === "unread" ? null : i.read_at,
                archived_at: status === "archived" ? now : i.archived_at,
              }
        )
      );
      await fetch(`${KNOCK_API}/messages/batch/${status}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message_ids: ids }),
      });
      await refresh();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auth?.userToken, refresh]
  );

  return (
    <FeedContext.Provider
      value={{ items, archived, meta, loading, error, lastArrivals, setStatus, refresh }}
    >
      {children}
    </FeedContext.Provider>
  );
}

export function useFeed() {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("useFeed must be used inside KnockFeedProvider");
  return ctx;
}

/** Renders the `**bold**` markers in a Notification body. */
export function NotificationBody({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold">
            {p}
          </strong>
        ) : (
          p
        )
      )}
    </>
  );
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
