import { NextResponse, type NextRequest } from "next/server";
import { appliesCsp, buildCsp } from "@/lib/security/csp";

/**
 * Content-Security-Policy με νέο nonce σε κάθε σελίδα (lib/security/csp.ts). Το Next βάζει αυτόματα το nonce στα
 * δικά του scripts όταν το βρίσκει στο αίτημα· τα analytics το παίρνουν από το `x-nonce` (app/layout.tsx).
 */
export function proxy(request: NextRequest) {
  if (!appliesCsp(request.nextUrl.pathname)) return NextResponse.next();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV === "development" });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // όχι στατικά αρχεία / εικόνες / prefetch του next/link (δεν χρειάζονται CSP)
  matcher: [{ source: "/((?!api|_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }],
};
