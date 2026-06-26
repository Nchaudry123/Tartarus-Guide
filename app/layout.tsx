import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tartarus Guide",
  description: "A Persona 3 Reload inspired guide chatbot interface.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/styles.css?v=dashboard-lanes" />
      </head>
      <body>{children}</body>
    </html>
  );
}
