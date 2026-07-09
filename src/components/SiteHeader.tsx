import Link from "next/link";

export function SiteHeader({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const isDark = tone === "dark";

  return (
    <header
      className={`absolute inset-x-0 top-0 z-30 ${
        isDark ? "text-mist" : "text-ink"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8">
        <Link href="/" className="group flex items-center gap-2.5">
          <span
            className={`relative grid h-8 w-8 place-items-center overflow-hidden rounded-md ${
              isDark ? "bg-signal text-ink" : "bg-ink text-signal"
            }`}
            aria-hidden
          >
            <span className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_30%_20%,white,transparent_55%)]" />
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
          <span className="font-display text-lg font-bold tracking-tight md:text-xl">
            The Unfound
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
          <Link
            href="/#product"
            className={isDark ? "text-mist/80 hover:text-mist" : "text-muted hover:text-ink"}
          >
            Product
          </Link>
          <Link
            href="/#geo"
            className={isDark ? "text-mist/80 hover:text-mist" : "text-muted hover:text-ink"}
          >
            GEO
          </Link>
          <Link
            href="/pricing"
            className={isDark ? "text-mist/80 hover:text-mist" : "text-muted hover:text-ink"}
          >
            Pricing
          </Link>
          <Link
            href="/dashboard"
            className={isDark ? "text-mist/80 hover:text-mist" : "text-muted hover:text-ink"}
          >
            App
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className={`hidden text-sm font-medium sm:inline ${
              isDark ? "text-mist/80 hover:text-mist" : "text-muted hover:text-ink"
            }`}
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className={isDark ? "btn-primary !py-2.5 !px-4 text-sm" : "btn-ink !py-2.5 !px-4 text-sm"}
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
