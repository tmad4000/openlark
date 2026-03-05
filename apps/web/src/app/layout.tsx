import type { Metadata } from "next";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
