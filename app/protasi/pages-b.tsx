/* eslint-disable react/jsx-key -- Table assigns keys per cell when rendering */
import Image from "@/components/ui/Image";
import { Body, Callout, DocPage, Kicker, PageHead, Table } from "@/components/doc/DocPage";

/** Pages 7–11: Proposal A, Proposal B, the decision, compliance, tech & plan. */
export function PagesB() {
  return (
    <>
      {/* 07 · Proposal A */}
      <DocPage no={7} label="Πρόταση Α">
        <PageHead title="Πρόταση Α · «Σαφήνεια»" section="Αρχική σελίδα" no={7} />
        <div className="grid grid-cols-[1.35fr_1fr] gap-7 flex-1">
          <div>
            <div className="border border-eu-line rounded-lg overflow-hidden text-[8.5px]">
              <div className="bg-eu-blue text-white px-2.5 py-1.5 flex gap-3 justify-center font-medium">
                <span>350 καταστήματα</span>·<span>Δωρεάν μεταφορά & φύλαξη</span>·<span>Δόσεις</span>·<span>14 ημέρες υπαναχώρηση</span>
              </div>
              <div className="bg-eu-navy p-2.5 flex gap-2 items-center">
                <Image src="/design/logo-on-blue.svg" alt="" width={70} height={17} className="h-[17px] w-auto" />
                <div className="flex-1 flex bg-white rounded-full border-2 border-eu-yellow overflow-hidden">
                  <div className="px-2 flex items-center text-[8px] text-eu-muted bg-eu-surface-2">Όλες οι κατηγορίες ▾</div>
                  <div className="flex-1 px-2 py-1.5 text-eu-muted-2 truncate">Ψάξε προϊόν, μάρκα ή κωδικό…</div>
                  <div className="bg-eu-yellow text-eu-navy px-2 flex items-center font-bold">Αναζήτηση</div>
                </div>
                <div className="bg-eu-blue text-white rounded-full px-2 py-1.5 text-[8px] font-bold leading-[1.3]">
                  2 προϊόντα
                  <br />
                  <span className="text-eu-yellow">€748,00</span>
                </div>
              </div>
              <div className="bg-white border-b border-eu-line px-2.5 flex gap-2 font-medium text-eu-ink-3">
                <span className="py-2 border-b-[3px] border-eu-yellow text-eu-ink font-bold">Εικόνα & Ήχος</span>
                <span className="py-2">Τηλεφωνία</span>
                <span className="py-2">Computing</span>
                <span className="py-2">Λευκές Συσκευές</span>
                <span className="py-2">Κλιματισμός</span>
                <span className="flex-1" />
                <span className="py-2 text-eu-red font-bold">Προσφορές</span>
              </div>
              <div className="grid grid-cols-[37%_1fr] bg-eu-surface-2">
                <div className="p-3">
                  <div className="font-bold text-eu-red text-[7.5px] tracking-[0.12em] mb-1.5">Καλοκαίρι 2026</div>
                  <div className="font-heading font-bold text-[17px] leading-[1.12] mb-1.5">
                    Δροσιά που
                    <br />
                    δεν καίει ρεύμα
                  </div>
                  <div className="text-eu-ink-3 leading-[1.5] mb-2.5">Inverter έως A+++, τοποθέτηση από πιστοποιημένους τεχνικούς, δόσεις χωρίς κάρτα.</div>
                  <div className="flex gap-1.5 mb-2">
                    <span className="bg-eu-blue text-white rounded-full px-2.5 py-1.5 font-bold text-[8px]">Δες τα κλιματιστικά</span>
                    <span className="border-2 border-eu-blue text-eu-blue rounded-full px-2 py-1 font-bold text-[8px]">Βρες το BTU σου</span>
                  </div>
                  <div className="text-[7.5px] leading-[1.7] text-eu-ink-3">✓ Δωρεάν μεταφορά · ✓ Εγκατάσταση · ✓ Εγγύηση έως 5 έτη</div>
                </div>
                <div className="relative min-h-[120px]">
                  <Image src="/img/hero-clima.jpg" alt="" fill className="object-cover" sizes="400px" />
                </div>
              </div>
              <div className="grid grid-cols-4 bg-white border-b border-eu-line text-[7.5px] text-eu-muted leading-[1.35]">
                {[["Πληρώνεις όπως θες", "Δόσεις με ή χωρίς κάρτα"], ["Δωρεάν μεταφορά", "Σε όλη την Ελλάδα, με ραντεβού"], ["Εγγυημένες αγορές", "Επίσημη εγγύηση"], ["Δωρεάν φύλαξη", "Παράλαβε όταν θες"]].map(([a, b]) => (
                  <div key={a} className="p-2 border-r border-eu-line-3 last:border-0">
                    <strong className="text-eu-ink text-[8.5px] block">{a}</strong>
                    {b}
                  </div>
                ))}
              </div>
              <div className="p-2.5 grid grid-cols-5 gap-1.5">
                {[["Τηλεοράσεις", 214], ["Κλιματισμός", 186], ["Πλυντήρια", 240], ["Ψυγεία", 198], ["Κινητά", 312]].map(([a, b]) => (
                  <div key={a} className="border border-eu-line rounded-md p-2 text-center font-semibold text-[8px]">
                    {a}
                    <br />
                    <span className="font-normal text-eu-muted-2 text-[7px]">{b} προϊόντα</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-eu-muted-2 text-[9.5px] mt-2">Απόσπασμα · η πλήρης σελίδα στο αρχείο «Euronics Αρχική — Πρόταση» (v1)</div>
          </div>
          <div>
            <Kicker>Η λογική</Kicker>
            <Body>
              Κλασική, ήπια, αναγνωρίσιμη δομή ευρωπαϊκού λιανεμπόρου ηλεκτρικών. Στόχος: <strong>μηδενικό ρίσκο αποπροσανατολισμού</strong> για το υπάρχον κοινό — ιδίως το κοινό λευκών συσκευών, που είναι μεγαλύτερης ηλικίας και λιγότερο ανεκτικό σε πειραματισμούς.
              <br />
              <br />
              Hero σε δύο στήλες με κείμενο σε HTML (όχι αφίσα), τρεις διαφάνειες με ορατή παύση, ζώνη εμπιστοσύνης με σαφείς όρους, είσοδοι κατηγοριών με πλήθη, rail προσφορών με πραγματική λήξη, ζώνη υπηρεσιών, εντοπισμός καταστήματος, οδηγοί αγοράς, ένα newsletter.
            </Body>
            <div className="mt-4">
              <Callout title="Κατάλληλη αν">Η προτεραιότητα είναι να διορθωθούν τα υπάρχοντα προβλήματα χωρίς να αλλάξει η αίσθηση της μάρκας, και η υλοποίηση πρέπει να ξεκινήσει άμεσα με ελάχιστη εσωτερική συζήτηση.</Callout>
            </div>
          </div>
        </div>
      </DocPage>

      {/* 08 · Proposal B */}
      <DocPage no={8} label="Πρόταση Β">
        <PageHead title="Πρόταση Β · «Ένταση» — υλοποιημένη" section="Αρχική σελίδα" no={8} />
        <div className="grid grid-cols-[1.35fr_1fr] gap-7 flex-1">
          <div>
            <div className="border border-eu-line rounded-lg overflow-hidden text-[8px]">
              <div className="bg-eu-navy text-eu-on-dark-2 px-2.5 py-1.5 font-semibold flex justify-between">
                <span className="text-white">350 καταστήματα · Δωρεάν μεταφορά · Δόσεις</span>
                <span className="text-eu-yellow">14 ημέρες υπαναχώρηση</span>
              </div>
              <div className="bg-eu-navy p-2.5 flex gap-2 items-center">
                <Image src="/design/logo-on-blue.svg" alt="" width={70} height={18} className="h-[18px] w-auto" />
                <div className="flex-1 flex bg-white rounded-full overflow-hidden">
                  <div className="px-2 flex items-center font-semibold text-eu-ink-3 bg-eu-chip">Κατηγορία ▾</div>
                  <div className="flex-1 px-2 py-2 text-eu-muted-2 truncate">κλιματιστικό 12000 btu, πλυντήριο 9kg…</div>
                  <div className="bg-eu-yellow text-eu-navy px-2.5 flex items-center font-extrabold">Αναζήτηση</div>
                </div>
                <div className="bg-eu-blue text-white rounded-full px-2 py-1.5 font-extrabold leading-[1.3]">
                  Καλάθι · 2<br />
                  <span className="text-eu-yellow">748,00 €</span>
                </div>
              </div>
              <div className="bg-eu-navy p-2 grid grid-cols-[2fr_1fr] grid-rows-[auto_auto] gap-2">
                <div className="row-span-2 relative overflow-hidden rounded-md min-h-[150px]">
                  <Image src="/img/hero-clima.jpg" alt="" fill className="object-cover" sizes="400px" />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(18,42,88,.93)_0%,rgba(18,42,88,.68)_48%,rgba(18,42,88,.05)_100%)]" />
                  <div className="relative p-3.5 text-white">
                    <div className="inline-block bg-eu-yellow text-eu-navy font-extrabold text-[7px] tracking-[0.1em] px-1.5 py-1 rounded-sm mb-2">Καλοκαίρι 2026 · κλιματισμός</div>
                    <div className="font-heading font-bold text-[22px] leading-[1.02] tracking-[-0.025em] mb-2">
                      Δροσιά
                      <br />
                      που δεν καίει
                      <br />
                      ρεύμα
                    </div>
                    <div className="text-eu-on-dark leading-[1.5] mb-2.5 max-w-[20em]">Inverter έως A+++, τοποθέτηση από τεχνικό του καταστήματος, δόσεις χωρίς κάρτα.</div>
                    <div className="flex gap-1.5">
                      <span className="bg-eu-yellow text-eu-navy rounded-full px-2.5 py-1.5 font-extrabold">Δες τα 186 μοντέλα</span>
                      <span className="border-2 border-white/50 rounded-full px-2 py-1 font-bold">Υπολόγισε BTU</span>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-md p-2.5">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="font-extrabold text-eu-red text-[7px] tracking-[0.1em]">Προσφορά ημέρας</span>
                    <span className="font-extrabold bg-eu-surface rounded-sm px-1.5 py-0.5">14:38:02</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Image src="https://www.euronics.gr/images/thumbs/11004601_480.jpeg" alt="" width={46} height={46} className="size-[46px] object-contain bg-eu-surface-2 rounded-sm" unoptimized />
                    <div>
                      <div className="font-bold text-[8.5px] leading-[1.3]">43NANO82T6B NanoCell 43&quot;</div>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="font-extrabold text-[13px]">€349</span>
                        <s className="text-eu-muted-2">€429</s>
                        <span className="bg-eu-red text-white font-extrabold text-[7px] px-1 rounded-sm">−18%</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-eu-muted text-[7px] my-1.5">Χαμηλότερη τιμή 30 ημερών: €379,00</div>
                  <div className="flex gap-1">
                    <div className="flex-1 bg-eu-navy text-white rounded-full text-center py-2 font-extrabold">Αγορά με 1 κλικ</div>
                    <div className="w-7 border-2 border-eu-navy rounded-full text-center py-1.5 font-extrabold">+</div>
                  </div>
                </div>
                <div className="grid grid-rows-2 gap-2">
                  <div className="bg-eu-blue text-white rounded-md p-2">
                    <div className="font-extrabold text-eu-yellow text-[7px] tracking-[0.1em] mb-1.5">Το κατάστημά σου</div>
                    <div className="font-heading font-bold text-[11px] leading-[1.25] mb-1.5">Δες απόθεμα δίπλα σου</div>
                    <div className="flex gap-1">
                      <div className="flex-1 bg-white text-eu-muted-2 rounded-full px-2 py-1.5">ΤΚ ή πόλη</div>
                      <div className="bg-eu-yellow text-eu-navy rounded-full px-2 py-1.5 font-extrabold">Βρες</div>
                    </div>
                  </div>
                  <div className="bg-eu-surface rounded-md p-2">
                    <div className="font-extrabold text-eu-blue text-[7px] tracking-[0.1em] mb-1.5">Υπηρεσίες</div>
                    <div className="font-semibold text-eu-ink-2 leading-[1.5]">Παραλαβή σε 2 ώρες · Εγκατάσταση με ραντεβού · Ανακύκλωση ΑΗΗΕ</div>
                  </div>
                </div>
              </div>
              <div className="bg-eu-yellow text-eu-navy px-2.5 py-1.5 font-extrabold tracking-[0.07em] flex gap-4 whitespace-nowrap overflow-hidden">
                <span>Δωρεάν μεταφορά</span>—<span>Δόσεις χωρίς κάρτα έως 24 μήνες</span>—<span>Επίσημη εγγύηση</span>—<span>Παραλαβή σε 2 ώρες</span>
              </div>
              <div className="p-2.5 grid grid-cols-3 gap-px bg-eu-line">
                {[["01", "Τηλεοράσεις & Ήχος", "214 προϊόντα", false], ["02", "Κλιματισμός & Θέρμανση", "186 προϊόντα", true], ["03", "Πλυντήρια & Στεγνωτήρια", "240 προϊόντα", false]].map(([n, t, c, dark]) => (
                  <div key={String(n)} className={`p-2.5 flex justify-between ${dark ? "bg-eu-navy text-white" : "bg-white"}`}>
                    <div>
                      <div className={`font-extrabold text-[7.5px] mb-1 ${dark ? "text-eu-yellow" : "text-eu-muted-3"}`}>{n}</div>
                      <div className="font-bold text-[11px] leading-[1.15]">{t}</div>
                      <div className={`text-[7px] mt-1 ${dark ? "text-eu-on-dark-2" : "text-eu-muted-2"}`}>{c}</div>
                    </div>
                    <span className={`font-extrabold ${dark ? "text-eu-yellow" : "text-eu-blue"}`}>→</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-eu-muted-2 text-[9.5px] mt-2">Απόσπασμα · η πλήρης, λειτουργική σελίδα στο route «/» αυτού του project (Next.js) — brand-normalized</div>
          </div>
          <div>
            <Kicker>Η λογική</Kicker>
            <Body>
              Τρεις τομές σε σχέση με την Α:
              <br />
              <br />
              <strong>1 · Bento grid αντί hero.</strong> Η αρχική δίνει τέσσερα μηνύματα σε μία οθόνη: εποχική καμπάνια, προσφορά ημέρας με άμεση αγορά, εντοπισμό καταστήματος, υπηρεσίες.
              <br />
              <br />
              <strong>2 · Καθόλου εικονίδια.</strong> Οι κατηγορίες γίνονται τυπογραφικό πλέγμα με νούμερα 01–09 και πλήθη. Κλιμακώνεται σε 200 υποκατηγορίες.
              <br />
              <br />
              <strong>3 · Quick buy ως κύριο κουμπί.</strong> «Αγορά με 1 κλικ» σε πλήρες πλάτος, το καλάθι δευτερεύον «+».
              <br />
              <br />
              <strong>Brand:</strong> χρώματα, τυπογραφία, στρογγυλεμένες γωνίες και sentence case από το Euronics Brand Manual v2.1 — ό,τι στο mockup ήταν κεφαλαία/navy #0B1533 έγινε brand blue #1D428A, κίτρινο #F1C400, Poppins/Manrope.
            </Body>
            <div className="mt-4">
              <Callout title="Κατάλληλη αν" tone="navy">Η Euronics θέλει να επανατοποθετηθεί ως σύγχρονος τεχνολογικός λιανέμπορος και να διεκδικήσει νεότερο κοινό, δεχόμενη μια περίοδο προσαρμογής για το υπάρχον.</Callout>
            </div>
          </div>
        </div>
      </DocPage>

      {/* 09 · Decision */}
      <DocPage no={9} tone="grey" label="Σύγκριση Α/Β">
        <PageHead title="Α ή Β — η απόφαση" section="Σύγκριση" no={9} />
        <Table
          head={["Κριτήριο", "Α · Σαφήνεια", "Β · Ένταση"]}
          widths={["22%"]}
          headTone="mixed"
          rows={[
            ["Αναγνωρισιμότητα", "Υψηλή — το υπάρχον κοινό δεν χρειάζεται επανεκπαίδευση", "Μεσαία — απαιτεί περίοδο προσαρμογής"],
            ["Πυκνότητα μηνυμάτων", "Ένα μήνυμα ανά ενότητα, γραμμική ροή", "Τέσσερα μηνύματα στην πρώτη οθόνη"],
            ["Μονοπάτι αγοράς", "Καλάθι → checkout, κλασικό", <><strong>Quick buy από την αρχική</strong> — απαιτεί αποθηκευμένη κάρτα & διεύθυνση</>],
            ["Κατηγορίες", "Πλακίδια με εικονίδια — χρειάζονται σχεδίαση σετ", "Τυπογραφικό πλέγμα — κλιμακώνεται σε 200 υποκατηγορίες"],
            ["Ανάγκη σε φωτογραφία", "Μέτρια", "Υψηλή — το bento απαιτεί επιμελημένο υλικό (AI-generated προσωρινά, βλ. §17)"],
            ["Χρόνος υλοποίησης", "Βάση αναφοράς", "+1,5 εβδομάδα (bento, quick buy sheet, ticker) — ήδη υλοποιημένα στο prototype"],
            ["Ευρωπαϊκή συμμόρφωση", <span className="text-eu-green font-semibold">Πλήρης</span>, <span className="text-eu-green font-semibold">Πλήρης — το quick buy περνά από φύλλο επιβεβαίωσης</span>],
          ]}
        />
        <div className="grid grid-cols-2 gap-5 mt-5 flex-1">
          <div className="bg-white rounded-lg p-5">
            <Kicker>Η σύστασή μας</Kicker>
            <Body>
              Η <strong>Β</strong>, με μία προϋπόθεση: το quick buy να ξεκινήσει ως «Άμεση παραγγελία» με προσυμπληρωμένο checkout ενός βήματος, και να γίνει πραγματικό ένα-κλικ μόλις υπάρξουν αποθηκευμένες κάρτες (token Viva / Stripe). Η Β δίνει στη Euronics κάτι που τα marketplace δεν μπορούν να αντιγράψουν — το φυσικό δίκτυο και τις υπηρεσίες, ορατά από την πρώτη οθόνη.
            </Body>
          </div>
          <div className="bg-white rounded-lg p-5">
            <Kicker>Υβριδική διαδρομή</Kicker>
            <Body>
              Επειδή η αρχική είναι 100% συνθέσιμη από widgets σε ζώνες (§17), δεν χρειάζεται οριστική απόφαση σήμερα: ξεκινάμε με τη δομή της Α και δοκιμάζουμε το bento και το quick buy σε A/B, με μέτρηση ανά ζώνη. Το CMS ζωνών το επιτρέπει χωρίς νέα ανάπτυξη — κάθε widget έχει schedule, ορατότητα ανά συσκευή και ποσοστό κίνησης.
            </Body>
          </div>
        </div>
      </DocPage>

      {/* 10 · Compliance */}
      <DocPage no={10} label="Συμμόρφωση">
        <PageHead title="Ευρωπαϊκή συμμόρφωση, ενσωματωμένη" section="Συμμόρφωση" no={10} />
        <Body className="mb-3 text-eu-muted">Καμία από αυτές τις απαιτήσεις δεν λύνεται με «σελίδα όρων». Καθεμία αντιστοιχεί σε συγκεκριμένο component της νέας αρχιτεκτονικής.</Body>
        <Table
          head={["Απαίτηση", "Τι σημαίνει πρακτικά", "Πού εμφανίζεται"]}
          widths={["26%", "37%"]}
          headTone="mixed"
          rows={[
            ["Οδηγία Omnibus (ΕΕ) 2019/2161", "Κάθε ανακοίνωση έκπτωσης δηλώνει τη χαμηλότερη τιμή των 30 προηγούμενων ημερών· απαγορεύονται ψεύτικα χρονόμετρα και εικονική σπανιότητα", <span className="text-eu-blue font-semibold">Price component · κάθε κάρτα · Countdown με πραγματική λήξη</span>],
            ["Καν. (ΕΕ) 2017/1369 · EPREL", "Ενεργειακή κλάση με κλίμακα και δελτίο προϊόντος ορατά σε κάθε online προβολή, όχι μόνο στη σελίδα προϊόντος", <span className="text-eu-blue font-semibold">EnergyChip · σε κάθε κάρτα</span>],
            ["Οδηγία 2011/83/ΕΕ", "Συνολικό κόστος με μεταφορικά και ΦΠΑ πριν τη δέσμευση· κουμπί με ρητή υποχρέωση πληρωμής· ενημέρωση 14 ημερών", <span className="text-eu-blue font-semibold">QuickBuySheet · checkout · AnnouncementBar</span>],
            ["Οδηγία 2019/882 · EN 301 549", "Από 28.6.2025 τα ηλεκτρονικά καταστήματα οφείλουν WCAG AA: πληκτρολόγιο, αντίθεση, ορατό focus, στόχοι ≥44px, έλεγχος κίνησης", <span className="text-eu-blue font-semibold">Όλα τα components · axe στο CI</span>],
            ["GDPR · ePrivacy", "Ισότιμη απόρριψη cookies, ρυθμίσεις πάντα προσβάσιμες, ξεχωριστή μη προ-επιλεγμένη συγκατάθεση για newsletter, γεωεντοπισμός μόνο με ενέργεια χρήστη", <span className="text-eu-blue font-semibold">ConsentManager · NewsletterBand · StoreFinder</span>],
            ["Οδηγία 2012/19/ΕΕ · ΑΗΗΕ", "Ενημέρωση για δωρεάν παραλαβή παλιάς συσκευής από τον διανομέα", <span className="text-eu-blue font-semibold">ServicesBand · επιλογή στην παράδοση · footer</span>],
            ["PSD2 · SCA", "Ισχυρή ταυτοποίηση πληρωμής — το «ένα κλικ» δεν παρακάμπτει την επιβεβαίωση", <span className="text-eu-blue font-semibold">QuickBuySheet · checkout</span>],
            ["DSA · στοιχεία εμπόρου", "Επωνυμία, ΑΦΜ, ΓΕΜΗ, μητρώο ΑΗΗΕ, εναλλακτική επίλυση διαφορών, ανιχνεύσιμα σε κάθε σελίδα", <span className="text-eu-blue font-semibold">SiteFooter</span>],
          ]}
        />
        <div className="mt-4">
          <Callout title="Γιατί αυτό είναι εμπορικό, όχι νομικό θέμα" tone="red">
            Η χαμηλότερη τιμή 30 ημερών, η ενεργειακή ετικέτα και η σαφής διαθεσιμότητα είναι ακριβώς οι πληροφορίες που ο αγοραστής ψάχνει πριν αγοράσει. Ο Κωτσόβολος τα κρύβει στη σελίδα προϊόντος· εμείς τα βάζουμε στην κάρτα. Η συμμόρφωση, σωστά σχεδιασμένη, <em>είναι</em> αύξηση εμπιστοσύνης.
          </Callout>
        </div>
      </DocPage>

      {/* 11 · Tech & plan */}
      <DocPage no={11} tone="dark" label="Τεχνολογία & πλάνο">
        <PageHead title="Τεχνολογία & πλάνο υλοποίησης" section="Υλοποίηση" no={11} tone="dark" />
        <div className="grid grid-cols-2 gap-8 flex-1">
          <div>
            <Kicker tone="yellow">Η στοίβα — χωρίς ενδιάμεση πλατφόρμα</Kicker>
            <Body dark className="text-[12px]">
              <strong className="text-white">Next.js 16 (App Router)</strong> — server components για κάθε ανάγνωση δεδομένων· στατικές σελίδες με σταδιακή αναγέννηση: κατηγορίες 10′, προϊόντα 15′, καταστήματα 24h, άμεση ανανέωση όταν δημοσιεύει το CMS. Τιμή και απόθεμα έρχονται ζωντανά, το HTML μένει στο cache.
              <br />
              <br />
              <strong className="text-white">Prisma / MySQL 8</strong> — ο δικός μας commerce πυρήνας: κατάλογος (mirror του ERP), παραγγελίες, πελάτες, ζώνες/widgets, καταστήματα, υπηρεσίες. Καμία nopCommerce, Magento ή Woo στη μέση — ό,τι αποδείξαμε στο web.kolleris.com.
              <br />
              <br />
              <strong className="text-white">ERP adapters</strong> — sync καταλόγου/τιμών/αποθέματος ανά κατάστημα, εγγραφή παραγγελιών, πελάτης ↔ ΑΦΜ. Ο adapter του SoftOne είναι έτοιμος· ο adapter του ERP της Euronics γράφεται στη Φάση 1 πάνω στο ίδιο interface.
              <br />
              <br />
              <strong className="text-white">Custom CMS ζωνών</strong> — δομημένο περιεχόμενο και λίστα widgets ανά ζώνη με query, schedule, ορατότητα, A/B, live preview. <strong className="text-white">Motion</strong> για ό,τι έχει κατάσταση UI (mega-menu, sheet, slider), πάντα σε transform/opacity και ακυρωμένο σε prefers-reduced-motion.
            </Body>
          </div>
          <div>
            <Kicker tone="yellow">Πέντε φάσεις · 4 μήνες (απόφαση 24/7)</Kicker>
            <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-2 text-[11.5px] leading-[1.5] text-eu-on-dark">
              {[
                ["Kickoff", "3 εβδ.", "Design system στο brand, tokens, fluid/adaptive layer, μοντέλο ζωνών, data contracts με το ERP της Euronics"],
                ["Φάση 1", "5 εβδ.", "Θεμελίωση: Prisma schema, ERP adapter, sync καταλόγου/αποθέματος ανά κατάστημα, header, mega-menu, footer, αρχική με 12 ζώνες"],
                ["Φάση 2", "4 εβδ.", "Πυρήνας: category hub, λίστα με facets σε URL, αναζήτηση (Meilisearch), PDP με sticky buy box, variants, δόσεις, επιλογέα καταστήματος, σύγκριση, mini-cart, quick buy"],
                ["Φάση 3+4", "3 + 3 εβδ.", "Checkout 3 βημάτων, Viva/Stripe/IRIS/αντικαταβολή, δόσεις χωρίς κάρτα, click & collect, add-ons υπηρεσιών, λογαριασμός, tracking, RMA · CMS σελίδες, 12 υπηρεσίες, 350 καταστήματα, οδηγοί, redirects"],
                ["Φάση 5", "2 εβδ.", "Βελτιστοποίηση: Core Web Vitals, axe, A/B ζωνών, PostHog, launch μετά τη Black Friday 2026"],
              ].map(([f, d, t]) => (
                <div key={f} className="contents">
                  <div className="font-extrabold text-eu-yellow">
                    {f}
                    <br />
                    <span className="font-normal text-eu-on-dark-2">{d}</span>
                  </div>
                  <div>{t}</div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Callout title="Τι χρειαζόμαστε από τη Euronics" tone="blue">
                1 · Πρόσβαση σε analytics για προτεραιοποίηση ανά κατηγορία
                <br />
                2 · Σχήμα ERP/PIM και τρόπο πρόσβασης (API / views / export) για τα data contracts
                <br />
                3 · Πραγματικές τιμές & όρους υπηρεσιών (επέκταση εγγύησης, e-support, φύλαξη, εγκατάσταση)
                <br />
                4 · Βιβλιοθήκη φωτογραφιών προϊόντων και brand assets (γραμματοσειρά Euronics, service icons)
                <br />
                5 · Απόφαση Α ή Β — ή έγκριση της υβριδικής διαδρομής με A/B
              </Callout>
            </div>
          </div>
        </div>
        <div className="border-t border-eu-navy-line pt-4 mt-4 flex justify-between items-center">
          <div className="text-eu-on-dark-2 text-[11px] leading-[1.6]">
            Τα «πριν» είναι ανακατασκευές των τρεχόντων layouts με τα πραγματικά assets και κείμενα του euronics.gr (σαρώσεις 31/7 και 8/9/2026).
            <br />
            Το λειτουργικό prototype της αρχικής συνοδεύει αυτό το έγγραφο (Next.js, route «/»).
          </div>
          <Image src="/design/logo-on-blue.svg" alt="euronics" width={100} height={26} className="h-[26px] w-auto" />
        </div>
      </DocPage>
    </>
  );
}
