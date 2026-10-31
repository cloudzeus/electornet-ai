"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { setPasswordFromLink } from "@/app/synergaton/actions";
import { btn, Callout } from "./ui";
import { PasswordFields, passwordValid } from "./PasswordFields";

export function SetPassword({ token, email, base }: { token: string; email: string; base: string }) {
  const router = useRouter();
  const [p, setP] = useState(""), [c, setC] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ok = passwordValid(p, c, email);
  return (
    <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); if (!ok) return; start(async () => { setErr(null); const r = await setPasswordFromLink(token, p); if (r.ok) { router.replace(`${base}/ksekinima?welcome=1`); router.refresh(); } else setErr(r.error); }); }}>
      {err && <Callout tone="bad">{err}</Callout>}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <PasswordFields email={email} value={p} confirm={c} onChange={setP} onConfirm={setC} />
      <button type="submit" disabled={!ok || pending} className={`${btn("primary", "lg")} w-full`}>{pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <KeyRound className="size-5" aria-hidden />}Αποθήκευση και είσοδος</button>
    </form>
  );
}
