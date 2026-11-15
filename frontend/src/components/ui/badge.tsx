import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", {
  variants: {
    tone: {
      neutral: "bg-slate-100 text-slate-700 ring-slate-300/40",
      green: "bg-covered-soft text-covered-ink ring-covered/20",
      red: "bg-gap-soft text-gap-ink ring-gap/20",
      amber: "bg-warn-soft text-warn-ink ring-warn/25",
      teal: "bg-teal-50 text-teal-800 ring-teal-600/20",
      navy: "bg-navy-900 text-white ring-navy-900",
      indigo: "bg-indigo-50 text-indigo-800 ring-indigo-600/20",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export const Badge = ({ className, tone, ...p }: BadgeProps) => <span className={cn(badgeVariants({ tone }), className)} {...p} />;
