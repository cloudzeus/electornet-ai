"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { changeMyPassword } from "@/app/synergaton/actions";
import { Callout, focusRing } from "./ui";
import { PasswordFields, passwordValid } from "./PasswordFields";
import { ConfirmModal, Field, inputCls, Wizard, WizardNav, type WizardStep } from "./wizard";

const STEPS: WizardStep[] = [
  { key: "current", title: "Τρέχων κωδικός", hint: "Για ασφάλεια, πρώτα ο κωδικός που χρησιμοποιείτε τώρα." },
  { key: "next", title: "Νέος κωδικός", hint: "Οι κανόνες τσεκάρονται καθώς γράφετε." },
];

/** Αλλαγή κωδικού σε δύο βήματα· μετά την αλλαγή όλες οι άλλες συνεδρίες αποσυνδέονται. */
export function ChangePassword({ email }: { email: string }) {
  const [cur, setCur] = useState(0);
  const [current, setCurrent] = useState(""), [p, setP] = useState(""), [c, setC] = useState("");
  const [show, setShow] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const ok = passwordValid(p, c, email) && p !== current;
  const save = () => start(async () => {
    const r = await changeMyPassword(current, p);
    setConfirm(false);
    if (r.ok) { setMsg({ ok: true, text: "Ο κωδικός άλλαξε. Οι συνδέσεις από άλλες συσκευές αποσυνδέθηκαν." }); setCurrent(""); setP(""); setC(""); setCur(0); }
    else { setMsg({ ok: false, text: r.error }); if (r.field === "current") setCur(0); }
  });
  return (
    <>
      <Wizard title="Αλλαγή κωδικού" steps={STEPS} current={cur} done={new Set(cur ? ["current"] : [])} onStep={setCur}
        footer={<WizardNav onBack={cur ? () => setCur(0) : undefined} onNext={cur ? () => setConfirm(true) : () => setCur(1)} nextDisabled={cur ? !ok : current.length < 1} busy={pending} nextLabel={cur ? "Αλλαγή κωδικού" : "Συνέχεια"} note={cur && p && p === current ? "Ο νέος κωδικός πρέπει να διαφέρει" : undefined} />}>
        {msg && <div className="mb-4"><Callout tone={msg.ok ? "good" : "bad"}>{msg.text}</Callout></div>}
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        {cur === 0 ? (
          <div className="max-w-[28rem]">
            <Field id="cur-pw" label="Τρέχων κωδικός">
              <div className="relative">
                <input id="cur-pw" type={show ? "text" : "password"} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={`${inputCls()} pr-12`} />
                <button type="button" onClick={() => setShow(!show)} className={`absolute right-0.5 top-1/2 -translate-y-1/2 grid place-items-center size-11 rounded-full text-eu-ink-3 ${focusRing}`} aria-label={show ? "Απόκρυψη" : "Εμφάνιση"}>{show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}</button>
              </div>
            </Field>
          </div>
        ) : <div className="max-w-[28rem]"><PasswordFields email={email} value={p} confirm={c} onChange={setP} onConfirm={setC} idPrefix="np" /></div>}
      </Wizard>
      <ConfirmModal open={confirm} title="Αλλαγή κωδικού;" confirmLabel="Ναι, αλλαγή" busy={pending} onConfirm={save} onCancel={() => setConfirm(false)}>
        <p className="m-0">Θα αποσυνδεθείτε από όλες τις άλλες συσκευές. Εδώ μένετε συνδεδεμένοι.</p>
      </ConfirmModal>
    </>
  );
}
