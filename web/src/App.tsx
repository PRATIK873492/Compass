import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useEffect } from "react";
import { Toaster, toast } from "sonner";
import { CommandPalette, OnboardingTour, Sidebar, Topbar } from "./components/shell";
import { Skeleton, TooltipProvider } from "./components/ui/primitives";
import { bindMode, detectMode } from "./lib/api";
import { useApp, type Page } from "./lib/store";
import Landing from "./pages/Landing";

const pages: Record<Page, React.LazyExoticComponent<() => React.JSX.Element> | (() => React.JSX.Element)> = {
  landing: Landing,
  input: lazy(() => import("./pages/InputForm")),
  dashboard: lazy(() => import("./pages/Dashboard")),
  simulator: lazy(() => import("./pages/Simulator")),
  portfolio: lazy(() => import("./pages/Portfolio")),
  lab: lazy(() => import("./pages/ModelLab")),
  methodology: lazy(() => import("./pages/Methodology")),
};

function PageSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-40" />
      ))}
    </div>
  );
}

export default function App() {
  const { page, theme, setMode, setPage } = useApp();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    let alive = true;
    detectMode().then((m) => {
      if (!alive) return;
      setMode(m);
      bindMode(m, (next) => {
        setMode(next);
        toast.warning("API unreachable. Switched to the in-browser engine.");
      });
      if (m === "offline") toast.message("Offline engine active", { description: "The FastAPI server is not reachable, so scoring runs in your browser." });
    });
    const onHash = () => {
      const h = location.hash.replace("#/", "") as Page;
      if (h && h in pages && h !== useApp.getState().page) setPage(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      alive = false;
      window.removeEventListener("hashchange", onHash);
    };
  }, [setMode, setPage]);

  const Current = pages[page];
  return (
    <TooltipProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <AnimatePresence mode="wait">
              <motion.div key={page} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                <Suspense fallback={<PageSkeleton />}>
                  <Current />
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </main>
          <footer className="no-print border-t border-[var(--border)] px-6 py-4 text-center text-[11px] text-muted">
            Startup Compass · AVENIR Hackathon 4.0 · All data is SYNTHETIC · Outputs are probabilities for decision support, never guarantees.
          </footer>
        </div>
      </div>
      <CommandPalette />
      <OnboardingTour />
      <Toaster theme={theme} position="bottom-right" richColors closeButton />
    </TooltipProvider>
  );
}
