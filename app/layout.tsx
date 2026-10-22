import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { GradientBackground } from "@/components/GradientBackground";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FIDE Live Rating",
  description: "Official FIDE ratings plus live changes from recent chess-results tournaments",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GradientBackground />
        <header className="sticky top-0 z-10 border-b border-border bg-surface/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="text-xl text-accent">♞</span> FIDE Live Rating
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 text-center text-xs text-muted">
          Data from ratings.fide.com and chess-results.com. Live ratings are unofficial estimates.
        </footer>
      </body>
    </html>
  );
}
