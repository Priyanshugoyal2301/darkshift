import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "DarkShield — Dark Pattern Audit Platform",
  description:
    "Evidence-first dark pattern detection for India's CCPA 2023 framework. Protect consumers and audit websites against deceptive UX practices.",
  keywords: ["dark patterns", "CCPA", "India", "e-commerce", "consumer protection", "UX audit"],
  openGraph: {
    title: "DarkShield",
    description: "Evidence-first dark pattern detection for India's CCPA 2023 framework",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[#050508] text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
