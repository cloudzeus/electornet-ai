import { AlertTriangle, CheckCircle2, CircleDot, Clock, Mail, MailX } from "lucide-react";
import type { FlowState } from "./model";

export const PRIMARY_LABEL: Record<string, string> = { transform: "Μετασχηματισμός", erpCheck: "Έλεγχος SoftOne", stepDone: "Έγινε", remail: "Νέα αποστολή" };

/** Κατάσταση με εικονίδιο και χρώμα (ποτέ μόνο χρώμα: δίπλα υπάρχει πάντα κείμενο). */
export function StateIcon({ state, mail }: { state: FlowState; mail?: boolean }) {
  if (mail) return state === "problem" ? <MailX className="size-3.5 shrink-0 text-eu-red" aria-hidden /> : <Mail className={`size-3.5 shrink-0 ${state === "done" ? "text-eu-green" : "text-eu-muted"}`} aria-hidden />;
  if (state === "done") return <CheckCircle2 className="size-3.5 shrink-0 text-eu-green" aria-hidden />;
  if (state === "now") return <CircleDot className="size-3.5 shrink-0 text-eu-blue" aria-hidden />;
  if (state === "problem") return <AlertTriangle className="size-3.5 shrink-0 text-eu-red" aria-hidden />;
  return <Clock className="size-3.5 shrink-0 text-eu-muted" aria-hidden />;
}
