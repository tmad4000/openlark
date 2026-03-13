"use client";

import { type ReactNode } from "react";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { CommandPaletteProvider } from "@/components/command-palette";
import { Toaster } from "sonner";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CommandPaletteProvider>
          {children}
          <Toaster position="top-right" richColors />
        </CommandPaletteProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
