import { Bot, FileUp, KeyRound, LogIn, Network, PlugZap, Route, ServerCog, Store, TestTube2, type LucideIcon } from "lucide-react";

export const LOG_KIND: Record<string, { label: string; icon: LucideIcon }> = {
  "engine.event": { label: "Μηχανή", icon: ServerCog },
  test: { label: "Έλεγχος", icon: TestTube2 },
  upload: { label: "Ανέβασμα", icon: FileUp },
  mapping: { label: "Αντιστοίχιση", icon: Route },
  login: { label: "Σύνδεση χρήστη", icon: LogIn },
  password: { label: "Κωδικός", icon: KeyRound },
  profile: { label: "Προφίλ", icon: Store },
  import: { label: "Εισαγωγή", icon: Network },
  ai: { label: "Βοηθός", icon: Bot },
  connection: { label: "Σύνδεση", icon: PlugZap },
};

import { ORDER_STATUS, isOrderStatus } from "@/lib/orders/model";
import type { Tone } from "./ui";
export const toneOfOrder = (s: string): Tone => (isOrderStatus(s) ? ORDER_STATUS[s].tone : "neutral");
export const CONN_STATUS: Record<string, [Tone, string]> = { draft: ["neutral", "Πρόχειρη"], testing: ["info", "Σε έλεγχο"], ok: ["good", "Έλεγχος ΟΚ"], review: ["info", "Την ελέγχουμε εμείς"], failed: ["bad", "Πρόβλημα"], active: ["good", "Σε λειτουργία"], paused: ["warn", "Σε παύση"] };
