import type { Metadata } from "next";
import { Sora, Syne } from "next/font/google";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "The Unfound — SEO, GEO & AI Lead Engine",
  description:
    "Discover demand Google and AI engines already surface. The Unfound unifies SEO, GEO, AI GEO, and lead generation into one growth system.",
  openGraph: {
    title: "The Unfound — SEO, GEO & AI Lead Engine",
    description:
      "Find the searches, citations, and buyers your competitors still miss.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${syne.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
