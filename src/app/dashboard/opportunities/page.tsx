import { opportunities } from "@/lib/demo-data";

export default function OpportunitiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
          Opportunities
        </h1>
        <p className="mt-1 text-sm text-muted md:text-base">
          Ranked actions across SEO, GEO, AI GEO, and lead capture.
        </p>
      </div>

      <div className="grid gap-4">
        {opportunities.map((op, index) => (
          <article key={op.title} className="panel p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-sm font-bold text-teal">
                    #{index + 1}
                  </span>
                  <span className="rounded bg-mist px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal">
                    {op.channel}
                  </span>
                  <span className="text-xs font-medium text-muted">
                    {op.impact} impact · {op.effort} effort
                  </span>
                </div>
                <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink">
                  {op.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted md:text-base">
                  {op.detail}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" className="btn-primary !px-4 !py-2.5 text-sm">
                  Start playbook
                </button>
                <button
                  type="button"
                  className="rounded-md border border-ink/15 bg-white px-4 py-2.5 text-sm font-medium text-ink-soft hover:border-teal"
                >
                  Snooze
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
