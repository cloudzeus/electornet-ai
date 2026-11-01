import "server-only";

/**
 * Σύνδεση σκηνής ↔ τηλεχειριστηρίου στη μνήμη της διεργασίας (μία παρουσίαση, ένας server): το τηλεχειριστήριο
 * στέλνει εντολές, η σκηνή αναφέρει πού βρίσκεται. Στο globalThis ώστε όλα τα routes (και το HMR) να βλέπουν το ίδιο.
 */
export type Cmd = { t: "next" } | { t: "back" } | { t: "reset" } | { t: "goto"; i: number } | { t: "store"; i: number } | { t: "skipCall" };
export interface StageState { i: number; id: string; wait: string; cue: string | null; say: string | null; total: number; stores: string[]; storeIdx: number | null; call: string | null; at: number }
type Listener = (ev: { kind: "cmd"; cmd: Cmd } | { kind: "state"; state: StageState }) => void;

const g = globalThis as unknown as { __skets?: { listeners: Set<Listener>; state: StageState | null } };
const bus = (g.__skets ??= { listeners: new Set(), state: null });

export const subscribe = (fn: Listener) => { bus.listeners.add(fn); return () => bus.listeners.delete(fn); };
export const sendCmd = (cmd: Cmd) => bus.listeners.forEach((fn) => fn({ kind: "cmd", cmd }));
export const setState = (state: StageState) => { bus.state = state; bus.listeners.forEach((fn) => fn({ kind: "state", state })); };
export const lastState = () => bus.state;
