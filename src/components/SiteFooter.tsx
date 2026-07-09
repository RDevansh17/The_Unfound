import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-ink/10 bg-ink text-mist">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-8">
        <div>
          <p className="font-display text-2xl font-bold tracking-tight">The Unfound</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-mist/65">
            The growth OS for teams who want search visibility, AI citations, and
            qualified pipeline in one system.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-bright">
            Product
          </p>
          <ul className="mt-4 space-y-2 text-sm text-mist/75">
            <li>
              <Link href="/#product" className="hover:text-mist">
                SEO Engine
              </Link>
            </li>
            <li>
              <Link href="/#geo" className="hover:text-mist">
                GEO & AI GEO
              </Link>
            </li>
            <li>
              <Link href="/dashboard/leads" className="hover:text-mist">
                Lead Generation
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="hover:text-mist">
                Pricing
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-bright">
            Company
          </p>
          <ul className="mt-4 space-y-2 text-sm text-mist/75">
            <li>
              <Link href="/dashboard" className="hover:text-mist">
                Open app
              </Link>
            </li>
            <li>
              <a href="mailto:hello@theunfound.io" className="hover:text-mist">
                hello@theunfound.io
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-mist/45 md:flex-row md:items-center md:justify-between md:px-8">
          <p>© {new Date().getFullYear()} The Unfound. All rights reserved.</p>
          <p>Built for SEO · GEO · AI GEO · Lead Gen</p>
        </div>
      </div>
    </footer>
  );
}
