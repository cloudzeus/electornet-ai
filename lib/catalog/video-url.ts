/**
 * Σύνδεσμοι βίντεο προϊόντος: YouTube, Vimeo ή απευθείας αρχείο (.mp4 / .webm). Κρατάμε μία κανονική μορφή ανά βίντεο
 * (ώστε το ίδιο βίντεο να μη μπαίνει δύο φορές) και φτιάχνουμε το embed χωρίς cookies παρακολούθησης.
 * Καθαρή συνάρτηση — τρέχει σε server και browser.
 */
export type VideoProvider = "youtube" | "vimeo" | "file";
export interface VideoRef { provider: VideoProvider; id: string; url: string; embed: string; thumb: string | null }

export function parseVideoUrl(raw: string): VideoRef | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let yt: string | null = null;
  if (host === "youtu.be") yt = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    yt = u.searchParams.get("v") ?? /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname)?.[1] ?? null;
  }
  if (yt && /^[\w-]{11}$/.test(yt)) return { provider: "youtube", id: yt, url: `https://www.youtube.com/watch?v=${yt}`, embed: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0`, thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` };
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = /\/(?:video\/)?(\d{6,12})(?:$|[/?#])/.exec(u.pathname)?.[1];
    if (id) return { provider: "vimeo", id, url: `https://vimeo.com/${id}`, embed: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1`, thumb: null };
  }
  if (/\.(mp4|webm)$/i.test(u.pathname) && u.protocol === "https:") return { provider: "file", id: u.toString(), url: u.toString(), embed: u.toString(), thumb: null };
  return null;
}
