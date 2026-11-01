/**
 * Εισαγωγικό video της πύλης (motion-studio `Euronics-PortalIntro-*`), στο Bunny CDN: 720p για κινητά, 1080p υψηλής
 * ποιότητας (crf 17 / 26) για υπολογιστή και προβολικό, 4K για λήψη.
 * Νέο render → νέο hash στο όνομα → ενημέρωσε τα URLs εδώ.
 */
export const INTRO_VIDEO = {
  landscape: { mp4: "https://euronics.b-cdn.net/videos/synergaton/intro-landscape-a00e531b76.mp4", webm: "https://euronics.b-cdn.net/videos/synergaton/intro-landscape-ba931f4e30.webm", poster: "https://euronics.b-cdn.net/videos/synergaton/intro-landscape-poster-720a0a6607.jpg" },
  portrait: { mp4: "https://euronics.b-cdn.net/videos/synergaton/intro-portrait-f93f5e8a72.mp4", webm: "https://euronics.b-cdn.net/videos/synergaton/intro-portrait-538a55d816.webm", poster: "https://euronics.b-cdn.net/videos/synergaton/intro-portrait-poster-e32c8abbd0.jpg" },
  /** 1080p για παρουσιάσεις / social (δεν φορτώνεται στη σελίδα) */
  master: { mp4: "https://euronics.b-cdn.net/videos/synergaton/intro-master-c5f7ecb0b2.mp4", webm: "https://euronics.b-cdn.net/videos/synergaton/intro-master-92d18ee8c1.webm", poster: "https://euronics.b-cdn.net/videos/synergaton/intro-master-poster-8864a9dbe3.jpg" },
  /** 1080p υψηλής ποιότητας (οθόνες από 1024px, προβολικό) */
  hq: {
    landscape: { mp4: "https://euronics.b-cdn.net/videos/synergaton/intro-landscape-hq-15a2bd539f.mp4", webm: "https://euronics.b-cdn.net/videos/synergaton/intro-landscape-hq-3a6d0faaab.webm", poster: "https://euronics.b-cdn.net/videos/synergaton/intro-landscape-hq-poster-8864a9dbe3.jpg" },
    portrait: { mp4: "https://euronics.b-cdn.net/videos/synergaton/intro-portrait-hq-7248fc6db1.mp4", webm: "https://euronics.b-cdn.net/videos/synergaton/intro-portrait-hq-1cba769afa.webm", poster: "https://euronics.b-cdn.net/videos/synergaton/intro-portrait-hq-poster-b152cea6b6.jpg" },
  },
  /** 3840×2160 για προβολή χωρίς σύνδεση (λήψη από το κουμπί «4K») */
  uhd: "https://euronics.b-cdn.net/videos/synergaton/euronics-pyli-synergaton-4k-2be081a945.mp4",
};
