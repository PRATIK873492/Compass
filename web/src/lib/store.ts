import { create } from "zustand";
import { persist } from "zustand/middleware";
import { EMPTY_INPUT } from "./schema";
import type { BatchRow, Levers, Mode, StartupInput } from "./types";

export type Page = "landing" | "input" | "dashboard" | "simulator" | "portfolio" | "lab" | "methodology";

export interface SavedScenario {
  id: string;
  name: string;
  savedAt: string;
  input: StartupInput;
  levers: Levers;
  probability: number | null;
}

export const ZERO_LEVERS: Levers = { burn_pct: 0, churn_pct: 0, cac_pct: 0, growth_pts: 0, price_pct: 0 };

interface State {
  page: Page;
  theme: "dark" | "light";
  mode: Mode | "checking";
  input: StartupInput;
  hasStartup: boolean;
  levers: Levers;
  scenarios: SavedScenario[];
  portfolio: BatchRow[];
  portfolioSource: string | null;
  tourDone: boolean;
  paletteOpen: boolean;
  setPage: (p: Page) => void;
  toggleTheme: () => void;
  setMode: (m: Mode | "checking") => void;
  setInput: (i: StartupInput) => void;
  patchInput: (p: Partial<StartupInput>) => void;
  setLevers: (l: Partial<Levers>) => void;
  resetLevers: () => void;
  saveScenario: (s: SavedScenario) => void;
  deleteScenario: (id: string) => void;
  setPortfolio: (rows: BatchRow[], source: string) => void;
  clearPortfolio: () => void;
  setTourDone: (v: boolean) => void;
  setPaletteOpen: (v: boolean) => void;
}

const pageFromHash = (): Page => {
  const h = (typeof location !== "undefined" ? location.hash.replace("#/", "") : "") as Page;
  return ["landing", "input", "dashboard", "simulator", "portfolio", "lab", "methodology"].includes(h) ? h : "landing";
};

export const useApp = create<State>()(
  persist(
    (set) => ({
      page: pageFromHash(),
      theme: "dark",
      mode: "checking",
      input: EMPTY_INPUT,
      hasStartup: false,
      levers: ZERO_LEVERS,
      scenarios: [],
      portfolio: [],
      portfolioSource: null,
      tourDone: false,
      paletteOpen: false,
      setPage: (page) => {
        if (typeof location !== "undefined") location.hash = `/${page}`;
        window.scrollTo({ top: 0 });
        set({ page });
      },
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setMode: (mode) => set({ mode }),
      setInput: (input) => set({ input, hasStartup: true, levers: ZERO_LEVERS }),
      patchInput: (p) => set((s) => ({ input: { ...s.input, ...p } })),
      setLevers: (l) => set((s) => ({ levers: { ...s.levers, ...l } })),
      resetLevers: () => set({ levers: ZERO_LEVERS }),
      saveScenario: (sc) => set((s) => ({ scenarios: [sc, ...s.scenarios.filter((x) => x.id !== sc.id)].slice(0, 30) })),
      deleteScenario: (id) => set((s) => ({ scenarios: s.scenarios.filter((x) => x.id !== id) })),
      setPortfolio: (portfolio, portfolioSource) => set({ portfolio, portfolioSource }),
      clearPortfolio: () => set({ portfolio: [], portfolioSource: null }),
      setTourDone: (tourDone) => set({ tourDone }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
    }),
    {
      name: "startup-compass",
      version: 1,
      partialize: (s) => ({
        theme: s.theme,
        input: s.input,
        hasStartup: s.hasStartup,
        scenarios: s.scenarios,
        tourDone: s.tourDone,
      }),
    },
  ),
);
