import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none ring-sky-400/40 transition focus:ring-2",
        type !== "date" && "uppercase",
        className,
      )}
      {...props}
    />
  );
}
