import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
};

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg px-3.5 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50",
        variant === "default" &&
          "bg-sky-500 text-white shadow-sm hover:bg-sky-400",
        variant === "outline" &&
          "border border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800",
        variant === "ghost" &&
          "text-slate-200 hover:bg-slate-800",
        className,
      )}
      {...props}
    />
  );
}
