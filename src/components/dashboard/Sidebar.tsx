"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/seo", label: "SEO" },
  { href: "/dashboard/geo", label: "GEO & AI GEO" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/opportunities", label: "Opportunities" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-full flex-col border-b border-ink/10 bg-ink text-mist md:min-h-screen md:w-64 md:border-b-0 md:border-r md:border-white/10">
      <div className="flex items-center justify-between px-5 py-5 md:block">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-signal text-ink" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 11.5L6.2 4.5L9.1 9.2L11.2 6.4L14 11.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12.2" cy="3.4" r="1.3" fill="currentColor" />
            </svg>
          </span>
          <span className="font-display text-lg font-bold tracking-tight">The Unfound</span>
        </Link>
        <p className="mt-4 hidden text-xs text-mist/45 md:block">Growth OS · Demo workspace</p>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:px-3 md:pb-0 md:pt-2">
        {nav.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/10 text-signal"
                  : "text-mist/70 hover:bg-white/5 hover:text-mist"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto hidden border-t border-white/10 p-4 md:block">
        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-teal-bright">Orbit plan</p>
          <p className="mt-1 text-sm text-mist/80">126 AI citations tracked</p>
          <Link href="/pricing" className="mt-3 inline-block text-sm font-medium text-signal hover:underline">
            Upgrade workspace
          </Link>
        </div>
      </div>
    </aside>
  );
}
