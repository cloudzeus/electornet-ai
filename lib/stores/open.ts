/** Human label for a store's `openUntil` ("21:00" | "κλειστά" | "—"). Shared by every store card. */
export const isOpenToday = (openUntil: string) => /^\d{1,2}:\d{2}$/.test(openUntil);
export const openLabel = (openUntil: string) => (isOpenToday(openUntil) ? `Ανοιχτό έως ${openUntil}` : "Κλειστό σήμερα");
