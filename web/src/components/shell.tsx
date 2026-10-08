import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Briefcase,
  Compass,
  FlaskConical,
  Gauge,
  Keyboard,
  LayoutDashboard,
  Menu,
  Moon,
  PencilLine,
  SlidersHorizontal,
  Sun,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PRESETS } from "@/lib/schema";
import { useApp, type Page } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { SyntheticBadge, Tip } from "./ui/primitives";

export const NAV: { page: Page; label: string; icon: ReactNode; tour?: string }[] = [
  { page: "landing", label: "Overview", icon: <Compass /> },
  { page: "input", label: "Enter startup", icon: <PencilLine />, tour: "Enter your numbers in a 4-step form, or load a preset." },
  { page: "dashboard", label: "Founder dashboard", icon: <LayoutDashboard />, tour: "Risk gauge, KPIs vs peers, drivers, runway bands and readiness." },
  { page: "simulator", label: "What-if simulator", icon: <SlidersHorizontal />, tour: "Move levers to re-run the model live and auto-rank actions." },
  { page: "portfolio", label: "Portfolio", icon: <Briefcase />, tour: "Upload a CSV to screen many startups; sort, filter and export." },
  { page: "lab", label: "Model lab", icon: <FlaskConical />, tour: "Compare models: CV scores, ROC, calibration, importance." },
  { page: "methodology", label: "Data & methodology", icon: <BookOpen />, tour: "Finance theory, the synthetic-data notice and limitations." },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img src={`${import.meta.env.BASE_URL}compass.svg`} alt="" className="h-8 w-8" />
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-fg">Startup Compass</div>
        <div className="text-[11px] text-muted">Survival risk · 24 months</div>
      </div>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { page, setPage } = useApp();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {NAV.map((n) => (
        <button
          key={n.page}
          data-tour={n.page}
          onClick={() => {
            setPage(n.page);
            onNavigate?.();
          }}
          aria-current={page === n.page ? "page" : undefined}
          className={cn(
            "group relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors [&_svg]:h-4 [&_svg]:w-4",
            page === n.page ? "bg-[var(--surface)] text-fg" : "text-muted hover:bg-[var(--surface)] hover:text-fg",
          )}
        >
          {page === n.page && <motion.span layoutId="nav-active" className="accent-gradient absolute left-0 top-2 bottom-2 w-[3px] rounded-full" />}
          {n.icon}
          {n.label}
        </button>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const { setPaletteOpen } = useApp();
  return (
    <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r border-[var(--border)] bg-[var(--surface)] px-4 py-5 backdrop-blur-xl lg:flex">
      <Logo />
      <button
        onClick={() => setPaletteOpen(true)}
        className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-muted hover:text-fg"
      >
        <span className="flex items-center gap-2">
          <Keyboard className="h-3.5 w-3.5" /> Search & commands
        </span>
        <kbd className="num rounded border border-[var(--border)] px-1.5 text-[10px]">Ctrl K</kbd>
      </button>
      <NavList />
      <div className="mt-auto space-y-2 text-[11px] leading-relaxed text-muted">
        <SyntheticBadge />
        <p>Probabilities for decision support, never guarantees.</p>
      </div>
    </aside>
  );
}

export function Topbar() {
  const { mode, theme, toggleTheme, setPaletteOpen, page } = useApp();
  const [open, setOpen] = useState(false);
  const title = NAV.find((n) => n.page === page)?.label ?? "";
  return (
    <>
      <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)]/70 px-4 backdrop-blur-xl sm:px-6">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setOpen(true)}>
          <Menu />
        </Button>
        <h1 className="truncate text-sm font-semibold text-fg">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Tip
            content={
              mode === "api"
                ? "Connected to the FastAPI model (calibrated)."
                : mode === "offline"
                  ? "API unreachable: scoring in your browser with the logistic fallback."
                  : "Checking the API..."
            }
          >
            <span
              data-tour="mode"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                mode === "api" ? "border-low/40 text-low" : mode === "offline" ? "border-medium/40 text-medium" : "border-[var(--border)] text-muted",
              )}
            >
              {mode === "offline" ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
              {mode === "api" ? "API model" : mode === "offline" ? "Offline engine" : "Connecting"}
            </span>
          </Tip>
          <Button variant="ghost" size="icon" aria-label="Open command palette" onClick={() => setPaletteOpen(true)} className="lg:hidden">
            <Keyboard />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={toggleTheme} data-tour="theme">
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 bg-[var(--surface-2)] p-5"
              aria-label="Navigation"
            >
              <div className="flex items-center justify-between">
                <Logo />
                <Button variant="ghost" size="icon" aria-label="Close navigation" onClick={() => setOpen(false)}>
                  <X />
                </Button>
              </div>
              <NavList onNavigate={() => setOpen(false)} />
              <SyntheticBadge className="mt-auto" />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setPage, setInput, toggleTheme, resetLevers, setTourDone } = useApp();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!useApp.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);
  const run = (fn: () => void) => {
    fn();
    setPaletteOpen(false);
  };
  return (
    <Command.Dialog
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[15vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] shadow-2xl"
    >
      <Command.Input placeholder="Jump to a page, load a preset, run a command..." className="h-12 w-full border-b border-[var(--border)] bg-transparent px-4 text-sm text-fg outline-none placeholder:text-muted" />
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted">No results.</Command.Empty>
        <Command.Group heading="Go to" className="px-1 text-[11px] text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
          {NAV.map((n) => (
            <PaletteItem key={n.page} onSelect={() => run(() => setPage(n.page))} icon={n.icon}>
              {n.label}
            </PaletteItem>
          ))}
        </Command.Group>
        <Command.Group heading="Load preset" className="px-1 text-[11px] text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
          {Object.entries(PRESETS).map(([name, p]) => (
            <PaletteItem
              key={name}
              icon={<Gauge />}
              onSelect={() =>
                run(() => {
                  setInput(p);
                  setPage("dashboard");
                  toast.success(`Loaded ${name}`);
                })
              }
            >
              {name}
            </PaletteItem>
          ))}
        </Command.Group>
        <Command.Group heading="Actions" className="px-1 text-[11px] text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
          <PaletteItem icon={<Sun />} onSelect={() => run(toggleTheme)}>Toggle light / dark mode</PaletteItem>
          <PaletteItem icon={<SlidersHorizontal />} onSelect={() => run(() => { resetLevers(); toast("Levers reset"); })}>Reset what-if levers</PaletteItem>
          <PaletteItem icon={<Compass />} onSelect={() => run(() => setTourDone(false))}>Replay the guided tour</PaletteItem>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}

