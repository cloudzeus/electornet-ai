/**
 * Πώς μπαίνει κάθε συσκευή στον χώρο — προκαθορισμένο ανά κατηγορία, όπως στην πραγματικότητα:
 * σε ποια επιφάνεια (πάτωμα, έπιπλο/πάγκος, τοίχος), αν έχει βάση, πού κοιτά η πρόσοψη, και μια οδηγία για τον πελάτη.
 * Το AR αγκυρώνει σε οριζόντια επιφάνεια (πάτωμα, έπιπλο, πάγκος) ή σε κάθετη (τοίχος)· η πρόσοψη κοιτά πάντα το δωμάτιο
 * (+Z), η πλάτη προς τον τοίχο. Ο διαχειριστής μπορεί να αλλάξει την επιφάνεια ανά προϊόν (Διαχείριση → AR).
 *
 * Οι κανόνες ελέγχονται στο ΒΑΘΥΤΕΡΟ slug της διαδρομής πρώτα (π.χ. «tileoraseis» πριν από «tileoraseis-axesoyar»),
 * ώστε μια βάση τοίχου στην ίδια ενότητα με τις τηλεοράσεις να μη γίνεται τηλεόραση.
 */
export type Placement = "floor" | "wall";
export type Surface = "floor" | "furniture" | "counter" | "wall";
/** Εύρος λογικών διαστάσεων (εκ.) ανά άξονα: Π, Υ, Β */
export type Bounds = { w: [number, number]; h: [number, number]; d: [number, number] };

export interface PlacementProfile {
  /** επιφάνεια όπου μπαίνει συνήθως */
  surface: Surface;
  /** εναλλακτική (π.χ. τηλεόραση: έπιπλο ή τοίχος) — δεύτερο κουμπί για τον πελάτη */
  alt?: Surface;
  /** μοντέλο ειδικής μορφής: τηλεόραση = λεπτό πάνελ με οθόνη (με βάση στο έπιπλο, χωρίς στον τοίχο) */
  archetype?: "tv";
  /** τι λέμε στον πελάτη για το πού και πώς μπαίνει */
  hint: string;
  /** χωρίς αυτόματο AR: μικρές/προσωπικές συσκευές και αξεσουάρ, όπου το AR δεν βοηθά τον πελάτη (ο διαχειριστής μπορεί να το ανοίξει ρητά) */
  none?: boolean;
  /** λογικά όρια διαστάσεων του τύπου: έξω από αυτά δεν δείχνουμε μοντέλο σε λάθος μέγεθος */
  bounds?: Bounds;
}

const P = (surface: Surface, hint: string, extra: Partial<PlacementProfile> = {}): PlacementProfile => ({ surface, hint, ...extra });
const NONE = P("furniture", "Ακούμπησέ το σε τραπέζι ή γραφείο για να δεις το πραγματικό του μέγεθος.", { none: true });
const B = (w: [number, number], h: [number, number], d: [number, number]): Bounds => ({ w, h, d });

const COUNTER_HINT = "Μπαίνει στον πάγκο της κουζίνας, με την πλάτη προς τον τοίχο και λίγο χώρο γύρω για αερισμό.";

