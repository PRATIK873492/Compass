// API client with automatic fallback to the in-browser engine.

import { Engine, InputError, type OfflineData } from "./engine";
import type {
  BatchResponse,
  BenchmarkResponse,
  ExplainResponse,
  Levers,
  Mode,
  ModelLab,
  PredictResponse,
  SimulateResponse,
  StartupInput,
} from "./types";

const BASE: string = import.meta.env.VITE_API_URL ?? "/api";
let enginePromise: Promise<Engine> | null = null;
let offlineData: OfflineData | null = null;

export function getEngine(): Promise<Engine> {
  enginePromise ??= import("../data/offline.json").then((m) => {
    offlineData = m.default as unknown as OfflineData;
    return new Engine(offlineData);
  });
  return enginePromise;
}

export async function demoRows(): Promise<Record<string, unknown>[]> {
  await getEngine();
  return offlineData!.demo_rows;
}

class NetworkError extends Error {}

async function call<T>(path: string, body?: unknown, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new NetworkError("API unreachable");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 422) {
    const j = await res.json().catch(() => ({}));
    throw new InputError(j.errors ?? [j.detail ?? "Invalid input"]);
  }
  if (res.status >= 500 || res.status === 404 || res.status === 502 || res.status === 503 || res.status === 504) {
    throw new NetworkError(`API error ${res.status}`);
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(typeof j.detail === "string" ? j.detail : `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function detectMode(): Promise<Mode> {
  try {
    const h = await call<{ status: string }>("/health", undefined, 2500);
    return h.status === "ok" ? "api" : "offline";
  } catch {
    return "offline";
  }
}

type ModeSetter = (m: Mode) => void;
let currentMode: Mode = "api";
let onModeChange: ModeSetter = () => {};
export function bindMode(mode: Mode, setter: ModeSetter) {
  currentMode = mode;
  onModeChange = setter;
}

async function withFallback<T>(online: () => Promise<T>, offline: (e: Engine) => T): Promise<T> {
  if (currentMode === "api") {
    try {
      return await online();
    } catch (err) {
      if (!(err instanceof NetworkError)) throw err;
      currentMode = "offline";
      onModeChange("offline");
    }
  }
  const engine = await getEngine();
  return offline(engine);
}

const clean = (s: Partial<StartupInput>) => {
  const { name: _n, ...rest } = s as StartupInput;
  void _n;
  return rest;
};

export const api = {
  predict: (s: Partial<StartupInput>) =>
    withFallback(() => call<PredictResponse>("/predict", { startup: clean(s) }), (e) => e.predict(s)),
  explain: (s: Partial<StartupInput>) =>
    withFallback(() => call<ExplainResponse>("/explain", { startup: clean(s) }), (e) => e.explain(s)),
  simulate: (s: Partial<StartupInput>, levers: Levers, actionPlan = false) =>
    withFallback(
      () => call<SimulateResponse>("/simulate", { startup: clean(s), levers, action_plan: actionPlan }),
      (e) => e.simulate(s, levers, actionPlan),
    ),
  benchmark: (s: Partial<StartupInput>) =>
    withFallback(() => call<BenchmarkResponse>("/benchmark", { startup: clean(s) }), (e) => e.benchmark(s)),
  batch: (rows: Record<string, unknown>[]) =>
    withFallback(() => call<BatchResponse>("/batch-score", { rows }, 30000), (e) => e.batch(rows)),
  modelLab: () =>
    withFallback(
      () => call<ModelLab>("/model-lab"),
      () => (offlineData as unknown as { model_lab: ModelLab }).model_lab,
    ),
  train: (n: number, seed: number) =>
    call<{ selected_model: string; explanation: string; test_metrics: Record<string, number>; rows: number; seconds: number }>(
      "/train",
      { source: "synthetic", n, seed },
      180000,
    ),
};

export { InputError, NetworkError };
