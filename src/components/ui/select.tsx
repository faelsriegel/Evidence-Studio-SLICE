import * as React from "react";
import { cn } from "@/lib/utils";

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none ring-sky-400/40 transition focus:ring-2",
        className,
      )}
      {...props}
    />
  );
}
