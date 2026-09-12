"use client";


import { X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useCart } from "./CartProvider";
import { instalment, priceLong, weekday } from "@/lib/format";
import { useDevice } from "@/components/fluid/DeviceProvider";
import { ProductImage } from "@/components/commerce/ProductImage";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("quickBuy");

/**
 * Quick buy — «Αγορά με 1 κλικ» never orders silently. Directive
 * 2011/83/EU: total cost with shipping and VAT before commitment, a
 * button that states the payment obligation, 14-day withdrawal notice,
 * and bank confirmation (3D Secure) on confirmation. One sheet, three fields, no redirect.
 * On phones it becomes a bottom sheet; on desktop a right-hand panel.
 */
export function QuickBuySheet() {
  const { quickBuy, closeQuickBuy } = useCart();
  const { device } = useDevice();
  const p = quickBuy;
  const months = 12;
  const delivery = p
    ? p.availability.kind === "order"
      ? "κατόπιν παραγγελίας"
      : weekday(new Date(p.availability.deliveryDate))
    : "";

  return (
    <Sheet open={!!p} onOpenChange={(o) => !o && closeQuickBuy()}>
      <SheetContent
        side={device === "mobile" ? "bottom" : "right"}
        className="w-full p-0 gap-0 rounded-t-2xl sm:rounded-none border-0 shadow-[var(--shadow-overlay)]"
        style={device === "mobile" ? undefined : { maxWidth: "min(100vw, 460px)" }}
        showCloseButton={false}
      >
        {p && (
          <div className="p-5 sm:p-6 flex flex-col gap-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-eu-line-2 pb-3">
              <SheetTitle className="font-extrabold text-eu-ink text-[length:var(--fs-16)]">{c.grigori_agora}</SheetTitle>
              <button
                type="button"
                onClick={closeQuickBuy}
                className="inline-flex items-center gap-1 text-eu-muted-2 font-semibold text-[length:var(--fs-14)] min-h-11 px-2 rounded-full hover:text-eu-ink"
              >
                {c.kleisimo} <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="flex gap-3 items-center">
              <ProductImage src={p.image} sizes="52px" className="size-[52px]" rounded="rounded-md" />
              <div className="min-w-0">
                <div className="font-bold text-eu-ink text-[length:var(--fs-15)] leading-tight">
                  {p.brand} {p.title}
                </div>
                <div className="font-extrabold text-eu-blue text-[length:var(--fs-15)] mt-1">{priceLong(p.price)}</div>
              </div>
            </div>

            <div className="grid gap-2">
              <Row label={`Παράδοση στη διεύθυνσή μου · ${delivery}`} />
              <Row label="Κάρτα •••• 4821" />
              <Row label={`${months} άτοκες δόσεις × ${priceLong(instalment(p.price, months))}`} />
            </div>

            <div className="bg-eu-surface rounded-md p-3 text-eu-ink-2 text-[length:var(--fs-14)] leading-relaxed">
              Προϊόν {priceLong(p.price)} · Μεταφορικά 0,00 € · ΦΠΑ 24% περιλαμβάνεται
              <div className="font-extrabold text-eu-ink text-[length:var(--fs-16)] mt-1">Σύνολο {priceLong(p.price)}</div>
            </div>

            <button
              type="button"
              className="w-full rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-15)] py-4 hover:bg-eu-yellow-dark transition-colors min-h-12"
            >
              Πληρωμή {priceLong(p.price)} & ολοκλήρωση
            </button>
            <p className="text-eu-muted text-[length:var(--fs-13)] leading-snug m-0">
              {c.chreonetai_i_karta_soy}
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex justify-between items-center border border-eu-line rounded-md px-3 py-3 text-left font-medium text-eu-ink-2 text-[length:var(--fs-14)] min-h-11 hover:border-eu-blue"
    >
      <span>{label}</span>
      <span className="text-eu-muted-2 text-[length:var(--fs-13-5)]">{c.allagi}</span>
    </button>
  );
}
