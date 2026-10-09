import "server-only";
import type { PageLayout } from "./zones";

/**
 * The homepage as marketing would store it in the CMS: 12 numbered zones
 * of the «Αρχική — Πρόταση v2» design, each a widget instance with props,
 * schedule and visibility. Replace with a Prisma read (Page → Zone →
 * Widget) without touching the renderer.
 */
export async function getHomeLayout(): Promise<PageLayout> {
  return {
    id: "home",
    path: "/",
    title: "Αρχική",
    updatedAt: "2026-09-08T09:00:00+03:00",
    zones: [
      {
        id: "announcement",
        label: "Ζώνη όρων (πάνω από το header)",
        slot: "above-header",
        widgets: [
          {
            id: "terms-rail",
            type: "announcement-bar",
            zoneNo: 1,
            props: {
              left: ["350 καταστήματα", "Δωρεάν μεταφορά εντός περιφέρειας", "Δόσεις με ή χωρίς κάρτα"],
              right: ["14 ημέρες υπαναχώρηση"],
              accent: { label: "Παρακολούθηση παραγγελίας", href: "/entopismos" },
            },
          },
        ],
      },
      {
        id: "hero",
        label: "Bento hero",
        slot: "main",
        widgets: [
          {
            id: "hero-main",
            type: "bento-hero",
            zoneNo: 4,
            // Μόνιμο: το περιεχόμενο το ορίζουν τα slides. (Ως «Καλοκαίρι 2026» είχε λήξη 30/9 και η αρχική έμεινε χωρίς hero.)
            label: "Κεντρικά slides",
            props: { slides: "all", intervalMs: 6000 },
          },
        ],
      },
      {
        id: "ticker",
        label: "Κίτρινο ticker εμπορικών μηνυμάτων",
        slot: "main",
        widgets: [
          {
            id: "ticker-usp",
            type: "ticker",
            zoneNo: 5,
            props: {
              items: [
                "Δωρεάν μεταφορά συσκευών εντός περιφέρειας",
                "Δόσεις χωρίς κάρτα έως 24 μήνες",
                "Επίσημη εγγύηση αντιπροσωπείας",
                "Φύλαξη συσκευών μέχρι να ετοιμαστεί ο χώρος σου",
                "Παραλαβή σε 2 ώρες",
              ],
            },
          },
        ],
      },
      {
        id: "catalog",
        label: "Τυπογραφικό πλέγμα κατηγοριών",
        slot: "main",
        widgets: [{ id: "cat-grid", type: "category-grid", zoneNo: 6, props: { featured: "clima" } }],
      },
      {
        id: "deals",
        label: "Προσφορές με πραγματική λήξη",
        slot: "main",
        widgets: [
          {
            id: "weekly-deals",
            type: "deals-rail",
            zoneNo: 7,
            props: { title: "Προσφορές της εβδομάδας" },
            query: { kind: "tag", value: "weekly-deals", limit: 4, pin: ["p-inventor-ikura"] },
          },
          {
            id: "campaigns",
            type: "campaign-spotlight",
            zoneNo: 8,
            label: "Καμπάνιες κατασκευαστών (key visuals από euronics.gr)",
            props: {
              kicker: "Τρέχουν τώρα",
              title: "Καμπάνιες κατασκευαστών",
              link: { label: "Όλες οι προσφορές", href: "/prosfores" },
              campaigns: [
                { id: "samsung-vision-ai", brand: "Samsung", title: "Samsung Vision AI is here", text: "QLED · Neo QLED · Neo QLED 8K · OLED · The Frame.", cta: "Ανακάλυψε τις νέες AI τηλεοράσεις", href: "/k/eikona-ixos/tileoraseis", image: "/img/campaigns/samsung-vision-ai.jpg", alt: "Samsung Vision AI — QLED, Neo QLED, Neo QLED 8K, OLED, The Frame" },
                { id: "samsung-oled-s95f", brand: "Samsung", title: "OLED S95F", text: "Απογείωσε την κινηματογραφική σου εμπειρία, με Glare Free Technology.", cta: "Δες τις OLED S95F", href: "/k/eikona-ixos/tileoraseis", image: "/img/campaigns/samsung-oled-s95f.jpg", alt: "Samsung OLED S95F — Απογείωσε την κινηματογραφική σου εμπειρία" },
                { id: "miele-25y-motor", brand: "Miele", title: "25 χρόνια εγγύηση μοτέρ", text: "Σε πλυντήρια, στεγνωτήρια και πλυντήρια-στεγνωτήρια Miele, από 1 Οκτωβρίου 2025.", cta: "Δες τα πλυντήρια Miele", href: "/k/leykes-syskeyes/plyntiria", image: "/img/campaigns/miele-25y-motor.jpg", alt: "Miele — 25 χρόνια εγγύηση μοτέρ" },
                { id: "dell-monitors", brand: "Dell", title: "Οθόνες κορυφαίων επιδόσεων", text: "S2721HN · S2421HN · E2221HN · E2421HN.", cta: "Δες τις οθόνες Dell", href: "/k/computing/othones", image: "/img/campaigns/dell-monitors.jpg", alt: "Dell Οθόνες Κορυφαίων Επιδόσεων" },
              ],
            },
          },
        ],
      },
      {
        id: "services",
        label: "Σκούρη ζώνη υπηρεσιών",
        slot: "main",
        widgets: [{ id: "services-6", type: "services-band", zoneNo: 9, props: { limit: 6 } }],
      },
      {
        id: "stores",
        label: "Εντοπισμός καταστήματος",
        slot: "main",
        widgets: [{ id: "store-finder", type: "store-finder", zoneNo: 10, props: {} }],
      },
      {
        id: "guides",
        label: "Οδηγοί αγοράς",
        slot: "main",
        widgets: [
          { id: "smart-guides", type: "smart-guides", zoneNo: 11, props: {} },
          { id: "guides-3", type: "guides", zoneNo: 11, props: {}, visibility: { hideOnSaveData: true } },
        ],
      },
      {
        id: "news",
        label: "Νέα & ανακοινώσεις",
        slot: "main",
        widgets: [{ id: "news-3", type: "news-band", zoneNo: 12, props: { limit: 3 } }],
      },
      {
        id: "newsletter",
        label: "Newsletter",
        slot: "pre-footer",
        widgets: [{ id: "newsletter", type: "newsletter", zoneNo: 13, props: {} }],
      },
    ],
  };
}
