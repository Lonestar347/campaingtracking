import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kampagnen-Tracker",
  description: "Marketingkampagnen planen, ordnen und tracken",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>
        <header className="border-b-4 border-josera-gold bg-card">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <span className="h-6 w-1.5 rounded-full bg-josera-ruby" aria-hidden />
            <span className="text-lg font-semibold tracking-tight">Kampagnen-Tracker</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
