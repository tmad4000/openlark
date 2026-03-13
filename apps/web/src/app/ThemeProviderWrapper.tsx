"use client";

import { ThemeProvider } from "../components/ThemeProvider";

export function ThemeProviderWrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
