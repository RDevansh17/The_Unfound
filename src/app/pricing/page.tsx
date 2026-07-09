import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { pricingPlans } from "@/lib/demo-data";

export default function PricingPage() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="relative overflow-hidden bg-ink pb-16 pt-28 text-mist">
        <div className="absolute inset-0 opacity-50 [background:radial-gradient(ellipse_at_70%_0%,rgba(46,196,182,0.28),transparent_45%),radial-gradient(ellipse_at_10%_80%,rgba(184,242,74,0.12),transparent_40%)]" />
        <SiteHeader tone="dark" />
        <div className="relative mx-auto max-w-6xl px-5 md:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-bright">
            Pricing
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-4xl font-extrabold tracking-tight md:text-6xl">
            Plans that scale with unfound demand.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-mist/65 md:text-lg">
            Start with visibility. Upgrade when SEO, GEO, AI GEO, and lead routing become
            your growth OS.
          </p>
        </div>
      </div>

      <main className="section-wash flex-1 py-16 md:py-20">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 md:grid-cols-3 md:px-8">
          {pricingPlans.map((plan) => (
            <article
              key={plan.name}
              className={`flex flex-col border p-7 ${
                plan.highlighted
                  ? "border-teal bg-ink text-mist shadow-[0_24px_60px_-30px_rgba(26,143,134,0.65)]"
                  : "border-ink/10 bg-white/70 text-ink"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-bold">{plan.name}</h2>
                {plan.highlighted ? (
                  <span className="bg-signal px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink">
                    Most chosen
                  </span>
                ) : null}
              </div>
              <p
                className={`mt-3 text-sm leading-relaxed ${
                  plan.highlighted ? "text-mist/65" : "text-muted"
                }`}
              >
                {plan.blurb}
              </p>
              <p className="mt-6 font-display text-5xl font-extrabold tracking-tight">
                ${plan.price}
                <span
                  className={`text-base font-medium ${
                    plan.highlighted ? "text-mist/55" : "text-muted"
                  }`}
                >
                  /mo
                </span>
              </p>
              <ul className="mt-8 flex-1 space-y-3 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <span
                      className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                        plan.highlighted ? "bg-signal" : "bg-teal"
                      }`}
                    />
                    <span className={plan.highlighted ? "text-mist/85" : "text-ink-soft"}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href="/dashboard"
                className={`mt-8 ${
                  plan.highlighted ? "btn-primary w-full" : "btn-ink w-full"
                }`}
              >
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>

        <div className="mx-auto mt-16 max-w-6xl px-5 md:px-8">
          <div className="border border-ink/10 bg-white/60 px-6 py-8 md:px-10">
            <h3 className="font-display text-2xl font-bold text-ink">
              Every plan includes
            </h3>
            <div className="mt-6 grid gap-4 text-sm text-muted md:grid-cols-3">
              <p>Shared SEO + GEO + AI GEO workspace</p>
              <p>Lead scoring with source attribution</p>
              <p>Opportunity digests your team can act on</p>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
