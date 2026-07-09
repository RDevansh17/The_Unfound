import { overviewStats } from "@/lib/demo-data";

export function StatCards({
  stats = overviewStats,
}: {
  stats?: typeof overviewStats;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="panel p-5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
            {stat.label}
          </p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="font-display text-3xl font-bold tracking-tight text-ink">
              {stat.value}
            </p>
            <span className="rounded bg-signal/30 px-2 py-1 text-xs font-semibold text-ink-soft">
              {stat.delta}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
