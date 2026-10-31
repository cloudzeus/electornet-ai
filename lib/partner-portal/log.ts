import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type LogKind = "engine.event" | "test" | "upload" | "mapping" | "login" | "password" | "profile" | "import" | "ai" | "connection" | "restock";

/** Μία γραμμή στο ιστορικό του μέλους (οθόνη «Ιστορικό & logs» της πύλης και καρτέλα μέλους στη διαχείριση). Ποτέ δεν πετά. */
export async function portalLog(partnerId: string, kind: LogKind, ok: boolean, message: string, o: { accountId?: string | null; staffId?: string | null; connectionId?: string | null; detail?: unknown; ms?: number } = {}) {
  await db.partnerLog
    .create({ data: { partnerId, kind, ok, message: message.slice(0, 500), accountId: o.accountId ?? null, staffId: o.staffId ?? null, connectionId: o.connectionId ?? null, ms: o.ms ?? null, detail: (o.detail ?? undefined) as Prisma.InputJsonValue | undefined } })
    .catch(() => null);
}
