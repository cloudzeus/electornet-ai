import { redirect } from "next/navigation";
import { getPortalUser, portalBase } from "@/lib/partner-portal/session";
import { LoginFlow } from "@/components/synergaton/LoginFlow";

export const metadata = { title: "Είσοδος" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const base = await portalBase();
  if (await getPortalUser()) redirect(base || "/");
  return <LoginFlow base={base} />;
}
