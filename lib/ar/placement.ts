/**
 * Πώς μπαίνει κάθε συσκευή στον χώρο — προκαθορισμένο ανά κατηγορία, όπως στην πραγματικότητα:
 * σε ποια επιφάνεια (πάτωμα, έπιπλο/πάγκος, τοίχος), αν έχει βάση, πού κοιτά η πρόσοψη, και μια οδηγία για τον πελάτη.
 * Το AR αγκυρώνει σε οριζόντια επιφάνεια (πάτωμα, έπιπλο, πάγκος) ή σε κάθετη (τοίχος)· η πρόσοψη κοιτά πάντα το δωμάτιο
 * (+Z), η πλάτη προς τον τοίχο. Ο διαχειριστής μπορεί να αλλάξει την επιφάνεια ανά προϊόν (Διαχείριση → AR).
 */
export type Placement = "floor" | "wall";
export type Surface = "floor" | "furniture" | "counter" | "wall";

export interface PlacementProfile {
  /** επιφάνεια όπου μπαίνει συνήθως */
  surface: Surface;
  /** εναλλακτική (π.χ. τηλεόραση: έπιπλο ή τοίχος) — δεύτερο κουμπί για τον πελάτη */
  alt?: Surface;
  /** μοντέλο ειδικής μορφής: τηλεόραση = λεπτό πάνελ με οθόνη (με βάση στο έπιπλο, χωρίς στον τοίχο) */
  archetype?: "tv";
  /** τι λέμε στον πελάτη για το πού και πώς μπαίνει */
  hint: string;
}

const P = (surface: Surface, hint: string, extra: Partial<PlacementProfile> = {}): PlacementProfile => ({ surface, hint, ...extra });

/** Κανόνες με σειρά προτεραιότητας: το πρώτο που ταιριάζει στα slugs της κατηγορίας του προϊόντος. */
const RULES: [RegExp, PlacementProfile][] = [
  [/tileoras|^tv$|tv-/, P("furniture", "Η τηλεόραση μπαίνει σε έπιπλο TV με τη βάση της, με το κέντρο της οθόνης περίπου στο ύψος των ματιών όταν κάθεσαι (~1 μ.). Μπορείς να τη δεις και στον τοίχο.", { alt: "wall", archetype: "tv" })],
  [/othones-ypologiston|monitor/, P("furniture", "Η οθόνη μπαίνει στο γραφείο, περίπου ένα χέρι μακριά από τα μάτια.")],
  [/air-condition|klimatist/, P("wall", "Το κλιματιστικό τοποθετείται ψηλά στον τοίχο, περίπου 15–20 εκ. κάτω από το ταβάνι, μακριά από ντουλάπια και κουρτίνες.", { alt: "floor" })],
  [/aporrofitir/, P("wall", "Ο απορροφητήρας μπαίνει στον τοίχο πάνω από τις εστίες, 65–75 εκ. πάνω από αυτές.", { alt: "floor" })],
  [/thermosifon/, P("wall", "Ο θερμοσίφωνας κρεμιέται σε τοίχο που αντέχει το βάρος του γεμάτου, συνήθως στο μπάνιο.", { alt: "floor" })],
  [/psyg|katapsyk/, P("floor", "Το ψυγείο μπαίνει στο πάτωμα με την πλάτη στον τοίχο· άφησε ~5 εκ. πίσω και λίγο χώρο στα πλάγια για αερισμό, και χώρο να ανοίγει η πόρτα.")],
  [/plyntir|stegnot/, P("floor", "Το πλυντήριο μπαίνει στο πάτωμα με την πλάτη στον τοίχο, κοντά σε παροχή νερού και αποχέτευση· άφησε χώρο να ανοίγει η πόρτα.")],
  [/koyzin(?!akia)|kouzin|entoichiz/, P("floor", "Μπαίνει στο πάτωμα ή στη θέση της στα ντουλάπια, με την πλάτη στον τοίχο.")],
  [/foyrnoi-mikrokymaton|foyrnakia|michanes-kafe|syskeyes-mageirik|epitrapezies-esties|ergaleia-mageirik/, P("counter", "Μπαίνει στον πάγκο της κουζίνας, με την πλάτη προς τον τοίχο και λίγο χώρο γύρω για αερισμό.")],
  [/afygrant|ionist|ygrant|katharist|anemistir|thermantik/, P("floor", "Μπαίνει στο πάτωμα, με λίγο ελεύθερο χώρο γύρω για να κυκλοφορεί ο αέρας.")],
  [/ichos|home-cinema|blu-ray|playstation|gaming/, P("furniture", "Μπαίνει σε έπιπλο, κοντά στην τηλεόραση.")],
  [/skoyp/, P("floor", "Στο πάτωμα.")],
];
const DEFAULT = P("floor", "Μπαίνει στο πάτωμα, με την πρόσοψη προς το δωμάτιο.");

type Cat = { category?: string; subcategory?: string; path?: { slug: string }[] };
const slugsOf = (p: Cat) => [p.subcategory, p.category, ...(p.path?.map((x) => x.slug) ?? [])].filter(Boolean) as string[];

export function profileFor(p: Cat): PlacementProfile {
  const slugs = slugsOf(p);
  for (const [re, prof] of RULES) if (slugs.some((s) => re.test(s))) return prof;
  return DEFAULT;
}

/** Η επιφάνεια που ισχύει: ρητή επιλογή διαχειριστή («floor» | «wall» | «furniture» | «counter») ή του προφίλ. */
export function surfaceFor(p: Cat, override?: string | null): Surface {
  if (override === "floor" || override === "wall" || override === "furniture" || override === "counter") return override;
  return profileFor(p).surface;
}

/** Τι αγκύρωση θέλει το AR: τοίχος = κάθετη επιφάνεια· πάτωμα/έπιπλο/πάγκος = οριζόντια. */
export const anchorOf = (s: Surface): Placement => (s === "wall" ? "wall" : "floor");

export function placementFor(p: Cat, override?: string | null): Placement {
  return anchorOf(surfaceFor(p, override));
}

export const SURFACE_LABEL: Record<Surface, string> = { floor: "Στο πάτωμα", furniture: "Σε έπιπλο", counter: "Στον πάγκο", wall: "Στον τοίχο" };
