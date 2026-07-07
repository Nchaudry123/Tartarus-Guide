import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tartarus Guide",
    template: "%s | Tartarus Guide",
  },
  description: "A Persona 3 Reload inspired guide chatbot interface.",
  applicationName: "Tartarus Guide",
  appleWebApp: {
    capable: true,
    title: "Tartarus",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#071440",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="stylesheet" href="/styles.css?v=ultimate-mobile-view" />
      </head>
      <body>{children}</body>
    </html>
  );
}
