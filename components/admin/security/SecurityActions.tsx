"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, Send } from "lucide-react";
import { runSecurityAuditNow, sendSecurityReportNow, type RunResult } from "@/app/admin/(shell)/asfaleia/actions";

const POLL_MS = 20_000;
const POLL_FOR_MS = 7 * 60_000;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * «Τρέξε τώρα» (πλήρης έλεγχος, έως ~5′) και «Αποστολή report τώρα». Το κουμπί κλειδώνει από το πρώτο πάτημα (ref — πριν
 * καν ξαναζωγραφιστεί) και ο server έχει δικό του κλείδωμα. Αν η σύνδεση κοπεί πριν την απάντηση (π.χ. όριο 100″ του
 * Cloudflare), ο έλεγχος συνεχίζει στον server: η σελίδα ανανεώνεται κάθε 20″ μέχρι να εμφανιστεί το νέο report.
 * Το ίδιο όταν η σελίδα ανοίξει ενώ τρέχει ήδη έλεγχος (`runningSince`).
 */
export function SecurityActions({ latestFullId, runningSince, recipients }: { latestFullId: string | null; runningSince: string | null; recipients: number }) {
  const router = useRouter();
  const [running, startRun] = useTransition();
  const [sending, startSend] = useTransition();
  const busy = useRef(false);
  const [elapsed, setElapsed] = useState(0);
  const [msg, setMsg] = useState<RunResult | null>(null);
  const [waitFrom, setWaitFrom] = useState<{ id: string | null; at: number } | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);

  // χρονόμετρο όσο τρέχει
  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const iv = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [running]);

  // αναμονή αποτελέσματος από τον server (κομμένη σύνδεση ή έλεγχος που ξεκίνησε αλλού): νέο report = τέλος αναμονής
  const arrived = !!waitFrom && latestFullId !== waitFrom.id;
  const pendingWait = !!waitFrom && !arrived;
  const waiting = pendingWait || (!!runningSince && !running);
  useEffect(() => {
    if (!waiting) return;
    const iv = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(iv);
  }, [waiting, router]);
  useEffect(() => {
    if (!waitFrom || arrived) return;
    const t = setTimeout(() => { setWaitFrom(null); setMsg({ ok: false, message: "Δεν εμφανίστηκε νέο report μετά από 7′. Ανανεώστε τη σελίδα· αν δεν φαίνεται, ο έλεγχος απέτυχε (logs του server)." }); }, Math.max(0, POLL_FOR_MS - (Date.now() - waitFrom.at)));
    return () => clearTimeout(t);
  }, [waitFrom, arrived]);
  const shown: RunResult | null = arrived ? { ok: true, message: "Ο έλεγχος ολοκληρώθηκε.", reportId: latestFullId ?? undefined } : msg;

  const run = () => {
    if (busy.current || runningSince) return;
    busy.current = true;
    setMsg(null);
    setWaitFrom(null);
    setElapsed(0);
    const startId = latestFullId;
    startRun(async () => {
      try {
        const r = await runSecurityAuditNow();
        setMsg(r);
        router.refresh();
      } catch {
        setMsg({ ok: false, message: "Η σύνδεση με τον server διακόπηκε πριν τελειώσει ο έλεγχος — συνήθως συνεχίζει κανονικά. Η σελίδα θα ανανεωθεί μόνη της όταν βγει το αποτέλεσμα." });
        setWaitFrom({ id: startId, at: Date.now() });
      } finally {
        busy.current = false;
      }
    });
  };

  const send = () => {
    if (busy.current) return;
    if (!confirmSend) { setConfirmSend(true); return; }
    busy.current = true;
    setConfirmSend(false);
    setMsg(null);
    setWaitFrom(null);
    startSend(async () => {
      try { setMsg(await sendSecurityReportNow()); } catch { setMsg({ ok: false, message: "Η αποστολή απέτυχε (σύνδεση με τον server)." }); } finally { busy.current = false; }
    });
  };

  const locked = running || sending || !!runningSince || pendingWait;
  const btn = "inline-flex items-center justify-center gap-1.5 rounded-full font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 md:min-h-9 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer";
  return (
    <div className="grid gap-3 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={run} disabled={locked} aria-busy={running} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>
          {running || runningSince || pendingWait ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Play className="size-4" aria-hidden />}
          {running ? `Ο έλεγχος τρέχει… ${mmss(elapsed)}` : runningSince || pendingWait ? "Ο έλεγχος τρέχει…" : "Τρέξε τώρα"}
        </button>
        <button type="button" onClick={send} disabled={locked || !latestFullId || !recipients} aria-busy={sending} className={`${btn} border-2 ${confirmSend ? "border-eu-red text-eu-ink bg-eu-red/10" : "border-eu-navy text-eu-navy hover:bg-eu-navy hover:text-white"}`}>
          {sending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Send className="size-4" aria-hidden />}
          {sending ? "Αποστολή…" : confirmSend ? `Επιβεβαίωση: αποστολή σε ${recipients}` : "Αποστολή report τώρα"}
        </button>
        {confirmSend && !sending && <button type="button" onClick={() => setConfirmSend(false)} className={`${btn} text-eu-ink-3 hover:text-eu-ink`}>Άκυρο</button>}
      </div>
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] max-w-[80ch]">
        «Τρέξε τώρα»: πλήρης έλεγχος με όλους τους ελέγχους — <b className="text-eu-ink">μπορεί να πάρει έως 5′</b>· μόνο αναγνώσεις. Αν βρει κάτι κρίσιμο, στέλνεται αμέσως ειδοποίηση.
        {" "}«Αποστολή report τώρα»: το email σύνοψης του τελευταίου πλήρους ελέγχου σε {recipients} {recipients === 1 ? "παραλήπτη" : "παραλήπτες"} (<Link href="/admin/settings/security" className="text-eu-blue font-bold hover:underline">Ρυθμίσεις → Ασφάλεια</Link>).
      </p>
      {runningSince && !running && <p className="m-0 text-eu-ink text-[length:var(--fs-14)]" role="status">Τρέχει πλήρης έλεγχος από {new Date(runningSince).toLocaleTimeString("el-GR", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit" })} — η σελίδα ανανεώνεται μόνη της.</p>}
      <div aria-live="polite" className="min-w-0">
        {shown && (
          <p className={`m-0 rounded-xl border px-3 py-2 text-[length:var(--fs-14)] text-eu-ink break-words ${shown.ok ? "border-eu-green/40 bg-eu-green/10" : "border-eu-amber/60 bg-eu-amber/10"}`}>
            {shown.message}
            {shown.reportId && <> <Link href={`/admin/asfaleia/${shown.reportId}`} className="text-eu-blue font-bold hover:underline">Άνοιγμα αναφοράς</Link></>}
          </p>
        )}
      </div>
    </div>
  );
}
