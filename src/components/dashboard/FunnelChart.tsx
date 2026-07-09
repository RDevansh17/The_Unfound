import { funnel } from "@/lib/demo-data";

export function FunnelChart() {
  const max = funnel[0]?.value ?? 1;

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-ink">Demand funnel</h2>
          <p className="mt-1 text-sm text-muted">Search + AI GEO → qualified pipeline</p>
        </div>
      </div>
      <div className="mt-6 space-y-4">
        {funnel.map((stage) => (
          <div key={stage.stage}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-ink-soft">{stage.stage}</span>
              <span className="text-muted">{stage.value.toLocaleString()}</span>
            </div>
            <div className="metric-bar">
              <span style={{ width: `${Math.max(8, (stage.value / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
