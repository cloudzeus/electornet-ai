import { parseKeyvotoUrl } from "@/lib/keyvoto/rows";

/**
 * **Από πού έρχεται ένα feed.** Ο ίδιος οδηγός εξυπηρετεί δύο πηγές: το XML ενός προμηθευτή και το Keyvoto PIM. Η πηγή
 * φαίνεται από τη «διεύθυνση» και αποθηκεύεται στο `SupplierFeed.format`, ώστε ένας προμηθευτής να μπορεί να έχει
 * **και τα δύο** χωρίς το ένα να πατάει το άλλο.
 */

export const FEED_FORMATS = ["xml", "keyvoto"] as const;
export type FeedFormat = (typeof FEED_FORMATS)[number];

export const feedFormat = (url: string): FeedFormat => (parseKeyvotoUrl(url) ? "keyvoto" : "xml");

export const feedSourceLabel = (f: FeedFormat) => (f === "keyvoto" ? "Keyvoto PIM" : "XML feed");
