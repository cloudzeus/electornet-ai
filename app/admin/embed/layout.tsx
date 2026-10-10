import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Διαχείριση", template: "%s · Διαχείριση euronics" }, robots: { index: false, follow: false } };

/** Σελίδες της διαχείρισης χωρίς πλαίσιο (μενού, header), για άνοιγμα μέσα σε άλλον editor — π.χ. Hero slides μέσα στις Ζώνες αρχικής. */
export default async function EmbedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  return <div className="eu-admin eu-container min-h-dvh bg-eu-surface"><main className="eu-container min-w-0 p-4 @md:p-5 grid gap-5 content-start">{children}</main></div>;
}
