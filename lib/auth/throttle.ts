/**
 * Προστασία της σύνδεσης διαχείρισης από δοκιμές κωδικών (brute force): μετρώνται οι αποτυχημένες προσπάθειες των
 * τελευταίων 15′ ανά email και ανά IP (LoginEvent). Πάνω από το όριο η φόρμα απαντά «δοκίμασε σε λίγα λεπτά» χωρίς
 * να ελέγξει τον κωδικό — ούτε σωστός κωδικός περνά μέχρι να λήξει το παράθυρο.
 */
export const LOGIN_LIMITS = { windowMin: 15, perEmail: 8, perIp: 25 } as const;

export const loginBlocked = (f: { byEmail: number; byIp: number }) => f.byEmail >= LOGIN_LIMITS.perEmail || f.byIp >= LOGIN_LIMITS.perIp;
