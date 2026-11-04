import "server-only";

/**
 * Σύνδεση σκηνής ↔ τηλεχειριστηρίου στη μνήμη της διεργασίας (μία παρουσίαση, ένας server): το τηλεχειριστήριο
 * στέλνει εντολές, η σκηνή αναφέρει πού βρίσκεται. Στο globalThis ώστε όλα τα routes (και το HMR) να βλέπουν το ίδιο.
 */
import type { LiveEv } from "./types";

export type Cmd = { t: "next" } | { t: "back" } | { t: "reset" } | { t: "goto"; i: number } | { t: "store"; i: number } | { t: "skipCall" }
  /** ζωντανή ερώτηση: ο χειριστής κρατά πατημένο το «Μίλα στον Ερμή» (on) · κλείσιμο και πίσω στο σενάριο · προϊόν της απάντησης στο σπίτι */
  | { t: "liveListen"; on: boolean } | { t: "liveClose" } | { t: "addExtra"; id: string }
  /** αυτόματη συνέχεια: ο Ερμής ακούει πότε τελείωσε ο παρουσιαστής (μικρόφωνο της σκηνής) */
  | { t: "auto"; on: boolean };
export interface StageState { i: number; id: string; wait: string; cue: string | null; say: string | null; total: number; stores: string[]; storeIdx: number | null; call: string | null; /** ανοιχτή ζωντανή ερώτηση */ live?: boolean; /** προϊόντα που πρόσθεσε το κοινό */ extras?: string[]; /** αυτόματη συνέχεια ενεργή · μικρόφωνο ανοιχτό · ακούει τώρα τον παρουσιαστή */ auto?: boolean; mic?: boolean; hearing?: boolean; /** τι άκουσε τελευταίο ο Ερμής από τον παρουσιαστή και τι έκανε (για να διορθώσει ο χειριστής) */ heard?: { said: string; route: string } | null; at: number }
type Listener = (ev: { kind: "cmd"; cmd: Cmd } | { kind: "state"; state: StageState } | { kind: "live"; live: LiveEv }) => void;

const g = globalThis as unknown as { __skets?: { listeners: Set<Listener>; state: StageState | null; live?: LiveEv | null } };
const bus = (g.__skets ??= { listeners: new Set(), state: null });

export const subscribe = (fn: Listener) => { bus.listeners.add(fn); return () => bus.listeners.delete(fn); };
export const sendCmd = (cmd: Cmd) => bus.listeners.forEach((fn) => fn({ kind: "cmd", cmd }));
export const setState = (state: StageState) => { bus.state = state; bus.listeners.forEach((fn) => fn({ kind: "state", state })); };
export const lastState = () => bus.state;
/** ζωντανή ερώτηση → σκηνή και τηλεχειριστήριο */
export const sendLive = (live: LiveEv) => { bus.live = bus.live?.n === live.n ? { ...bus.live, ...live, products: live.products ?? bus.live.products } : live; bus.listeners.forEach((fn) => fn({ kind: "live", live })); };
/** η τελευταία ζωντανή ερώτηση — για τηλεχειριστήριο που συνδέεται (ή ξανασυνδέεται) στη μέση της */
export const lastLive = () => bus.live ?? null;
