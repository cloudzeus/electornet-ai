import Image from "@/components/ui/Image";
import { Body, Callout, DocPage, Finding, Kicker, PageHead } from "@/components/doc/DocPage";

/** Pages 1–6: cover, method, findings, before → after. */
export function PagesA() {
  return (
    <>
      {/* 01 · Cover */}
      <DocPage no={1} tone="dark" className="cover justify-between" label="Εξώφυλλο">
        <div className="flex justify-between items-start">
          <Image src="/design/logo-on-blue.svg" alt="euronics" width={148} height={38} className="h-[38px] w-auto" />
          <div className="text-right font-semibold text-[11px] leading-[1.7] tracking-[0.1em] text-eu-on-dark-2">
            Εμπιστευτικό
            <br />
            Σεπτέμβριος 2026 · v3
          </div>
        </div>
        <div>
          <div className="w-[76px] h-[6px] bg-eu-yellow mb-6 rounded-full" />
          <h1 className="m-0 mb-5 font-heading font-bold text-[58px] leading-[1.03] tracking-[-0.025em] max-w-[20em]">
            Ανασχεδιασμός
            <br />
            του euronics.gr
          </h1>
          <p className="m-0 text-eu-on-dark-3 text-[16px] leading-[1.6] max-w-[46em]">
            Πλήρης σάρωση του υφιστάμενου καταστήματος, σύγκριση με το web.kolleris.com που έχουμε ήδη υλοποιήσει και με τον ανταγωνισμό (Κωτσόβολος), ανάλυση πριν & μετά σε επίπεδο component, και μία ολοκληρωμένη πρόταση: custom frontend Next.js απευθείας πάνω στο ERP, χωρίς ενδιάμεση πλατφόρμα ηλεκτρονικού εμπορίου — με ευρωπαϊκή συμμόρφωση ενσωματωμένη στη σχεδίαση.
          </p>
        </div>
        <div className="flex justify-between items-end border-t border-eu-navy-line pt-5">
          <div className="flex gap-10 text-[12px] leading-[1.6] text-eu-on-dark-2">
            {[
              ["Τεχνολογία", "Next.js 16 · Prisma / MySQL\nERP adapters · Custom CMS ζωνών"],
              ["Περιεχόμενο", "37 προτεινόμενες αλλαγές\n11 κρίσιμες · 3 σάρωσης"],
              ["Λειτουργικότητα", "Όσα έχει το web.kolleris.com\n+ 28 νέες δυνατότητες"],
              ["Αρχική σελίδα", "Bento grid · Quick buy\n12 ζώνες marketing"],
            ].map(([t, b]) => (
              <div key={t}>
                <div className="font-extrabold text-[11px] text-eu-yellow tracking-[0.1em] mb-1.5">{t}</div>
                <div className="whitespace-pre-line">{b}</div>
              </div>
            ))}
          </div>
          <div className="font-semibold text-[11px] tracking-[0.08em] text-eu-on-dark-2">DGSOFT · 01</div>
        </div>
      </DocPage>

      {/* 02 · Method */}
      <DocPage no={2} label="Μέθοδος">
        <PageHead title="Τι εξετάσαμε" section="Μέθοδος" no={2} />
        <div className="grid grid-cols-3 gap-6 flex-1">
          <div>
            <Kicker>Εμπορικές σελίδες euronics.gr</Kicker>
            <Body>
              Αρχική με 6 promo tiles PNG και ένα carousel («Προτάσεις δροσιάς»)
              <br />
              <br />
              9 κατηγορίες πρώτου επιπέδου, 3 επίπεδα βάθος, ~200 leaf κατηγορίες, ≈2.250 SKU
              <br />
              <br />
              Λίστα προϊόντων (Τηλεοράσεις — 22 σελίδες των 10, 13 ομάδες φίλτρων χωρίς URL)
              <br />
              <br />
              Σελίδα προϊόντος (iPhone 17 Pro, Bosch KGN39LBCF, LG 43NANO81)
              <br />
              <br />
              Αναζήτηση, tags, κατασκευαστές (10 brands × 0 προϊόντα), Renew
            </Body>
          </div>
          <div>
            <Kicker>Υπηρεσίες, δίκτυο, περιεχόμενο</Kicker>
            <Body>
              13 υπηρεσίες ως κάρτες χωρίς σελίδα, τιμή ή CTA
              <br />
              <br />
              Locator ~350 σημείων: «Απόσταση 0 km», χωρίς ωράρια, χωρίς σελίδα ανά κατάστημα
              <br />
              <br />
              Blog / E-news / Νέα συνεργατών, News module του 2020
              <br />
              <br />
              Πληρωμές, αποστολές, επιστροφές, όροι, cookies, επικοινωνία
              <br />
              <br />
              <strong>Σύγκριση</strong> με web.kolleris.com (35+ σελίδες) και kotsovolos.gr (benchmark)
            </Body>
          </div>
          <Callout title="Το συμπέρασμα">
            Το περιεχόμενο υπάρχει και είναι πλούσιο. Η <strong>δομή παρουσίασής του</strong> και η <strong>πλατφόρμα</strong> είναι το πρόβλημα.
            <br />
            <br />
            Κάθε σελίδα φορτώνει ολόκληρο το mega-menu. Τα promo tiles είναι εικόνες με κείμενο. Τα φίλτρα δεν αποτυπώνονται σε URL. Οι δόσεις εμφανίζονται κενές. Τα brands είναι άδεια. Το «© 2020», τα ισολογιστικά έως 2018 και το Google+ δείχνουν πλατφόρμα σε εγκατάλειψη.
            <br />
            <br />
            Και το σημαντικότερο: <strong>το πλεονέκτημα των 350 καταστημάτων και των 13 υπηρεσιών δεν επικοινωνείται πουθενά</strong> στην αγοραστική διαδρομή.
          </Callout>
        </div>
        <div className="border-t border-eu-line pt-3 text-eu-muted-2 text-[10.5px] leading-[1.5]">
          Σάρωση 8 Σεπτεμβρίου 2026 (45+ URLs) · Τρέχουσα πλατφόρμα: nopCommerce, theme Uptown, server-rendered .NET MVC με jQuery · Πρώτη σάρωση 31 Ιουλίου 2026
        </div>
      </DocPage>

      {/* 03 · Critical findings */}
      <DocPage no={3} label="Κρίσιμα ευρήματα">
        <PageHead title="Έντεκα κρίσιμα ευρήματα" section="Ευρήματα" no={3} />
        <Body className="mb-3 text-eu-muted">Κρίσιμο = επηρεάζει άμεσα πωλήσεις, ορατότητα στη Google, ή συμμόρφωση. Τα τρία πρώτα είναι σφάλματα λειτουργίας, όχι σχεδιαστικές επιλογές.</Body>
        <div className="grid grid-cols-2 gap-x-8 flex-1">
          <div>
            <Finding no="01" title="«Πιστωτική κάρτα από __ το μήνα»">Οι δόσεις εμφανίζονται κενές σε σελίδες προϊόντος. Το ισχυρότερο εμπορικό επιχείρημα, σπασμένο.</Finding>
            <Finding no="02" title="Brands: 10 κατασκευαστές, 0 προϊόντα">Η σελίδα /manufacturer/all είναι άδεια· το brand ζει μόνο ως φίλτρο. Καμία brand landing για Samsung, LG, Bosch.</Finding>
            <Finding no="03" title="«Απόσταση: 0 km» σε όλα τα καταστήματα">Ο locator δεν υπολογίζει απόσταση· η αλφαβητική σειρά βάζει τη Σκιάθο πάνω από τη Θεσσαλονίκη.</Finding>
            <Finding no="04" title="Φίλτρα σε hash, 10 προϊόντα ανά σελίδα">Καμία επιλογή φίλτρου δεν μοιράζεται, δεν μπαίνει σε bookmark, δεν γίνεται καμπάνια. 22 σελίδες για τις τηλεοράσεις.</Finding>
            <Finding no="05" title="Κενά meta descriptions, μηδέν structured data">Τίτλοι της μορφής «euronics. Τηλεοράσεις», χωρίς Product / Offer / LocalBusiness schema σε όλο το site.</Finding>
            <Finding no="06" title="Καμία αναφορά χαμηλότερης τιμής 30 ημερών">Οι εκπτώσεις ανακοινώνονται χωρίς τη νόμιμη βάση σύγκρισης που απαιτεί η Οδηγία Omnibus.</Finding>
          </div>
          <div>
            <Finding no="07" title="Οι 13 υπηρεσίες είναι άκλικτες κάρτες">Επέκταση εγγύησης, e-support, παραλαβή με ένα κλικ: δεκατρείς λόγοι προτίμησης, κανένας με σελίδα ή τιμή.</Finding>
            <Finding no="08" title="Promo tiles PNG με κείμενο, καμία σελίδα προσφορών">Αόρατα στη Google, χωρίς alt, χωρίς mobile. Το offers-euronics.gr δεν επιλύεται καν.</Finding>
            <Finding no="09" title="Mega-menu ~200 links σε κάθε σελίδα">Μαζί με ορατά «Back» items — βάρος, θόρυβος για screen readers, αδύνατη σάρωση.</Finding>
            <Finding no="10" title="Cookie banner με μόνο κουμπί «OK»">Χωρίς ισότιμη απόρριψη και χωρίς ρυθμίσεις — μη συμβατό με GDPR / ePrivacy.</Finding>
            <Finding no="11" title="Ενεργειακή κλάση μόνο ως κείμενο, χωρίς ετικέτα/δελτίο">Καν. (ΕΕ) 2017/1369: ετικέτα και δελτίο προϊόντος σε κάθε online προβολή. Επίσης χωρίς πληκτρολόγιο στο μενού (Οδηγία 2019/882).</Finding>
            <div className="mt-3">
              <Callout title="Επιπλέον 26 μη κρίσιμες αλλαγές" tone="navy">
                Ασυνέπειες USP («δωρεάν σε όλη την Ελλάδα» vs 4 πόλεις), social links προς λογαριασμούς nopCommerce, «© euronics 2020», διπλά URL καταστημάτων, δύο φόρμες newsletter, generic block «ασφάλεια smartphone» σε ψυγεία, variants ως ξεχωριστά URL, PayPal «σύντομα», slugs με/χωρίς τόνους που δίνουν 404.
              </Callout>
            </div>
          </div>
        </div>
      </DocPage>

      {/* 04 · Before/after navigation */}
      <DocPage no={4} label="Πριν & μετά — πλοήγηση">
        <PageHead title="Πριν → Μετά · Πλοήγηση & αναζήτηση" section="Πριν & μετά" no={4} />
        <div className="grid grid-cols-2 gap-6 flex-1">
          <div>
            <Kicker tone="muted">Πριν</Kicker>
            <div className="border border-eu-line rounded-lg overflow-hidden bg-[#fafbfc]">
              <div className="bg-[#f2f2f2] px-2.5 py-1.5 text-[9px] text-[#888] flex justify-between">
                <span>X · f · ▶ · RSS</span>
                <span>ΤΗΛΕΦΩΝΙΚΕΣ ΠΑΡΑΓΓΕΛΙΕΣ 210 483 5143</span>
              </div>
              <div className="p-2.5 flex justify-between items-center bg-white">
                <Image src="/design/logo.svg" alt="" width={80} height={20} className="h-5 w-auto" />
                <div className="text-[9px] text-[#666]">🔍 ♡0 👤 🛒0</div>
              </div>
              <div className="bg-[#1a1a1a] text-white px-2.5 py-1.5 text-[8.5px] font-semibold flex gap-3.5">
                <span>ΠΡΟΪΟΝΤΑ ▾</span>
                <span>EURONICS ▾</span>
                <span>ΚΑΤΑΣΤΗΜΑΤΑ</span>
                <span>ΥΠΗΡΕΣΙΕΣ</span>
                <span>ΤΑ ΝΕΑ ΜΑΣ ▾</span>
                <span>ΕΠΙΚΟΙΝΩΝΙΑ</span>
              </div>
              <div className="grid grid-cols-4 gap-px bg-[#e6e6e6] p-px text-[7.5px] leading-[1.5] text-[#888]">
                {["Back\nΕικόνα και Ήχος\nΤηλεοράσεις & Αξεσουάρ\nBack\nΤηλεοράσεις\nΒάσεις TV…", "Imaging\nBack\nΦωτογραφικές\nCompact\nDSLR\nΘήκες…", "Computing\nBack\nLaptops-Tablets\nStorage\nDesktop\nΠοντίκια…", "Λευκές Συσκευές\nBack\nΨυγεία\nΚαταψύκτες\nΠλυντήρια\nΚουζίνες…"].map((t) => (
                  <div key={t} className="bg-[#fafafa] p-1.5 whitespace-pre-line">
                    {t}
                  </div>
                ))}
              </div>
            </div>
            <Body className="mt-3 text-eu-muted text-[11.5px]">Η αναζήτηση κρύβεται πίσω από εικονίδιο, χωρίς autocomplete. Το καλάθι είναι link χωρίς σύνολο. Το δέντρο κατηγοριών κατεβαίνει ολόκληρο, με τα «Back» items ορατά στο markup.</Body>
          </div>
          <div>
            <Kicker>Μετά</Kicker>
            <div className="border border-eu-line rounded-lg overflow-hidden">
              <div className="bg-eu-navy text-white px-2.5 py-1.5 text-[8.5px] font-semibold flex justify-between">
                <span>350 καταστήματα · Δωρεάν μεταφορά · Δόσεις</span>
                <span className="text-eu-yellow">14 ημέρες υπαναχώρηση</span>
              </div>
              <div className="bg-eu-navy px-2.5 py-3 flex gap-2.5 items-center">
                <Image src="/design/logo-on-blue.svg" alt="" width={80} height={20} className="h-5 w-auto shrink-0" />
                <div className="flex-1 flex bg-white rounded-full overflow-hidden min-w-0">
                  <div className="px-2 flex items-center text-[8px] font-semibold text-eu-ink-3 bg-eu-chip">Κατηγορία ▾</div>
                  <div className="flex-1 px-2 py-2 text-[9px] text-eu-muted-2 truncate">κλιματιστικό 12000 btu…</div>
                  <div className="bg-eu-yellow text-eu-navy px-2.5 flex items-center text-[8.5px] font-extrabold">Αναζήτηση</div>
                </div>
                <div className="bg-eu-blue text-white rounded-full px-2.5 py-1.5 text-[8px] font-extrabold leading-[1.2] shrink-0">
                  Καλάθι · 2<br />
                  <span className="text-eu-yellow">748,00 €</span>
                </div>
              </div>
              <div className="bg-white px-2.5 flex gap-1 items-center border-b border-eu-line text-[8.5px] font-semibold text-eu-ink-2">
                <span className="bg-eu-navy text-white rounded-md px-2 py-2 font-bold">Εικόνα & Ήχος</span>
                <span className="px-1.5 py-2">Τηλεφωνία</span>
                <span className="px-1.5 py-2">Computing</span>
                <span className="px-1.5 py-2">Λευκές</span>
                <span className="px-1.5 py-2">Κλιματισμός</span>
                <span className="flex-1" />
                <span className="bg-eu-red text-white rounded-md px-2 py-2 font-extrabold">Προσφορές</span>
              </div>
              <div className="p-2.5 grid grid-cols-3 gap-1.5 bg-white text-[8px] text-eu-ink-2">
                {[["Τηλεοράσεις", "214 προϊόντα"], ["Home Cinema", "64 προϊόντα"], ["Φορητός ήχος", "88 προϊόντα"]].map(([a, b]) => (
                  <div key={a} className="border border-eu-line-3 rounded-md p-2">
                    <strong className="text-[9px] block">{a}</strong>
                    {b}
                  </div>
                ))}
              </div>
            </div>
            <Body className="mt-3 text-[11.5px]">Μόνιμο πεδίο αναζήτησης με εύρος κατηγορίας και autocomplete τεσσάρων ομάδων (προϊόντα, κατηγορίες, μάρκες, οδηγοί). Καλάθι με σύνολο και mini-cart. Εννέα κατηγορίες πρώτου επιπέδου· τα panels φορτώνονται lazy με προτεινόμενες υποκατηγορίες, ορατά πλήθη και πλήρη πλοήγηση με πληκτρολόγιο. Σε κινητό: συρτάρι-ακορντεόν.</Body>
          </div>
        </div>
      </DocPage>

      {/* 05 · Product card */}
      <DocPage no={5} label="Πριν & μετά — κάρτα προϊόντος">
        <PageHead title="Πριν → Μετά · Η κάρτα προϊόντος" section="Πριν & μετά" no={5} />
        <div className="grid grid-cols-[190px_1fr_250px] gap-8 flex-1 items-start">
          <div>
            <Kicker tone="muted">Πριν</Kicker>
            <div className="border border-[#eee] p-2.5 text-center bg-white">
              <Image src="https://www.euronics.gr/images/thumbs/11004601_480.jpeg" alt="" width={170} height={170} className="w-full aspect-square object-contain" unoptimized />
              <div className="text-[10px] text-[#0645ad] underline mt-1.5">LG 43NANO82T6B NanoCell 43&quot; Τηλεόραση</div>
              <div className="text-[9.5px] text-[#888] mt-1">Διαθέσιμο σε 2-4 εργάσιμες ημέρες</div>
              <div className="text-[10px] text-[#111] mt-1">TIMH ESHOP €349,00</div>
            </div>
            <Body className="mt-3 text-eu-muted text-[11px]">Καμία έκπτωση σε ποσοστό, κανένα σήμα διαθεσιμότητας, καμία δόση, καμία ενεργειακή κλάση, κανένα quick-add, καμία σύγκριση.</Body>
          </div>
          <div className="flex flex-col items-center">
            <div className="font-extrabold text-eu-yellow text-[30px] mt-14">→</div>
            <Body className="mt-5 text-[11.5px]">
              Εννέα πληροφορίες, μία ματιά:
              <br />
              <br />
              <strong>1.</strong> Ποσοστό έκπτωσης
              <br />
              <strong>2.</strong> Μάρκα ξεχωριστά από τον τίτλο
              <br />
              <strong>3.</strong> Ενεργειακή κλάση <em>και</em> δελτίο προϊόντος (Καν. ΕΕ 2017/1369, EPREL)
              <br />
              <strong>4.</strong> Τιμή, διαγραμμένη τιμή
              <br />
              <strong>5.</strong> Χαμηλότερη τιμή 30 ημερών (Omnibus)
              <br />
              <strong>6.</strong> Δόση χωρίς κάρτα, υπολογισμένη
              <br />
              <strong>7.</strong> Διαθεσιμότητα με χρώμα <em>και</em> ημερομηνία παράδοσης
              <br />
              <strong>8.</strong> Quick buy ως κύριο κουμπί
              <br />
              <strong>9.</strong> Απόθεμα σε καταστήματα & σύγκριση
              <br />
              <br />
              <strong>Fluid:</strong> σε στενό container (2 κάρτες σε κινητό) η κάρτα κρατά τα 8 πρώτα και συντομεύει τη διαθεσιμότητα· το κύριο κουμπί δεν χάνεται ποτέ.
            </Body>
          </div>
          <div>
            <Kicker>Μετά</Kicker>
            <div className="bg-white border border-eu-line rounded-lg overflow-hidden shadow-[var(--shadow-card)]">
              <div className="relative bg-eu-surface-2 p-3">
                <span className="absolute top-0 left-0 bg-eu-red text-white font-extrabold text-[10px] px-2 py-1.5 rounded-br-md">−18%</span>
                <Image src="https://www.euronics.gr/images/thumbs/11004601_480.jpeg" alt="" width={220} height={220} className="w-full aspect-square object-contain" unoptimized />
                <div className="absolute bottom-2 left-3 flex gap-1">
                  <span className="bg-[#ea6a1c] text-white font-extrabold text-[9px] px-1.5 py-1 rounded-sm">F</span>
                  <span className="bg-white border border-eu-line text-eu-muted font-semibold text-[8.5px] px-1.5 py-1 rounded-sm">Δελτίο προϊόντος</span>
                </div>
              </div>
              <div className="p-3">
                <div className="font-semibold text-eu-muted-2 text-[9px] tracking-wide mb-1">LG</div>
                <div className="font-bold text-eu-ink text-[12px] leading-[1.3]">43NANO82T6B NanoCell 43&quot; 4K Smart TV</div>
                <div className="flex items-baseline gap-1.5 mt-2">
                  <span className="font-extrabold text-[21px] tracking-[-0.02em]">€349</span>
                  <s className="text-eu-muted-2 text-[11px]">€429</s>
                </div>
                <div className="text-eu-muted text-[9.5px]">Χαμηλότερη τιμή 30 ημερών: €379,00</div>
                <div className="font-bold text-eu-blue text-[11px] my-1.5">ή 12 × €29,08 χωρίς κάρτα</div>
                <div className="flex items-center gap-1.5 font-bold text-eu-amber text-[10.5px] mb-2.5">
                  <span className="size-[7px] rounded-full bg-eu-amber" />
                  Σε 2–4 εργάσιμες · Παρ 11/9
                </div>
                <div className="flex gap-1.5">
                  <div className="flex-1 rounded-full bg-eu-navy text-white text-center py-2.5 font-extrabold text-[11px]">Αγορά με 1 κλικ</div>
                  <div className="w-[38px] rounded-full border-2 border-eu-navy text-center py-2 font-extrabold text-[12px]">+</div>
                </div>
                <div className="flex justify-between font-semibold text-eu-muted-2 text-[9.5px] mt-2">
                  <span>Σύγκριση</span>
                  <span>Απόθεμα σε 8 καταστήματα</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DocPage>

      {/* 06 · PDP / services / stores */}
      <DocPage no={6} label="Πριν & μετά — προϊόν, υπηρεσίες, καταστήματα">
        <PageHead title="Πριν → Μετά · Προϊόν, υπηρεσίες, καταστήματα" section="Πριν & μετά" no={6} />
        <div className="grid grid-cols-3 gap-6 flex-1">
          <div>
            <Kicker>Σελίδα προϊόντος</Kicker>
            <Image src="/img/product-ac.jpg" alt="" width={300} height={112} className="w-full h-[112px] object-contain bg-eu-surface-2 rounded-md mb-3" />
            <Body className="text-[11.5px] text-eu-muted mb-2.5">
              <strong className="text-eu-ink">Πριν:</strong> 13 χαρακτηριστικά σε τοίχο κειμένου, κενές δόσεις, «Βρες ένα κατάστημα» χωρίς επιλογέα, «ασφάλεια smartphone» σε ψυγεία, ενεργειακή κλάση μόνο ως κείμενο, variants ως ξεχωριστά URL.
            </Body>
            <Body className="text-[11.5px]">
              <strong className="text-eu-ink">Μετά:</strong> sticky buy box με υπολογισμένες δόσεις και επιλογέα καταστήματος με πραγματικό απόθεμα· swatches χρώματος/χωρητικότητας· ομαδοποιημένος πίνακας specs· e-support, επέκταση εγγύησης, εγκατάσταση και ανακύκλωση ως επιλέξιμα add-ons με τιμή· ενεργειακή ετικέτα με δελτίο· κριτικές, Q&A, εγχειρίδια, video.
            </Body>
          </div>
          <div>
            <Kicker>Υπηρεσίες</Kicker>
            <div className="grid grid-cols-4 gap-1 mb-3">
              {[1, 5, 10, 2].map((n) => (
                <Image key={n} src={`https://www.euronics.gr/Themes/Uptown/Content/img/services_${n}.jpg`} alt="" width={70} height={70} className="w-full bg-eu-surface-2 rounded-md" unoptimized />
              ))}
            </div>
            <Body className="text-[11.5px] text-eu-muted mb-2.5">
              <strong className="text-eu-ink">Πριν:</strong> 13 κάρτες χωρίς links, τιμές ή βήματα. Καμία υπηρεσία δεν εμφανίζεται εκεί που παίρνεται η απόφαση.
            </Body>
            <Body className="text-[11.5px]">
              <strong className="text-eu-ink">Μετά:</strong> σελίδα ανά υπηρεσία με κόστος, βήματα και FAQ· και ενσωμάτωση στη διαδρομή — εγγύηση & e-support στο buy box, φύλαξη & εγκατάσταση στο checkout, ανακύκλωση ΑΗΗΕ στην παράδοση, κάρτα δώρου online.
            </Body>
          </div>
          <div>
            <Kicker>Καταστήματα</Kicker>
            <div className="relative h-[112px] rounded-md overflow-hidden mb-3">
              <Image src="/img/store-front.jpg" alt="" fill className="object-cover" sizes="300px" />
            </div>
            <Body className="text-[11.5px] text-eu-muted mb-2.5">
              <strong className="text-eu-ink">Πριν:</strong> χάρτης-εικόνα 220×170, «Απόσταση: 0 km» σε όλα, ορατά SEO tags, δύο διαφορετικά URL, χωρίς ωράρια ή υπηρεσίες ανά κατάστημα.
            </Body>
            <Body className="text-[11.5px]">
              <strong className="text-eu-ink">Μετά:</strong> χάρτης και λίστα συγχρονισμένα, πραγματική απόσταση, «ανοιχτό τώρα», φίλτρα υπηρεσιών, απόθεμα ανά κατάστημα — και <strong>350 στατικές σελίδες καταστήματος με LocalBusiness structured data</strong>, το μεγαλύτερο ανεκμετάλλευτο κεφάλαιο τοπικού SEO.
            </Body>
          </div>
        </div>
      </DocPage>
    </>
  );
}
