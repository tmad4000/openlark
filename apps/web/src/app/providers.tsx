"use client";

import { type ReactNode } from "react";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { CommandPaletteProvider } from "@/components/command-palette";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CommandPaletteProvider>{children}</CommandPaletteProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