/** Κανόνες με σειρά προτεραιότητας. Κάθε slug της διαδρομής (από το βαθύτερο) ελέγχεται με όλους τους κανόνες. */
const RULES: [RegExp, PlacementProfile][] = [
  // — Χωρίς AR: προσωπικές/φορητές συσκευές, αξεσουάρ, αναλώσιμα —
  [/^(kiniti-tilefonia|kinita-|wearables$|smartwatches$|activity-trackers$|akoystika-|handsfree|power-bank$|prostasia-othonis|tsantes|thikes|analosima$|antallaktika$|sakoyles|pontikia$|pliktrologia$|kalodia|networking$|wifi-|modems|switch-|smart-home$|ip-kamera$|exypn|fotografikes-michanes$|compact$|dslr$|vinteokameres$|ipod|media-players$|dektes|tilecheiristiria$|vaseis-tv$|epipla-tv$|gia-ton-andra$|gia-tin-gynaika$|gia-to-paidi$|odontovoyrtses$|zygaries|machairia$|docheia-fagitoy|kartes-grafikon$|gaming-mice$|gaming-headsets$|gaming-keyboards$|icheia-speakers$|akoystika-headsets$|axesoyar|laptop|tablets|skeyi-mageirikis$|sidera$|mixer-cheiros$|ygeia-eyexia$|prosopiki-frontida$|tilefonia$|imaging$|.*-axesoyar$)/, NONE],
  // — Τηλεοράσεις και εικόνα —
  [/^tileoraseis$/, P("furniture", "Η τηλεόραση μπαίνει σε έπιπλο TV με τη βάση της, με το κέντρο της οθόνης περίπου στο ύψος των ματιών όταν κάθεσαι (~1 μ.). Μπορείς να τη δεις και στον τοίχο.", { alt: "wall", archetype: "tv" })],
  [/othones-ypologiston|^oles-oi-othones$/, P("furniture", "Η οθόνη μπαίνει στο γραφείο, περίπου ένα χέρι μακριά από τα μάτια.", { bounds: B([30, 130], [18, 80], [1, 40]) })],
  [/projectors/, P("furniture", "Ο προβολέας μπαίνει σε τραπέζι ή ράφι, απέναντι από τον τοίχο ή το πανί προβολής.")],
  [/^icheia$|home-cinema|^ichos$|mini-micro|forita-icheia|blu-ray|dvd/, P("furniture", "Μπαίνει στο έπιπλο της τηλεόρασης ή σε ράφι· ένα soundbar κάθεται μπροστά, κάτω από την οθόνη.")],
  [/konsol|playstation|xbox|nintendo/, P("furniture", "Η κονσόλα μπαίνει στο έπιπλο της τηλεόρασης, με λίγο χώρο γύρω για αερισμό.")],
  [/all-in-one/, P("furniture", "Μπαίνει στο γραφείο, περίπου ένα χέρι μακριά από τα μάτια.")],
  [/ektypotes|polymichanimata/, P("furniture", "Ο εκτυπωτής μπαίνει σε γραφείο ή ράφι· άφησε χώρο μπροστά για το χαρτί και πάνω για το καπάκι.")],
  // — Κλιματισμός —
  [/^forita-klimatistika$/, P("floor", "Το φορητό κλιματιστικό μπαίνει στο πάτωμα κοντά σε παράθυρο, για τον σωλήνα του ζεστού αέρα.")],
  [/air-condition|klimatist/, P("wall", "Το κλιματιστικό τοποθετείται ψηλά στον τοίχο, περίπου 15–20 εκ. κάτω από το ταβάνι, μακριά από ντουλάπια και κουρτίνες.", { alt: "floor", bounds: B([60, 130], [20, 40], [15, 35]) })],
  [/aporrofitir/, P("wall", "Ο απορροφητήρας μπαίνει στον τοίχο πάνω από τις εστίες, 65–75 εκ. πάνω από αυτές.", { alt: "floor", bounds: B([30, 125], [5, 130], [15, 65]) })],
  [/thermosifon/, P("wall", "Ο θερμοσίφωνας κρεμιέται σε τοίχο που αντέχει το βάρος του γεμάτου, συνήθως στο μπάνιο.", { alt: "floor" })],
  // — Ψύξη —
  [/side-by-side/, P("floor", "Η ντουλάπα μπαίνει στο πάτωμα με την πλάτη στον τοίχο· άφησε ~5 εκ. πίσω, λίγο χώρο στα πλάγια για αερισμό και χώρο να ανοίγουν οι πόρτες.", { bounds: B([65, 125], [150, 200], [55, 95]) })],
  [/psygeiokatapsyktes/, P("floor", "Το ψυγείο μπαίνει στο πάτωμα με την πλάτη στον τοίχο· άφησε ~5 εκ. πίσω και λίγο χώρο στα πλάγια για αερισμό, και χώρο να ανοίγει η πόρτα.", { bounds: B([45, 100], [120, 215], [50, 85]) })],
  [/mini-bars|syntirites|vitrines/, P("floor", "Μπαίνει στο πάτωμα ή σε σταθερό πάγκο, με την πλάτη στον τοίχο και λίγο χώρο γύρω για αερισμό.", { bounds: B([30, 100], [30, 215], [30, 90]) })],
  [/katapsyktes/, P("floor", "Ο καταψύκτης μπαίνει στο πάτωμα με την πλάτη στον τοίχο, με λίγο χώρο γύρω για αερισμό και να ανοίγει η πόρτα ή το καπάκι.", { bounds: B([40, 200], [45, 215], [40, 95]) })],
  [/psygeia-entoichizomena/, P("floor", "Εντοιχιζόμενο: μπαίνει μέσα σε ντουλάπι της κουζίνας. Δες το στο πάτωμα, μπροστά από τη θέση του, για να συγκρίνεις με το άνοιγμα.", { bounds: B([40, 100], [45, 215], [40, 90]) })],
  [/psyg|katapsyk/, P("floor", "Το ψυγείο μπαίνει στο πάτωμα με την πλάτη στον τοίχο· άφησε ~5 εκ. πίσω και λίγο χώρο στα πλάγια για αερισμό, και χώρο να ανοίγει η πόρτα.", { bounds: B([40, 125], [45, 215], [40, 90]) })],
  // — Πλύσιμο —
  [/plyntiria-piaton/, P("floor", "Το πλυντήριο πιάτων μπαίνει κάτω από τον πάγκο ή στο πάτωμα, κοντά σε παροχή νερού και αποχέτευση· άφησε χώρο να ανοίγει η πόρτα.", { bounds: B([38, 70], [40, 95], [35, 75]) })],
  [/plyntir|stegnot/, P("floor", "Το πλυντήριο μπαίνει στο πάτωμα με την πλάτη στον τοίχο, κοντά σε παροχή νερού και αποχέτευση· άφησε χώρο να ανοίγει η πόρτα.", { bounds: B([38, 70], [60, 95], [35, 75]) })],
  // — Κουζίνα —
  [/^esties$/, P("counter", "Η εστία μπαίνει μέσα στον πάγκο της κουζίνας. Δες τη πάνω στον πάγκο για να συγκρίνεις με το άνοιγμα.", { bounds: B([25, 95], [2.5, 16], [30, 60]) })],
  [/foyrnoi-mikrokymaton-entoichizomena/, P("counter", "Εντοιχιζόμενος: μπαίνει σε ντουλάπι ή κολόνα της κουζίνας. Δες τον στον πάγκο για να συγκρίνεις με το άνοιγμα.", { bounds: B([40, 65], [30, 50], [30, 60]) })],
  [/^foyrnoi$|set-entoichismoy/, P("floor", "Εντοιχιζόμενος φούρνος: μπαίνει σε ντουλάπι κάτω από τον πάγκο ή σε κολόνα. Δες τον στο πάτωμα, μπροστά από τη θέση του, για να συγκρίνεις με το άνοιγμα.", { bounds: B([40, 95], [35, 65], [40, 65]) })],
  [/koyzin(?!akia|omichan)|kouzin/, P("floor", "Η κουζίνα μπαίνει στο πάτωμα, ανάμεσα στα ντουλάπια, με την πλάτη στον τοίχο.", { bounds: B([48, 95], [80, 95], [50, 70]) })],
  [/^oloi-oi-foyrnoi-mikrokymaton$|foyrnoi-mikrokymaton/, P("counter", "Ο φούρνος μικροκυμάτων μπαίνει στον πάγκο· άφησε λίγα εκατοστά πάνω και πίσω για αερισμό.", { bounds: B([35, 65], [20, 50], [25, 60]) })],
  [/foyrnakia|michanes-kafe|syskeyes-mageirik|epitrapezies-esties|ergaleia-mageirik/, P("counter", COUNTER_HINT)],
  [/entoichiz/, P("floor", "Εντοιχιζόμενη συσκευή: μπαίνει στη θέση της στα ντουλάπια. Δες τη στο πάτωμα, μπροστά από τη θέση της, για να συγκρίνεις με το άνοιγμα.")],
  // — Σπίτι —
  [/epitrapezioi-anemistires/, P("furniture", "Μπαίνει σε τραπέζι, γραφείο ή κομοδίνο.")],
  [/afygrant|ionist|ygrant|katharist|anemistir|thermantik|thermastres|kalorifer|aerotherm|convector/, P("floor", "Μπαίνει στο πάτωμα, με λίγο ελεύθερο χώρο γύρω για να κυκλοφορεί ο αέρας.")],
  [/systimata-sideromatos|preses/, P("furniture", "Μπαίνει στη σιδερώστρα ή σε σταθερό τραπέζι, κοντά σε πρίζα.")],
  [/raptomichanes/, P("furniture", "Η ραπτομηχανή μπαίνει σε σταθερό τραπέζι, με χώρο αριστερά για το ύφασμα.")],
  [/skoypes-rompot/, P("floor", "Η σκούπα ρομπότ κινείται στο πάτωμα: άφησέ τη μπροστά στον καναπέ ή το κρεβάτι και δες αν περνά από κάτω.")],
  [/siderostres/, P("floor", "Η σιδερώστρα στέκεται ανοιχτή στο πάτωμα· δες πόσο χώρο πιάνει εκεί που σιδερώνεις.")],
  [/skoyp/, P("floor", "Στο πάτωμα — δες πόσο χώρο πιάνει εκεί που θα την αποθηκεύεις.")],
  [/organa-gymnastikis|patinia|perifereiaka-pc-pc/, P("floor", "Στο πάτωμα, με ελεύθερο χώρο γύρω για να κινείσαι.")],
];
const DEFAULT = P("floor", "Μπαίνει στο πάτωμα, με την πρόσοψη προς το δωμάτιο.");

