import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent X-Ray — APM for AI agent traces",
  description:
    "Drop in an agent trace and get critical path, context re-send cost, semantic loop detection and dead-branch analysis. Runs entirely in your browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
