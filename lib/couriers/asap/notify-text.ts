import { gsmGreek } from "../../sms/gsm";

/**
 * Η ειδοποίηση «έρχεται» όταν η ASAP βάλει το δέμα σε διαδρομή (ο λογαριασμός ASAP δεν στέλνει δικά του SMS / Viber).
 * Καθαρές συναρτήσεις· ώρες σε ώρα Ελλάδας.
 */
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" });
const TIME = new Intl.DateTimeFormat("el-GR", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit", hour12: false });
const DATE = new Intl.DateTimeFormat("el-GR", { timeZone: "Europe/Athens", weekday: "short", day: "numeric", month: "numeric" });

/** «σήμερα γύρω στις 14:30» / «αύριο γύρω στις 10:00» / «Πέμ 6/11 γύρω στις 10:00» — null χωρίς ώρα. */
export function etaPhrase(eta: Date | null, now = new Date()): string | null {
  if (!eta) return null;
  const day = (d: Date) => DAY.format(d);
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const when = day(eta) === day(now) ? "σήμερα" : day(eta) === day(tomorrow) ? "αύριο" : DATE.format(eta);
  return `${when} γύρω στις ${TIME.format(eta)}`;
}

/** SMS σε GSM-7 (κεφαλαία χωρίς τόνους)· ο σύνδεσμος μένει ως έχει. Ο αποστολέας είναι ήδη «EURONICS». */
export function outForDeliverySms(number: string, eta: Date | null, url: string, now = new Date()): string {
  const when = etaPhrase(eta, now);
  return `${gsmGreek(`Η παραγγελία σας ${number} ${when ? `φτάνει ${when}` : "είναι καθ' οδόν"}. Δείτε πού είναι ο οδηγός:`)} ${url}`;
}
