import type { Check } from "../types";
import { staffCheck } from "./staff";
import { loginsCheck } from "./logins";
import { settingsChangesCheck } from "./settings-changes";
import { contentCheck } from "./content";
import { bunnyCheck } from "./bunny";

/** Μητρώο ελέγχων — με αυτή τη σειρά εμφανίζονται στην αναφορά. Νέος έλεγχος → μία γραμμή εδώ. */
export const CHECKS: Check[] = [staffCheck, loginsCheck, settingsChangesCheck, contentCheck, bunnyCheck];
