import "server-only";
import { getSetting } from "@/lib/settings/store";
import type { EmailCtx } from "./layout-core";

// Η καθαρή λογική (BRAND, blocks, renderEmail) ζει στο layout-core.ts ώστε να δοκιμάζεται χωρίς server-only· εδώ μένει μόνο ό,τι διαβάζει ρυθμίσεις.
export * from "./layout-core";

export async function emailCtx(extra: Partial<EmailCtx> = {}): Promise<EmailCtx> {
  const { data } = await getSetting("general").catch(() => ({ data: {} as Record<string, string> }));
  const baseUrl = String(data.baseUrl || process.env.AUTH_URL || "https://www.euronics.gr").replace(/\/$/, "");
  // Το λογότυπο πρέπει να είναι απόλυτο URL που φτάνει ο email client. Το
  // `baseUrl` δείχνει στο ζωντανό euronics.gr, που ΔΕΝ φιλοξενεί τα δικά μας
  // assets — γι' αυτό προεπιλογή είναι το αντίγραφο στο CDN.
  // ΔΥΟ διαφορετικές βάσεις:
  //  · baseUrl  = το site που βλέπει ο πελάτης (σύνδεσμοι στα κουμπιά)
  //  · assetUrl = ΠΟΥ ΤΡΕΧΕΙ Η ΕΦΑΡΜΟΓΗ ΜΑΣ, από όπου σερβίρονται οι εικόνες
  // Όσο το euronics.gr δείχνει το παλιό site, τα δύο διαφέρουν — γι' αυτό
  // κάθε σχετική εικόνα έσπαγε (404 στο ζωντανό domain).
  const assetUrl = String(data.emailAssetUrl || process.env.EMAIL_ASSET_URL || process.env.AUTH_URL || baseUrl).replace(/\/$/, "");
  const logoUrl = String(data.emailLogoUrl || process.env.EMAIL_LOGO_URL || "https://euronics.b-cdn.net/brand/euronics-logo-white.png");
  return { baseUrl, assetUrl, logoUrl, siteName: String(data.siteName || "Euronics"), phone: String(data.phone || "210 483 5143"), email: String(data.email || "info@euronics.gr"), address: String(data.address || "Δαμάσκου 2 Σταμάτη 12, 135 71 Αχαρνές"), legalName: String(data.legalName || "MEGA ELECTRICS ΑΕΒΕ"), year: new Date().getFullYear(), ...extra };
}
