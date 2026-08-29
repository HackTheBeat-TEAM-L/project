import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HYPEWAVE — crowd-reactive auto DJ",
  description: "Detects crowd hype from mic dB spikes and auto-queues similar tracks via Spotify + LLM.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
