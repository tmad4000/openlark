"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") return getSystemTheme();
  return theme;
}

export function ThemeProvider({
  children,
  initialTheme = "system",
  accentColor,
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
  accentColor?: string | null;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(initialTheme)
  );

  const applyTheme = useCallback(
    (t: Theme) => {
      const resolved = resolveTheme(t);
      setResolvedTheme(resolved);
      document.documentElement.setAttribute("data-theme", resolved);
    },
    []
  );

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      localStorage.setItem("openlark-theme", newTheme);
      applyTheme(newTheme);
    },
    [applyTheme]
  );

  // On mount: read from localStorage (fallback to initialTheme)
  useEffect(() => {
    const stored = localStorage.getItem("openlark-theme") as Theme | null;
    const t = stored || initialTheme;
    setThemeState(t);
    applyTheme(t);
  }, [initialTheme, applyTheme]);

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, applyTheme]);

  // Apply org accent color as CSS custom property
  useEffect(() => {
    if (accentColor) {
      document.documentElement.style.setProperty("--org-accent", accentColor);
      // Generate a slightly darker hover variant
      document.documentElement.style.setProperty(
        "--org-accent-hover",
        accentColor
      );
    } else {
      document.documentElement.style.removeProperty("--org-accent");
      document.documentElement.style.removeProperty("--org-accent-hover");
    }
  }, [accentColor]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
