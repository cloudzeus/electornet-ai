import { gsmGreek, gsmLength } from "../sms/gsm";

/**
 * Το SMS της υπενθύμισης (αποστολέας «EURONICS»), σε GSM-7 (κεφαλαία ελληνικά χωρίς τόνους) και έως 160 χαρακτήρες: το όνομα της συσκευής
 * κόβεται σε ολόκληρες λέξεις όσο χρειάζεται. Ο σύνδεσμος μένει ως έχει (περιέχει υπογραφή).
 */
export function reminderSms(device: string, until: Date, price: number | null, link: string): string {
  const d = until.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const offer = price ? `με ${String(price).replace(".", ",")} EUR` : "ΔΩΡΕΑΝ";
  const build = (dev: string) => `${gsmGreek(`Η εγγύηση ${dev} λήγει ${d}. Επέκταση +2 έτη ${offer}:`)} ${link} ${gsmGreek("Διακοπή στον ίδιο σύνδεσμο")}`;
  let dev = gsmGreek(device).replace(/\s+/g, " ").trim();
  // κόβουμε ολόκληρες λέξεις από το τέλος· αν δεν χωράει ούτε η μάρκα, μένει «της συσκευής σου»
  const words = dev.split(" ");
  while (words.length > 1 && (gsmLength(build(words.join(" "))) ?? 999) > 160) words.pop();
  dev = words.join(" ");
  if ((gsmLength(build(dev)) ?? 999) > 160) dev = gsmGreek("της συσκευής σου");
  return build(dev);
}
