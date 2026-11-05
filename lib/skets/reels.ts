import { INTRO_VIDEO } from "@/lib/partner-portal/intro";

/**
 * Τα βίντεο γύρω από το σκετς, σε πλήρη οθόνη: πριν (η συνεργασία Euronics & DGSOFT, motion-studio
 * `Euronics-DgPartnership-4k`, 1080p στο Bunny) και μετά (το εισαγωγικό της πύλης συνεργατών).
 * Enter: παίζει το βίντεο → ξανά Enter πάει στον Ερμή. Στο τέλος του σκετς Enter → το βίντεο των συνεργατών.
 */
export const REELS = {
  intro: { src: "https://euronics.b-cdn.net/videos/skets/dg-partnership-4a1890a269.mp4", poster: "https://euronics.b-cdn.net/videos/skets/dg-partnership-poster-34ed2d3ede.jpg" },
  outro: { src: INTRO_VIDEO.hq.landscape.mp4, poster: INTRO_VIDEO.hq.landscape.poster },
};
