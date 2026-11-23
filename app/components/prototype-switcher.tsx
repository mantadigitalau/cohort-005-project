// PROTOTYPE — floating variant switcher for UI prototypes. Throwaway.
// The variant lives in `?variant=`; it's also remembered in localStorage so it
// survives clicking around the app (sidebar links drop the search param).
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STORAGE_KEY = "prototype-variant";

export function usePrototypeVariant<K extends string>(variants: readonly K[]): K {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("variant") as K | null;

  useEffect(() => {
    if (fromUrl && variants.includes(fromUrl)) {
      try {
        localStorage.setItem(STORAGE_KEY, fromUrl);
      } catch {}
      return;
    }
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {}
    if (stored && variants.includes(stored as K)) {
      setParams(
        (p) => {
          p.set("variant", stored!);
          return p;
        },
        { replace: true, preventScrollReset: true }
      );
    }
  }, [fromUrl, variants, setParams]);

  return fromUrl && variants.includes(fromUrl) ? fromUrl : variants[0];
}

export function PrototypeSwitcher<K extends string>({
  variants,
  current,
  names,
  extra,
}: {
  variants: readonly K[];
  current: K;
  names: Record<K, string>;
  extra?: React.ReactNode;
}) {
  const [, setParams] = useSearchParams();

  function go(delta: number) {
    const i = variants.indexOf(current);
    const next = variants[(i + delta + variants.length) % variants.length];
    setParams(
      (p) => {
        p.set("variant", next);
        return p;
      },
      { replace: true, preventScrollReset: true }
    );
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]") !== null)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900 px-2 py-1.5 text-sm text-white shadow-xl ring-2 ring-fuchsia-500">
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/15" aria-label="Previous variant">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-48 px-2 text-center font-medium">
        {current} <span className="text-white/60">({names[current]})</span>
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/15" aria-label="Next variant">
        <ChevronRight className="size-4" />
      </button>
      {extra}
    </div>
  );
}
