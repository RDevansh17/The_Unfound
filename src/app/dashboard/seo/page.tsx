import { StatCards } from "@/components/dashboard/StatCards";
import { keywords } from "@/lib/demo-data";

const seoStats = [
  { label: "Keywords tracked", value: "1,284", delta: "+86", tone: "up" as const },
  { label: "Avg. position", value: "14.2", delta: "+1.8", tone: "up" as const },
  { label: "Pages in top 10", value: "96", delta: "+11", tone: "up" as const },
  { label: "Content briefs ready", value: "18", delta: "+5", tone: "up" as const },
];

export default function SeoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
          SEO Engine
        </h1>
        <p className="mt-1 text-sm text-muted md:text-base">
          Rankings, clusters, and briefs that turn search demand into traffic.
        </p>
      </div>

      <StatCards stats={seoStats} />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-5 py-4">
            <div>
              <h2 className="font-display text-xl font-bold text-ink">Keyword radar</h2>
              <p className="text-sm text-muted">Live positions across your priority cluster</p>
            </div>
            <button type="button" className="btn-ink !px-3.5 !py-2 text-sm">
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-mist/60 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Keyword</th>
                  <th className="px-3 py-3 font-semibold">Vol</th>
                  <th className="px-3 py-3 font-semibold">Pos</th>
                  <th className="px-3 py-3 font-semibold">Δ</th>
                  <th className="px-3 py-3 font-semibold">Diff</th>
                  <th className="px-3 py-3 font-semibold">Intent</th>
                  <th className="px-5 py-3 font-semibold">URL</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((row) => (
                  <tr key={row.keyword} className="table-row border-t border-ink/10">
                    <td className="px-5 py-3.5 font-medium text-ink">{row.keyword}</td>
                    <td className="px-3 py-3.5 text-muted">{row.volume.toLocaleString()}</td>
                    <td className="px-3 py-3.5 font-semibold text-ink">{row.position}</td>
                    <td
                      className={`px-3 py-3.5 font-medium ${
                        row.change >= 0 ? "text-teal" : "text-danger"
                      }`}
                    >
                      {row.change >= 0 ? `+${row.change}` : row.change}
                    </td>
                    <td className="px-3 py-3.5 text-muted">{row.difficulty}</td>
                    <td className="px-3 py-3.5 text-ink-soft">{row.intent}</td>
                    <td className="px-5 py-3.5 text-muted">{row.url}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel p-5">
            <h2 className="font-display text-xl font-bold text-ink">Cluster health</h2>
            <ul className="mt-5 space-y-4">
              {[
                { name: "AI GEO education", score: 82 },
                { name: "Agency tooling", score: 71 },
                { name: "Lead capture", score: 64 },
                { name: "Local services", score: 58 },
              ].map((cluster) => (
                <li key={cluster.name}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium text-ink-soft">{cluster.name}</span>
                    <span className="text-muted">{cluster.score}/100</span>
                  </div>
                  <div className="metric-bar">
                    <span style={{ width: `${cluster.score}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-5">
            <h2 className="font-display text-xl font-bold text-ink">Next briefs</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {[
                "Answer engine optimization checklist (refresh)",
                "Compare GEO platforms for B2B SaaS",
                "Local pack playbook for multi-location brands",
              ].map((brief) => (
                <li
                  key={brief}
                  className="flex items-start gap-2 border-t border-ink/10 pt-3 first:border-0 first:pt-0"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-deep" />
                  <span className="text-ink-soft">{brief}</span>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-primary mt-5 w-full !py-2.5 text-sm">
              Generate brief pack
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
