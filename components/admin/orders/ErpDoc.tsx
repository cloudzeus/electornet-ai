import { AlertTriangle, Check } from "lucide-react";
import { orderNum01, type ErpLogEntry } from "@/lib/softone/order-doc-core";
import { CopyValue } from "@/components/admin/settings/ui";
import { AccordionItem } from "@/components/admin/ui/Accordion";
import { Badge, dateTime } from "@/components/admin/orders/ui";

/**
 * Ο αριθμός του παραστατικού όπως φαίνεται ΜΕΣΑ στο SoftOne («PES 83»), με αντιγραφή. Το FINDOC είναι εσωτερικό id που το
 * προσωπικό δεν βλέπει στο ERP — φαίνεται μόνο όσο ο αριθμός δεν έχει διαβαστεί, και μέσα στις απαντήσεις από κάτω.
 */
export function ErpDocNo({ docNo, findoc, orderNumber }: { docNo: string | null; findoc: string; orderNumber: string }) {
  return (
    <div data-help="order.erp.docno">
      <CopyValue label="Αριθμός παραστατικού στο SoftOne" value={docNo ?? `FINDOC ${findoc}`}
        help={docNo ? <>Με αυτόν τον αριθμό το βρίσκεις στο SoftOne, στη σειρά παραγγελιών e-shop. Αλλιώς ψάξε τον αριθμό της παραγγελίας στο πεδίο NUM01: <span className="font-mono select-all">{orderNum01(orderNumber) ?? orderNumber}</span></> : "Ο αριθμός της σειράς δεν έχει διαβαστεί ακόμη από το SoftOne. Αυτό είναι το εσωτερικό του id."} />
    </div>
  );
}

/** Τι απάντησε το SoftOne σε κάθε βήμα κάθε αποστολής (ErpSync.log). Ανοιχτό όταν η αποστολή απέτυχε. */
export function ErpLog({ log, failed }: { log: unknown; failed: boolean }) {
  const rows = (Array.isArray(log) ? log : []) as ErpLogEntry[];
  if (!rows.length) return null;
  return (
    <div data-help="order.erp.log" className="print:hidden min-w-0">
      <AccordionItem title="Τι απάντησε το SoftOne" summary={`${rows.length} ${rows.length === 1 ? "βήμα" : "βήματα"} · τελευταίο ${dateTime(rows[rows.length - 1].at)}`} defaultOpen={failed}
        badge={rows.some((e) => !e.ok) ? <Badge tone="bad">με σφάλμα</Badge> : <Badge tone="good">εντάξει</Badge>}>
        <ol className="m-0 p-0 list-none grid gap-2">
          {rows.map((e, i) => (
            <li key={i} className="grid gap-1 min-w-0 text-[length:var(--fs-12)]">
              <span className="flex flex-wrap items-start gap-x-1.5 min-w-0">
                {e.ok ? <Check className="size-3.5 mt-0.5 shrink-0 text-eu-green" aria-hidden /> : <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-eu-red" aria-hidden />}
                <span className="font-bold text-eu-ink min-w-0 break-words grow basis-44">{e.step}<span className="sr-only">{e.ok ? ": εντάξει" : ": σφάλμα"}</span></span>
                <span className="text-eu-muted whitespace-nowrap tabular-nums pl-5">{dateTime(e.at)}</span>
              </span>
              <code className={`block rounded-lg border px-2 py-1.5 font-mono break-all whitespace-pre-wrap ${e.ok ? "bg-eu-surface border-eu-line text-eu-ink-2" : "bg-eu-red/5 border-eu-red/20 text-eu-ink"}`}>{e.text}</code>
            </li>
          ))}
        </ol>
      </AccordionItem>
    </div>
  );
}
