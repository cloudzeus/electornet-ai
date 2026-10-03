/**
 * Πώς ανοίγει το AR σε αυτή τη συσκευή:
 * - `quicklook`: iPhone/iPad σε Safari, Chrome, Edge, Firefox, Google — AR Quick Look από USDZ
 * - `sceneviewer`: Android — Scene Viewer της Google από GLB (με επιστροφή στην προεπισκόπηση 3D αν λείπει)
 * - `inapp`: browser μέσα σε εφαρμογή (Instagram, Facebook, TikTok…) — το AR δεν ανοίγει εκεί· οδηγούμε στον κανονικό browser
 * - `desktop`: προεπισκόπηση 3D και QR για συνέχεια στο κινητό
 * Ίδια λογική με το model-viewer: σε WKWebView το Quick Look δουλεύει μόνο στους γνωστούς browsers.
 */
export type ArEnv = "quicklook" | "sceneviewer" | "inapp-ios" | "inapp-android" | "desktop";
export function detectEnv(nav: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> = navigator, win: unknown = window, doc: Pick<Document, "createElement"> = document): ArEnv {
  const ua = nav.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const inAppUa = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|LinkedInApp|Snapchat|TikTok|musical_ly|BytedanceWebview|Twitter|Pinterest|MicroMessenger|WhatsApp|Viber/i.test(ua);
  if (/Android/i.test(ua)) return inAppUa ? "inapp-android" : "sceneviewer";
  if (ios) {
    if (inAppUa) return "inapp-ios";
    const wk = !!(win as { webkit?: { messageHandlers?: unknown } }).webkit?.messageHandlers;
    const ok = wk ? /CriOS\/|EdgiOS\/|FxiOS\/|GSA\/|DuckDuckGo\//.test(ua) : !!doc.createElement("a").relList?.supports?.("ar");
    return ok ? "quicklook" : "inapp-ios";
  }
  return "desktop";
}
