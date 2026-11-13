import { destroyCustomerSession } from "@/lib/account/session";
export async function POST() {
  await destroyCustomerSession();
  // σχετικό Location: πίσω από τον proxy το req.url είναι localhost:3000
  return new Response(null, { status: 303, headers: { Location: "/" } });
}
