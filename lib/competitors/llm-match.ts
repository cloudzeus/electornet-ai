// Ταίριασμα με AI για ό,τι δεν βρήκε ο κωδικός μοντέλου. Η επιλογή του AI είναι πάντα πρόταση: auto μόνο αν το EAN που
// διαβάζουμε μετά είναι ίδιο (αυτό το αποφασίζει το decidePrice). Πρώτα Claude (ρητό αίτημα χρήστη), εφεδρεία OpenRouter/DeepSeek.
import "server-only";
import { chat, getAi, overBudget, type ChatMessage } from "@/lib/ai/openrouter";
import { pickFrom, type KotItem } from "./kotsovolos/core";

const SYS = 'Ταιριάζεις προϊόντα ηλεκτρικών συσκευών μεταξύ δύο καταστημάτων. Ίδιο προϊόν = ίδια μάρκα ΚΑΙ ίδιο μοντέλο (ίδια χωρητικότητα/μέγεθος/μνήμη). Μην μαντεύεις: αν δεν είσαι σίγουρος, pick=null. Απάντηση μόνο JSON: {"pick": αριθμός ή null, "why": σύντομα}';

/** Ημερήσιο όριο: σταματά το βήμα AI, όχι την εργασία. */
export class AiStop extends Error {}

export async function aiPick(o: { title: string; brand: string; model: string | null; category: string | null }, cands: KotItem[]): Promise<{ pick: { item: KotItem; why: string } | null; costUsd: number }> {
  const cfg = await getAi();
  if (!cfg) throw new AiStop("AI: δεν έχει ρυθμιστεί");
  if (await overBudget(cfg)) throw new AiStop("AI: εξαντλήθηκε το ημερήσιο όριο κόστους"); // το override του Claude δεν ελέγχει το όριο μόνο του
  const messages: ChatMessage[] = [
    { role: "system", content: SYS },
    { role: "user", content: `Δικό μας: ${o.title} (μάρκα ${o.brand}, κωδικός ${o.model ?? "—"}, κατηγορία ${o.category ?? "—"})\nΥποψήφια του Κωτσόβολου (URL slug):\n${cands.map((c, i) => `${i + 1}. ${c.path}/${c.last}`).join("\n")}` },
  ];
  const base = { feature: "competitors-match", messages, json: true, temperature: 0, reasoning: "low" as const, maxTokens: 300 };
  let r;
  try {
    if (!cfg.anthropicKey) throw new Error("χωρίς κλειδί Claude");
    r = await chat({ ...base, override: { apiKey: cfg.anthropicKey, model: "claude-sonnet-5-5" } });
  } catch (e) {
    if (cfg.anthropicKey) console.warn("[competitor] Claude απέτυχε, συνεχίζει με DeepSeek:", (e as Error).message);
    try { r = await chat({ ...base, model: "deepseek/deepseek-v4-flash" }); }
    catch (e) { if (/ημερήσιο όριο/.test((e as Error).message)) throw new AiStop((e as Error).message); throw e; }
  }
  return { pick: pickFrom(r.text, cands), costUsd: r.costUsd };
}
