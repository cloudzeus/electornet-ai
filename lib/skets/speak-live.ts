import "server-only";
import { after } from "next/server";
import { sendLive } from "./bus";
import { liveSentences } from "./script";
import { SKETS_VOICE } from "./script";
import { speakInline } from "@/lib/voice/tts";
import type { LiveEv } from "./types";

/** Η απάντηση γράφεται για οθόνη· για τη φωνή: «κλάση A++» → «κλάση άλφα δύο συν», όπως και στο σενάριο. */
const LETTER: Record<string, string> = { A: "άλφα", B: "βήτα", C: "γάμα", D: "δέλτα", E: "έψιλον", F: "ζήτα", G: "ήτα" };
const PLUS = ["", " συν", " δύο συν", " τρία συν"];
export const spokenLive = (t: string) => t.replace(/(κλάσης?\s+)([A-G])(\+{0,3})(?![A-Za-z])/gi, (_, pre: string, l: string, p: string) => `${pre}${LETTER[l.toUpperCase()]}${PLUS[p.length]}`);

// ο ήχος δεν ταξιδεύει μέσα στο SSE (data: URL ~1 MB): μένει στη μνήμη και η σκηνή τον παίρνει με GET /api/skets/ask?audio=
const ga = globalThis as unknown as { __sketsAudio?: Map<string, { mime: string; bytes: Buffer }> };
const audios = (ga.__sketsAudio ??= new Map());
function keepAudio(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);base64,([\s\S]*)$/);
  const id = crypto.randomUUID();
  if (m) audios.set(id, { mime: m[1], bytes: Buffer.from(m[2], "base64") });
  if (audios.size > 20) audios.delete(audios.keys().next().value!);
  return id;
}
export const liveAudio = (id: string) => audios.get(id) ?? null;

/** Εκφώνηση ανά πρόταση, παράλληλα: η πρώτη ακούγεται μόλις είναι έτοιμη, οι επόμενες μπαίνουν στη σειρά στη σκηνή. Επιστρέφει ms ως την πρώτη. */
export async function speakParts(ev: LiveEv, key: string): Promise<number> {
  const t0 = Date.now(), k = encodeURIComponent(key);
  const parts = liveSentences(ev.text ?? "");
  let first = 0;
  await Promise.all(parts.map(async (part, i) => {
    const v = await speakInline(spokenLive(part), SKETS_VOICE).catch(() => null);
    if (!v) return;
    if (v.persist) after(v.persist);
    const audio = v.result.audio ? `/api/skets/ask?audio=${keepAudio(v.result.audio)}&k=${k}` : v.result.url;
    if (i === 0) first = Date.now() - t0;
    sendLive({ ...ev, phase: "audio", audio, part: i, parts: parts.length });
  }));
  return first;
}
