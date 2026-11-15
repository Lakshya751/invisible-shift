import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;

export function SheetContent({
  className,
  children,
  side = "right",
  title,
  description,
  ...p
}: React.ComponentPropsWithoutRef<typeof D.Content> & { side?: "right" | "center"; title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-navy-950/30 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <D.Content
        className={cn(
          "fixed z-50 flex flex-col bg-white shadow-lift focus:outline-none",
          side === "right"
            ? "inset-y-0 right-0 w-full max-w-[520px] border-l border-slate-200"
            : "left-1/2 top-1/2 max-h-[90vh] w-[calc(100%-32px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl",
          className,
        )}
        {...p}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <D.Title className="text-base font-semibold tracking-tight text-ink">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-sm text-slate-500">{description}</D.Description> : <D.Description className="sr-only">Details</D.Description>}
          </div>
          <D.Close className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
