/**
 * Μοντέλα AI του καταλόγου (στοιχεία από το internet, περιγραφές), μέσω OpenRouter:
 *  - κείμενο (ανάγνωση σελίδας, περιγραφές marketing): DeepSeek V4 Flash — ~$0,001 ανά κλήση. Το Claude μένει για ειδικές περιπτώσεις.
 *  - αναζήτηση στο web: Perplexity Sonar, το φθηνότερο με αναζήτηση (~$0,006 ανά κλήση· το DeepSeek δεν ψάχνει στο web).
 * Αλλάζουν με CATALOG_TEXT_MODEL / ENRICH_WEB_MODEL.
 */
export const CATALOG_TEXT_MODEL = process.env.CATALOG_TEXT_MODEL || "deepseek/deepseek-v4-flash";
export const WEB_SEARCH_MODEL = process.env.ENRICH_WEB_MODEL || "perplexity/sonar";