type Cat = { category?: string; subcategory?: string; path?: { slug: string }[] };
/** Από το βαθύτερο προς το γενικότερο: L3 → L2 → L1, και μετά τα πεδία κατηγορίας (για τα demo προϊόντα χωρίς διαδρομή). */
export const slugsOf = (p: Cat) => [...new Set([...(p.path?.map((x) => x.slug).reverse() ?? []), p.subcategory, p.category].filter(Boolean) as string[])];

export function profileFor(p: Cat): PlacementProfile {
  for (const s of slugsOf(p)) for (const [re, prof] of RULES) if (re.test(s)) return prof;
  return DEFAULT;
}

/** Η επιφάνεια που ισχύει: ρητή επιλογή διαχειριστή («floor» | «wall» | «furniture» | «counter») ή του προφίλ. */
export function surfaceFor(p: Cat, override?: string | null): Surface {
  if (isSurface(override)) return override;
  return profileFor(p).surface;
}
export const isSurface = (s: unknown): s is Surface => s === "floor" || s === "wall" || s === "furniture" || s === "counter";

/** Τι αγκύρωση θέλει το AR: τοίχος = κάθετη επιφάνεια· πάτωμα/έπιπλο/πάγκος = οριζόντια. */
export const anchorOf = (s: Surface): Placement => (s === "wall" ? "wall" : "floor");

export function placementFor(p: Cat, override?: string | null): Placement {
  return anchorOf(surfaceFor(p, override));
}

export const SURFACE_LABEL: Record<Surface, string> = { floor: "Στο πάτωμα", furniture: "Σε έπιπλο", counter: "Στον πάγκο", wall: "Στον τοίχο" };
/** Πού στοχεύει ο πελάτης την κάμερα (αιτιατική) */
export const SURFACE_TARGET: Record<Surface, string> = { floor: "το πάτωμα", furniture: "το έπιπλο ή το τραπέζι", counter: "τον πάγκο", wall: "τον τοίχο" };
