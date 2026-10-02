/**
 * Τα blocks των landing pages προσφορών — κοινά για τον editor (browser) και τη βιτρίνα. Κάθε block έχει
 * σταθερό σχήμα props· ο editor δείχνει φόρμα ανά τύπο, η βιτρίνα έναν renderer ανά τύπο.
 */
export type BlockType = "hero" | "countdown" | "products" | "categories" | "coupon" | "text" | "banner" | "terms" | "faq";

export interface HeroProps { kicker?: string; title: string; subtitle?: string; image?: string; ctaLabel?: string; ctaHref?: string; tone?: "navy" | "yellow" | "red" }
export interface CountdownProps { label?: string }
export interface ProductsProps { title?: string; source: "promotion" | "category" | "manual"; categoryId?: string; ids?: string[]; limit?: number; sort?: "discount" | "price-asc" | "price-desc" }
export interface CategoriesProps { title?: string; ids: string[] }
export interface CouponProps { code: string; text?: string }
export interface TextProps { title?: string; body: string }
export interface BannerProps { image: string; alt?: string; href?: string }
export interface TermsProps { title?: string }
export interface FaqProps { title?: string; items: { q: string; a: string }[] }

export type Block =
  | { id: string; type: "hero"; props: HeroProps }
  | { id: string; type: "countdown"; props: CountdownProps }
  | { id: string; type: "products"; props: ProductsProps }
  | { id: string; type: "categories"; props: CategoriesProps }
  | { id: string; type: "coupon"; props: CouponProps }
  | { id: string; type: "text"; props: TextProps }
  | { id: string; type: "banner"; props: BannerProps }
  | { id: string; type: "terms"; props: TermsProps }
  | { id: string; type: "faq"; props: FaqProps };

export const BLOCKS: { type: BlockType; label: string; help: string; make: () => Block["props"] }[] = [
  { type: "hero", label: "Hero", help: "Μεγάλος τίτλος με εικόνα και κουμπί", make: () => ({ title: "Τίτλος προσφοράς", subtitle: "", tone: "navy", ctaLabel: "Δες τις προσφορές", ctaHref: "#proionta" }) },
  { type: "countdown", label: "Αντίστροφη μέτρηση", help: "Η πραγματική λήξη της προσφοράς", make: () => ({ label: "Λήγει σε" }) },
  { type: "products", label: "Προϊόντα", help: "Της προσφοράς, μιας κατηγορίας ή επιλεγμένα", make: () => ({ title: "Τα προϊόντα της προσφοράς", source: "promotion", limit: 24, sort: "discount" }) },
  { type: "categories", label: "Κατηγορίες", help: "Πλακίδια κατηγοριών", make: () => ({ title: "Διάλεξε κατηγορία", ids: [] }) },
  { type: "coupon", label: "Κουπόνι", help: "Κωδικός με κουμπί αντιγραφής", make: () => ({ code: "", text: "Γράψε τον κωδικό στο καλάθι" }) },
  { type: "text", label: "Κείμενο", help: "Τίτλος και παράγραφος", make: () => ({ title: "", body: "" }) },
  { type: "banner", label: "Banner", help: "Εικόνα πλάτους σελίδας με σύνδεσμο", make: () => ({ image: "", alt: "", href: "" }) },
  { type: "terms", label: "Όροι", help: "Οι όροι της προσφοράς όπως ισχύουν", make: () => ({ title: "Όροι προσφοράς" }) },
  { type: "faq", label: "Συχνές ερωτήσεις", help: "Ερωτήσεις και απαντήσεις", make: () => ({ title: "Συχνές ερωτήσεις", items: [{ q: "", a: "" }] }) },
];

export const SLOTS: { key: string; label: string; size: string }[] = [
  { key: "home-strip", label: "Αρχική · λωρίδα πριν το κάτω μέρος", size: "1600×300 (κινητό 800×400)" },
  { key: "offers-top", label: "Σελίδα προσφορών · πάνω", size: "1600×300" },
  { key: "listing-top", label: "Λίστες κατηγοριών · πάνω από τα προϊόντα", size: "1600×200" },
  { key: "pdp-below-buybox", label: "Σελίδα προϊόντος · κάτω από την αγορά", size: "800×300" },
  { key: "cart-top", label: "Καλάθι · πάνω", size: "1600×200" },
];

export const newBlockId = () => Math.random().toString(36).slice(2, 10);
