import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { AppStateData, Assignment, CareTask, Health, Me, PatientFields, ScenarioResult } from "@/lib/types";

interface Toast {
  id: number;
  title: string;
  body?: string;
  tone?: "success" | "error" | "info";
}

interface Ctx {
  /** Signed-in user + their patients (null when signed out). */
  me: Me | null;
  authChecked: boolean;
  /** Full state of the active patient (null when none selected). */
  data: AppStateData | null;
  health: Health | null;
  loading: boolean;
  error: string | null;
  setData: (d: AppStateData) => void;
  refresh: () => Promise<void>;
  refreshMe: () => Promise<void>;
  run: <T extends AppStateData>(p: Promise<T>, okMsg?: string) => Promise<T | null>;
  /** Judge entry point: guest session if needed + fresh demo patient. */
  launchDemo: () => Promise<boolean>;
  /** Reset the active demo patient to its original scenario. */
  resetDemo: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<Me>;
  signUp: (name: string, email: string, password: string) => Promise<Me>;
  signOut: () => Promise<void>;
  selectPatient: (id: string) => Promise<void>;
  addPatient: (p: PatientFields) => Promise<boolean>;
  addDemoPatient: () => Promise<boolean>;
  updatePatient: (id: string, p: PatientFields) => Promise<boolean>;
  deletePatient: (id: string) => Promise<boolean>;
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
  const [me, setMe] = useState<Me | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
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

  const signedOut = useCallback(() => {
    setMe(null);
    setData(null);
    setTourStep(null);
  }, []);

  /** Store the user's info and load the active patient's state (if any). */
  const applyMe = useCallback(
    async (m: Me) => {
      setMe(m);
      openTask(null);
      setLastSim(null);
      if (m.active_patient_id) {
        try {
          setData(await api.state());
        } catch (e) {
          setData(null);
          if (!(e instanceof ApiError && e.status === 409)) setError((e as Error).message);
        }
      } else {
        setData(null);
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      api.health().then(setHealth).catch(() => undefined);
      const m = await api.me();
      await applyMe(m);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) signedOut();
      else setError((e as Error).message);
    } finally {
      setAuthChecked(true);
      setLoading(false);
    }
  }, [applyMe, signedOut]);

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) signedOut();
    }
  }, [signedOut]);

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
        if (e instanceof ApiError && e.status === 401) {
          signedOut();
          toast({ title: "Your session ended", body: "Please sign in again.", tone: "error" });
        } else toast({ title: "Something went wrong", body: (e as Error).message, tone: "error" });
        return null;
      }
    },
    [toast, signedOut],
  );

  /** Wrap a call that returns Me; toasts on failure. */
  const meCall = useCallback(
    async (p: Promise<Me>, okMsg?: string) => {
      try {
        await applyMe(await p);
        if (okMsg) toast({ title: okMsg, tone: "success" });
        return true;
      } catch (e) {
        toast({ title: "Something went wrong", body: (e as Error).message, tone: "error" });
        return false;
      }
    },
    [applyMe, toast],
  );

  const launchDemo = useCallback(async () => {
    setLoading(true);
    const ok = await meCall(api.launchDemo());
    setLoading(false);
    return ok;
  }, [meCall]);

  const resetDemo = useCallback(async () => {
    await run(api.resetDemo());
  }, [run]);

  const signIn = useCallback(async (email: string, password: string) => {
    const m = await api.login(email, password);
    await applyMe(m);
    return m;
  }, [applyMe]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const m = await api.signup(name, email, password);
    await applyMe(m);
    return m;
  }, [applyMe]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      signedOut();
    }
  }, [signedOut]);

  const selectPatient = useCallback(async (id: string) => {
    await meCall(api.selectPatient(id));
  }, [meCall]);

  const addPatient = useCallback((p: PatientFields) => meCall(api.addPatient(p), `${p.name} added`), [meCall]);
  const addDemoPatient = useCallback(() => meCall(api.addDemoPatient(), "Demo patient ready"), [meCall]);
  const updatePatient = useCallback((id: string, p: PatientFields) => meCall(api.updatePatient(id, p), "Patient details saved"), [meCall]);
  const deletePatient = useCallback((id: string) => meCall(api.deletePatient(id), "Patient removed"), [meCall]);

  const taskById = useMemo(() => Object.fromEntries((data?.workspace.tasks || []).map((t) => [t.task_id, t])), [data]);
  const assignmentById = useMemo(
    () => Object.fromEntries((data?.schedule.assignments || []).map((a) => [a.task_id, a])),
    [data],
  );

  return (
    <AppCtx.Provider
      value={{
        me,
        authChecked,
        data,
        health,
        loading,
        error,
        setData,
        refresh,
        refreshMe,
        run,
        launchDemo,
        resetDemo,
        signIn,
        signUp,
        signOut,
        selectPatient,
        addPatient,
        addDemoPatient,
        updatePatient,
        deletePatient,
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
