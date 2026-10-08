// shadcn/ui-style primitives: Card, Input, Select, Slider, Tabs, Tooltip, Dialog, badges, Skeleton.

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import * as React from "react";
import type { Band } from "@/lib/types";
import { cn } from "@/lib/utils";

/* Card */
export function Card({ className, glow, ...props }: React.HTMLAttributes<HTMLDivElement> & { glow?: boolean }) {
  return <div className={cn("glass p-5", glow && "glow", className)} {...props} />;
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* Inputs */
const field =
  "h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-fg transition-colors placeholder:text-muted/70 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/40";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <input ref={ref} aria-invalid={invalid || undefined} className={cn(field, invalid && "border-high focus:border-high focus:ring-high/30", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  ({ className, invalid, children, ...props }, ref) => (
    <select ref={ref} aria-invalid={invalid || undefined} className={cn(field, "cursor-pointer appearance-none", invalid && "border-high", className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

/* Slider */
export const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>>(
  ({ className, ...props }, ref) => (
    <SliderPrimitive.Root ref={ref} className={cn("relative flex w-full touch-none select-none items-center py-2", className)} {...props}>
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[var(--border)]">
        <SliderPrimitive.Range className="accent-gradient absolute h-full" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={props["aria-label"]}
        className="block h-5 w-5 cursor-grab rounded-full border-2 border-teal bg-[var(--surface-2)] shadow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal/40"
      />
    </SliderPrimitive.Root>
  ),
);
Slider.displayName = "Slider";

/* Tabs */
export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;
export const TabsList = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List className={cn("inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1", className)} {...p} />
);
export const TabsTrigger = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      "cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-fg data-[state=active]:bg-[var(--surface-2)] data-[state=active]:text-fg data-[state=active]:shadow",
      className,
    )}
    {...p}
  />
);

/* Tooltip */
export const TooltipProvider = TooltipPrimitive.Provider;
export function Tip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root delayDuration={150}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs leading-relaxed text-fg shadow-xl"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[var(--surface-2)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* Dialog */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export function DialogContent({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6 shadow-2xl focus:outline-none",
          className,
        )}
      >
        <DialogPrimitive.Title className="pr-8 text-base font-semibold text-fg">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className={description ? "mt-1 text-sm text-muted" : "sr-only"}>{description ?? title}</DialogPrimitive.Description>
        <div className="mt-4">{children}</div>
        <DialogPrimitive.Close className="absolute right-4 top-4 cursor-pointer rounded-lg p-1 text-muted hover:text-fg" aria-label="Close">
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* Badges */
const tone: Record<Band, string> = {
  Low: "bg-low/12 text-low ring-low/30",
  Medium: "bg-medium/12 text-medium ring-medium/30",
  High: "bg-high/12 text-high ring-high/30",
};

export function RiskBadge({ band, className, suffix = "risk" }: { band: Band; className?: string; suffix?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1", tone[band], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {band} {suffix}
    </span>
  );
}

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-xs text-muted", className)}>
      {children}
    </span>
  );
}

export function SyntheticBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-medium/40 bg-medium/10 px-2.5 py-0.5 text-[11px] font-semibold text-medium", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      Synthetic data
    </span>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn("skeleton", className)} aria-hidden />;
