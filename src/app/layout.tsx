import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BuyableAI | AI Commerce Readiness",
  description: "A safe, explainable foundation for AI-buyable merchants.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
