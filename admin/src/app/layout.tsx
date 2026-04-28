import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { themeBootScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: "FDM Tracker — Admin",
  description: "Internal employee monitoring for Fourth Dimension Media Solutions.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Apply dark class before React mounts — prevents FOUC. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
