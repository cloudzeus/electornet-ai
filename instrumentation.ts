/** Ξεκινά μία φορά ανά Next.js server. Μόνο στο Node runtime — ο scheduler θέλει βάση και χρόνο ζωής διεργασίας. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
