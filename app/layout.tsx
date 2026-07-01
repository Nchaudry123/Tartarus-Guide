import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tartarus Guide",
    template: "%s | Tartarus Guide",
  },
  description: "A Persona 3 Reload inspired guide chatbot interface.",
  applicationName: "Tartarus Guide",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Tartarus",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="stylesheet" href="/styles.css?v=standalone-mobile-fixes" />
      </head>
      <body>{children}</body>
    </html>
  );
}
