/** Ρόλοι επαφών μέλους (PartnerContact.role). */
export const CONTACT_ROLES = { owner: "Ιδιοκτήτης / υπεύθυνος", it: "Τεχνικός / IT", sales: "Πωλήσεις", accounting: "Λογιστήριο", other: "Άλλο" } as const;
export type ContactRole = keyof typeof CONTACT_ROLES;
export const roleLabel = (r: string | null | undefined) => (r && r in CONTACT_ROLES ? CONTACT_ROLES[r as ContactRole] : r ?? "");