function PaletteItem({ children, onSelect, icon }: { children: ReactNode; onSelect: () => void; icon: ReactNode }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg data-[selected=true]:bg-[var(--surface)] [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted"
    >
      {icon}
      {children}
    </Command.Item>
  );
}

/** First-load guided tour: highlights each nav item in turn. */
export function OnboardingTour() {
  const { tourDone, setTourDone } = useApp();
  const steps = [
    { target: null, title: "Welcome to Startup Compass", body: "Estimate a startup's 24-month failure risk and find the levers that reduce it. Everything runs on SYNTHETIC data." },
    ...NAV.filter((n) => n.tour).map((n) => ({ target: n.page as string, title: n.label, body: n.tour! })),
    { target: "mode", title: "API or offline", body: "Green means the calibrated FastAPI model is scoring. Amber means it is unreachable and your browser is scoring with a logistic fallback." },
    { target: null, title: "Shortcuts", body: "Press Ctrl/Cmd + K any time to jump to a page, load a preset or toggle the theme." },
  ];
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];
  useEffect(() => {
    if (tourDone) return;
    const update = () => {
      const els = step.target ? Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`)) : [];
      const el = els.find((e) => e.offsetParent !== null);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [i, tourDone, step.target]);
  useEffect(() => {
    if (!tourDone) setI(0);
  }, [tourDone]);
  if (tourDone) return null;
  const finish = () => {
    setTourDone(true);
    toast.success("Tour complete. Press Ctrl/Cmd + K any time.");
  };
  const cardStyle = rect
    ? { top: Math.min(rect.bottom + 12, window.innerHeight - 220), left: Math.min(Math.max(rect.left, 16), window.innerWidth - 336) }
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  return (
    <div className="no-print fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div className="absolute inset-0 bg-black/55" onClick={finish} />
      {rect && (
        <motion.div
          layout
          className="pointer-events-none absolute rounded-xl ring-2 ring-teal shadow-[0_0_0_9999px_rgba(0,0,0,0.0)]"
          style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      )}
      <motion.div
        key={i}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute w-80 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 shadow-2xl"
        style={cardStyle}
      >
        <div className="num text-[11px] text-muted">
          {i + 1} / {steps.length}
        </div>
        <h2 className="mt-1 font-semibold text-fg">{step.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={finish}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            {i > 0 && (
              <Button size="sm" onClick={() => setI(i - 1)}>
                Back
              </Button>
            )}
            <Button variant="primary" size="sm" autoFocus onClick={() => (i === steps.length - 1 ? finish() : setI(i + 1))}>
              {i === steps.length - 1 ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
