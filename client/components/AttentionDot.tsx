import type { TaskPriority } from "@/hooks/usePendingTasks";

/**
 * The attention marker used along the whole navigation trail
 * (avatar → menú Configuración → pestaña → sección). It is intentionally dumb:
 * every caller reads its state from usePendingTasks so the trail can never
 * disagree with the screen it leads to.
 *
 * A high-priority dot is never dismissible — only the Dashboard modal can be
 * snoozed — so this renders purely from the live task state.
 */

const COLOR: Record<TaskPriority, { dot: string; ping: string }> = {
  high: { dot: "bg-red-500", ping: "bg-red-400" },
  medium: { dot: "bg-amber-500", ping: "bg-amber-400" },
  low: { dot: "bg-sky-500", ping: "bg-sky-400" },
};

export default function AttentionDot({
  priority = "high",
  count,
  floating = false,
  className = "",
  label = "Tenés acciones pendientes",
}: {
  priority?: TaskPriority | null;
  /** When > 1 renders a numbered badge instead of a plain dot. */
  count?: number;
  /** Absolutely positioned over the top-right corner of a relative parent. */
  floating?: boolean;
  className?: string;
  label?: string;
}) {
  if (!priority) return null;
  if (typeof count === "number" && count <= 0) return null;

  const color = COLOR[priority];
  const showCount = typeof count === "number" && count > 1;
  const position = floating ? "absolute -top-0.5 -right-0.5" : "relative inline-flex";

  return (
    <span
      className={`${position} flex-shrink-0 ${className}`}
      role="status"
      aria-label={label}
      title={label}
    >
      {/* Only the blocking level animates, so the pulse keeps meaning something. */}
      {priority === "high" && (
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${color.ping} motion-reduce:hidden`}
          aria-hidden="true"
        />
      )}
      {showCount ? (
        <span
          className={`relative inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full text-[0.625rem] font-bold text-white ring-2 ring-white dark:ring-slate-800 ${color.dot}`}
        >
          {count > 9 ? "9+" : count}
        </span>
      ) : (
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-800 ${color.dot}`}
        />
      )}
    </span>
  );
}
