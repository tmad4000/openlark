"use client";

import { type ReactNode } from "react";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { CommandPaletteProvider } from "@/components/command-palette";
import { KeyboardShortcutsProvider } from "@/hooks/use-keyboard-shortcuts";
import { Toaster } from "sonner";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <KeyboardShortcutsProvider>
          <CommandPaletteProvider>
            {children}
            <Toaster position="top-right" richColors />
          </CommandPaletteProvider>
        </KeyboardShortcutsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
