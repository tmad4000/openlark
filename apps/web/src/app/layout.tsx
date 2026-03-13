import type { Metadata } from "next";
import "./globals.css";
import { ThemeProviderWrapper } from "./ThemeProviderWrapper";

export const metadata: Metadata = {
  title: "OpenLark",
  description: "Open source workplace super-app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProviderWrapper>{children}</ThemeProviderWrapper>
      </body>
    </html>
  );
}
