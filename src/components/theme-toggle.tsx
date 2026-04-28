"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      className="w-10 px-0"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Alternar tema"
      title="Alternar tema"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  );
}
