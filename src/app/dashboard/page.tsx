import Link from "next/link";
import { FunnelChart } from "@/components/dashboard/FunnelChart";
import { StatCards } from "@/components/dashboard/StatCards";
import { geoCitations, leads, opportunities } from "@/lib/demo-data";

export default function DashboardPage() {
  const topLeads = leads.slice(0, 4);
  const topCitations = geoCitations.filter((c) => c.mentioned).slice(0, 4);
  const topOps = opportunities.slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
            Overview
          </h1>
          <p className="mt-1 text-sm text-muted md:text-base">
            SEO, GEO, AI GEO, and lead velocity in one glance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/dashboard/seo" className="rounded-md border border-ink/10 bg-white px-3 py-2 text-ink-soft hover:border-teal">
            SEO module
          </Link>
          <Link href="/dashboard/geo" className="rounded-md border border-ink/10 bg-white px-3 py-2 text-ink-soft hover:border-teal">
            GEO / AI GEO
          </Link>
          <Link href="/dashboard/leads" className="rounded-md border border-ink/10 bg-white px-3 py-2 text-ink-soft hover:border-teal">
            Lead inbox
          </Link>
        </div>
      </div>

      <StatCards />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <FunnelChart />

        <div className="panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-ink">Priority opportunities</h2>
            <Link href="/dashboard/opportunities" className="text-sm font-medium text-teal hover:underline">
              View all
            </Link>
          </div>
          <ul className="mt-5 space-y-4">
            {topOps.map((op) => (
              <li key={op.title} className="border-t border-ink/8 pt-4 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-mist px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal">
                    {op.channel}
                  </span>
                  <span className="text-[11px] font-medium text-muted">
                    {op.impact} impact · {op.effort} effort
                  </span>
                </div>
                <p className="mt-2 font-medium text-ink">{op.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{op.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink/8 px-5 py-4">
            <h2 className="font-display text-xl font-bold text-ink">Hot leads</h2>
            <Link href="/dashboard/leads" className="text-sm font-medium text-teal hover:underline">
              Open inbox
            </Link>
          </div>
          <div className="divide-y divide-ink/8">
            {topLeads.map((lead) => (
              <div key={lead.id} className="table-row flex items-start justify-between gap-4 px-5 py-4">
                <div>
                  <p className="font-medium text-ink">{lead.company}</p>
                  <p className="text-sm text-muted">
                    {lead.contact} · {lead.title}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">{lead.intent}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg font-bold text-ink">{lead.score}</p>
                  <p className="text-xs text-muted">{lead.source}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink/8 px-5 py-4">
            <h2 className="font-display text-xl font-bold text-ink">AI GEO citations</h2>
            <Link href="/dashboard/geo" className="text-sm font-medium text-teal hover:underline">
              Track engines
            </Link>
          </div>
          <div className="divide-y divide-ink/8">
            {topCitations.map((citation) => (
              <div key={`${citation.engine}-${citation.query}`} className="table-row px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-ink">{citation.engine}</p>
                  <span className="text-xs font-semibold text-teal">{citation.share}% share</span>
                </div>
                <p className="mt-1 text-sm text-muted">{citation.query}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-ink-soft">
                  {citation.sentiment} · checked {citation.lastChecked}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
