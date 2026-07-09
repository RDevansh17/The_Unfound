"use client";

import { useMemo, useState, useTransition } from "react";
import { StatCards } from "@/components/dashboard/StatCards";
import { leads, type LeadStatus } from "@/lib/demo-data";

const leadStats = [
  { label: "New leads", value: "24", delta: "+7", tone: "up" as const },
  { label: "Qualified", value: "87", delta: "+19", tone: "up" as const },
  { label: "Avg. intent score", value: "84", delta: "+3", tone: "up" as const },
  { label: "AI-sourced", value: "31%", delta: "+9 pts", tone: "up" as const },
];

const filters: Array<"all" | LeadStatus> = [
  "all",
  "new",
  "qualified",
  "contacted",
  "won",
];

const statusStyles: Record<LeadStatus, string> = {
  new: "bg-amber/20 text-ink",
  qualified: "bg-signal/35 text-ink",
  contacted: "bg-teal/15 text-teal",
  won: "bg-ink text-mist",
};

export default function LeadsPage() {
  const [filter, setFilter] = useState<"all" | LeadStatus>("all");
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((lead) => {
      const statusOk = filter === "all" || lead.status === filter;
      const queryOk =
        !q ||
        lead.company.toLowerCase().includes(q) ||
        lead.contact.toLowerCase().includes(q) ||
        lead.intent.toLowerCase().includes(q) ||
        lead.source.toLowerCase().includes(q);
      return statusOk && queryOk;
    });
  }, [filter, query]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
          Lead Generation
        </h1>
        <p className="mt-1 text-sm text-muted md:text-base">
          Intent-scored buyers from SEO, GEO, AI GEO, and outbound — ready to route.
        </p>
      </div>

      <StatCards stats={leadStats} />

      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-ink/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-ink">Lead inbox</h2>
            <p className="text-sm text-muted">
              {isPending ? "Updating…" : `${filtered.length} leads`}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={query}
              onChange={(e) => {
                const value = e.target.value;
                startTransition(() => setQuery(value));
              }}
              placeholder="Search company, contact, intent…"
              className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none ring-teal/30 placeholder:text-muted focus:ring-2 sm:w-64"
            />
            <div className="flex flex-wrap gap-1.5">
              {filters.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => startTransition(() => setFilter(item))}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold capitalize transition-colors ${
                    filter === item
                      ? "bg-ink text-mist"
                      : "bg-mist text-ink-soft hover:bg-fog"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-mist/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Company</th>
                <th className="px-3 py-3 font-semibold">Contact</th>
                <th className="px-3 py-3 font-semibold">Source</th>
                <th className="px-3 py-3 font-semibold">Intent</th>
                <th className="px-3 py-3 font-semibold">Score</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr key={lead.id} className="table-row border-t border-ink/10">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-ink">{lead.company}</p>
                    <p className="text-xs text-muted">
                      {lead.id} · {lead.location}
                    </p>
                  </td>
                  <td className="px-3 py-3.5">
                    <p className="text-ink-soft">{lead.contact}</p>
                    <p className="text-xs text-muted">{lead.title}</p>
                  </td>
                  <td className="px-3 py-3.5">
                    <span className="rounded bg-mist px-2 py-1 text-xs font-semibold text-teal">
                      {lead.source}
                    </span>
                  </td>
                  <td className="max-w-xs px-3 py-3.5 text-muted">{lead.intent}</td>
                  <td className="px-3 py-3.5 font-display text-base font-bold text-ink">
                    {lead.score}
                  </td>
                  <td className="px-3 py-3.5">
                    <span
                      className={`rounded px-2 py-1 text-xs font-semibold capitalize ${statusStyles[lead.status]}`}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-muted">{lead.lastSeen}</td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted">
                    No leads match this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {[
          {
            title: "Capture",
            copy: "Attach intent forms and audits to ranking pages and AI-cited assets.",
          },
          {
            title: "Score",
            copy: "Blend firmographics, source, and engagement into a single lead score.",
          },
          {
            title: "Route",
            copy: "Push qualified leads to Slack or CRM with the query that brought them.",
          },
        ].map((item) => (
          <div key={item.title} className="panel p-5">
            <h3 className="font-display text-lg font-bold text-ink">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.copy}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
