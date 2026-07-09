import Link from "next/link";
import { HeroMap } from "@/components/HeroMap";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const pillars = [
  {
    id: "seo",
    title: "SEO that finds demand early",
    copy: "Track rankings, clusters, and SERP shifts before traffic slips. Turn keyword gaps into briefs your team can ship.",
    points: ["Cluster intelligence", "SERP feature alerts", "Content briefs"],
  },
  {
    id: "geo",
    title: "GEO for local & map visibility",
    copy: "Own the places buyers search nearby. Monitor local packs, review entities, and location pages that convert.",
    points: ["Local pack tracking", "Location page scoring", "Review entity signals"],
  },
  {
    id: "ai-geo",
    title: "AI GEO for answer engines",
    copy: "See when ChatGPT, Perplexity, Gemini, and AI Overviews cite you — or your rivals — and close the gaps.",
    points: ["Citation monitoring", "Prompt panels", "Share-of-answer"],
  },
  {
    id: "leads",
    title: "Lead gen from intent, not noise",
    copy: "Route high-intent visitors and AI-referred buyers into a scored inbox your sales team actually uses.",
    points: ["Intent scoring", "Source attribution", "CRM-ready routing"],
  },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader tone="dark" />

      <main>
        <section className="relative min-h-[100svh] overflow-hidden text-mist">
          <HeroMap />

          <div className="relative mx-auto flex min-h-[100svh] max-w-6xl items-end px-5 pb-20 pt-28 md:items-center md:px-8 md:pb-24">
            <div className="max-w-2xl">
              <p className="animate-rise font-display text-5xl font-extrabold tracking-tight text-mist sm:text-6xl md:text-7xl lg:text-8xl">
                The Unfound
              </p>
              <h1 className="animate-rise-delay-1 mt-5 max-w-xl text-2xl font-medium leading-snug text-mist/90 sm:text-3xl md:text-[2rem]">
                Find the searches, citations, and buyers your competitors still miss.
              </h1>
              <p className="animate-rise-delay-2 mt-5 max-w-lg text-base leading-relaxed text-mist/65 md:text-lg">
                One system for SEO, GEO, AI GEO, and lead generation — so visibility
                turns into pipeline, not vanity charts.
              </p>
              <div className="animate-rise-delay-3 mt-8 flex flex-wrap items-center gap-3">
                <Link href="/dashboard" className="btn-primary">
                  Open the growth OS
                </Link>
                <Link href="/pricing" className="btn-ghost">
                  See pricing
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="product" className="section-wash relative py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-5 md:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal">
                Product
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink md:text-5xl">
                Four engines. One growth loop.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted md:text-lg">
                Stop stitching SEO tools, AI mention trackers, and lead forms together.
                The Unfound connects discovery to demand capture.
              </p>
            </div>

            <div id="geo" className="mt-12 grid gap-10 md:grid-cols-2">
              {pillars.map((pillar, index) => (
                <article
                  key={pillar.id}
                  className="group border-t border-ink/10 pt-6"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
                      {pillar.title}
                    </h3>
                    <span className="font-display text-sm text-teal">0{index + 1}</span>
                  </div>
                  <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
                    {pillar.copy}
                  </p>
                  <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-ink-soft">
                    {pillar.points.map((point) => (
                      <li key={point} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-signal-deep" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-ink py-20 text-mist md:py-28">
          <div className="absolute inset-0 opacity-40 [background:radial-gradient(ellipse_at_20%_30%,rgba(46,196,182,0.25),transparent_45%),radial-gradient(ellipse_at_80%_70%,rgba(184,242,74,0.12),transparent_40%)]" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-[1fr_1.1fr] md:items-center md:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-bright">
                How it works
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-5xl">
                From invisible demand to booked conversations.
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-mist/65">
                Instrument search and answer engines, surface the next best action, then
                route buyers with context sales can use.
              </p>
            </div>

            <ol className="space-y-6">
              {[
                {
                  step: "01",
                  title: "Map the unfound",
                  copy: "Ingest keywords, local entities, and AI prompts that already shape buyer decisions.",
                },
                {
                  step: "02",
                  title: "Close visibility gaps",
                  copy: "Prioritize pages, citations, and GEO assets by impact — not vanity volume.",
                },
                {
                  step: "03",
                  title: "Capture & route leads",
                  copy: "Score intent from organic and AI sources, then push qualified leads into your CRM.",
                },
              ].map((item) => (
                <li
                  key={item.step}
                  className="grid grid-cols-[auto_1fr] gap-4 border-b border-white/10 pb-6"
                >
                  <span className="font-display text-2xl font-bold text-signal">{item.step}</span>
                  <div>
                    <h3 className="font-display text-xl font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-mist/65">{item.copy}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section-wash py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-5 md:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal">
                Proof in the loop
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink md:text-5xl">
                Built for teams who sell what they rank for.
              </h2>
            </div>

            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {[
                {
                  metric: "3.1×",
                  label: "more AI citations in 60 days",
                  detail: "After shipping source-backed GEO briefs from The Unfound.",
                },
                {
                  metric: "41%",
                  label: "lift in qualified demo requests",
                  detail: "When SEO pages and lead magnets share the same intent map.",
                },
                {
                  metric: "12 hrs",
                  label: "saved per week on reporting",
                  detail: "One dashboard for rankings, citations, and pipeline.",
                },
              ].map((stat) => (
                <div key={stat.label} className="border-t border-ink/10 pt-6">
                  <p className="font-display text-5xl font-extrabold tracking-tight text-ink">
                    {stat.metric}
                  </p>
                  <p className="mt-3 text-base font-semibold text-ink-soft">{stat.label}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{stat.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-16 flex flex-col items-start justify-between gap-6 bg-ink px-8 py-10 text-mist md:flex-row md:items-center">
              <div>
                <p className="font-display text-2xl font-bold md:text-3xl">
                  Ready to uncover your next pipeline?
                </p>
                <p className="mt-2 text-sm text-mist/65">
                  Launch a workspace and see SEO, GEO, AI GEO, and leads in one view.
                </p>
              </div>
              <Link href="/dashboard" className="btn-primary shrink-0">
                Start free workspace
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
