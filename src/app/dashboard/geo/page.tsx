import { StatCards } from "@/components/dashboard/StatCards";
import { geoCitations } from "@/lib/demo-data";

const geoStats = [
  { label: "Answer engines", value: "6", delta: "tracked", tone: "up" as const },
  { label: "Brand citations", value: "126", delta: "+31", tone: "up" as const },
  { label: "Share of answer", value: "22%", delta: "+4 pts", tone: "up" as const },
  { label: "Local GEO score", value: "71", delta: "+6", tone: "up" as const },
];

export default function GeoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
          GEO & AI GEO
        </h1>
        <p className="mt-1 text-sm text-muted md:text-base">
          Monitor local visibility and citations across generative answer engines.
        </p>
      </div>

      <StatCards stats={geoStats} />

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
        <div className="panel overflow-hidden">
          <div className="border-b border-ink/10 px-5 py-4">
            <h2 className="font-display text-xl font-bold text-ink">Citation monitor</h2>
            <p className="text-sm text-muted">
              Where AI engines mention you for high-intent prompts
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-mist/60 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Engine</th>
                  <th className="px-3 py-3 font-semibold">Prompt</th>
                  <th className="px-3 py-3 font-semibold">Cited</th>
                  <th className="px-3 py-3 font-semibold">Sentiment</th>
                  <th className="px-3 py-3 font-semibold">Share</th>
                  <th className="px-5 py-3 font-semibold">Checked</th>
                </tr>
              </thead>
              <tbody>
                {geoCitations.map((row) => (
                  <tr
                    key={`${row.engine}-${row.query}`}
                    className="table-row border-t border-ink/10"
                  >
                    <td className="px-5 py-3.5 font-medium text-ink">{row.engine}</td>
                    <td className="max-w-xs px-3 py-3.5 text-muted">{row.query}</td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`rounded px-2 py-1 text-xs font-semibold ${
                          row.mentioned
                            ? "bg-signal/35 text-ink"
                            : "bg-danger/15 text-danger"
                        }`}
                      >
                        {row.mentioned ? "Yes" : "Gap"}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 capitalize text-ink-soft">{row.sentiment}</td>
                    <td className="px-3 py-3.5 font-semibold text-ink">{row.share}%</td>
                    <td className="px-5 py-3.5 text-muted">{row.lastChecked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel relative overflow-hidden p-5">
            <div className="animate-scan absolute inset-0 opacity-40" />
            <h2 className="relative font-display text-xl font-bold text-ink">
              Prompt panel
            </h2>
            <p className="relative mt-1 text-sm text-muted">
              Weekly AI GEO prompts your brand should win
            </p>
            <ul className="relative mt-5 space-y-3">
              {[
                "best platforms for AI GEO",
                "how to track ChatGPT brand mentions",
                "SEO and lead generation software for startups",
                "generative engine optimization strategy",
              ].map((prompt) => (
                <li
                  key={prompt}
                  className="rounded-md border border-ink/10 bg-white/70 px-3 py-2.5 text-sm text-ink-soft"
                >
                  “{prompt}”
                </li>
              ))}
            </ul>
            <button type="button" className="btn-primary relative mt-5 w-full !py-2.5 text-sm">
              Run prompt sweep
            </button>
          </div>

          <div className="panel p-5">
            <h2 className="font-display text-xl font-bold text-ink">Local GEO snapshot</h2>
            <div className="mt-5 space-y-4">
              {[
                { city: "Austin", pack: 4, reviews: 128, score: 78 },
                { city: "Miami", pack: 7, reviews: 86, score: 64 },
                { city: "Chicago", pack: 9, reviews: 102, score: 59 },
              ].map((loc) => (
                <div key={loc.city} className="border-t border-ink/10 pt-4 first:border-0 first:pt-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-ink">{loc.city}</p>
                    <p className="font-display text-lg font-bold text-ink">{loc.score}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Local pack #{loc.pack} · {loc.reviews} review entities
                  </p>
                  <div className="metric-bar mt-2">
                    <span style={{ width: `${loc.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
