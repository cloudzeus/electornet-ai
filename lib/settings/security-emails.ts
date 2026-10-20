import { DEFAULT_SECURITY_EMAILS, MAX_SECURITY_EMAILS } from "./schema";

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

/**
 * Παραλήπτες της αναφοράς ασφαλείας από το κείμενο της ρύθμισης: χωρισμός με κόμμα / ερωτηματικό / νέα γραμμή,
 * κεφαλαία → πεζά, μόνο έγκυρα email, χωρίς διπλότυπα, έως MAX_SECURITY_EMAILS. Κενό ή όλα άκυρα → προεπιλογή.
 */
export function parseSecurityEmails(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? "").split(/[,;\n]/)) {
    const e = part.trim().toLowerCase();
    if (EMAIL.test(e) && !out.includes(e)) out.push(e);
    if (out.length >= MAX_SECURITY_EMAILS) break;
  }
  return out.length ? out : [DEFAULT_SECURITY_EMAILS];
}
