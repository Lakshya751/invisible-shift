import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { AppStateData, Assignment, CareTask, Health, ScenarioResult } from "@/lib/types";

interface Toast {
  id: number;
  title: string;
  body?: string;
  tone?: "success" | "error" | "info";
}

interface Ctx {
  data: AppStateData | null;
  health: Health | null;
  loading: boolean;
  error: string | null;
  setData: (d: AppStateData) => void;
  refresh: () => Promise<void>;
  run: <T extends AppStateData>(p: Promise<T>, okMsg?: string) => Promise<T | null>;
  launchDemo: () => Promise<void>;
  taskById: Record<string, CareTask>;
  assignmentById: Record<string, Assignment>;
  openTaskId: string | null;
  openTask: (id: string | null) => void;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  tourStep: number | null;
  setTourStep: (n: number | null) => void;
  navigatorOpen: boolean;
  setNavigatorOpen: (b: boolean) => void;
  lastSim: ScenarioResult | null;
  setLastSim: (s: ScenarioResult | null) => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppStateData | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openTaskId, openTask] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [lastSim, setLastSim] = useState<ScenarioResult | null>(null);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x, { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 4200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [s, h] = await Promise.all([api.state(), api.health()]);
      setData(s);
      setHealth(h);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = useCallback(
    async <T extends AppStateData>(p: Promise<T>, okMsg?: string) => {
      try {
        const res = await p;
        setData(res);
        if (okMsg) toast({ title: okMsg, tone: "success" });
        return res;
      } catch (e) {
        toast({ title: "Something went wrong", body: (e as Error).message, tone: "error" });
        return null;
      }
    },
    [toast],
  );

  const launchDemo = useCallback(async () => {
    setLoading(true);
    await run(api.resetDemo());
    setLoading(false);
  }, [run]);

  const taskById = useMemo(() => Object.fromEntries((data?.workspace.tasks || []).map((t) => [t.task_id, t])), [data]);
  const assignmentById = useMemo(
    () => Object.fromEntries((data?.schedule.assignments || []).map((a) => [a.task_id, a])),
    [data],
  );

  return (
    <AppCtx.Provider
      value={{
        data,
        health,
        loading,
        error,
        setData,
        refresh,
        run,
        launchDemo,
        taskById,
        assignmentById,
        openTaskId,
        openTask,
        toasts,
        toast,
        tourStep,
        setTourStep,
        navigatorOpen,
        setNavigatorOpen,
        lastSim,
        setLastSim,
      }}
    >
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}
