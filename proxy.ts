import { NextResponse, type NextRequest } from "next/server";
import { appliesCsp, buildCsp } from "@/lib/security/csp";

/**
 * Content-Security-Policy με νέο nonce σε κάθε σελίδα (lib/security/csp.ts). Το Next βάζει αυτόματα το nonce στα
 * δικά του scripts όταν το βρίσκει στο αίτημα· τα analytics το παίρνουν από το `x-nonce` (app/layout.tsx).
 */
export function proxy(request: NextRequest) {
  // Πύλη συνεργατών: στο synergaton.* κάθε σελίδα σερβίρεται από το app/synergaton (καθαρά URL, π.χ. /syndesi)
  const portal = /^synergaton\./i.test(request.headers.get("host") ?? "") && !/^\/(synergaton|_next|api)(\/|$)/.test(request.nextUrl.pathname);
  const rewriteTo = portal ? new URL(`/synergaton${request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname}${request.nextUrl.search}`, request.url) : null;
  if (!appliesCsp(request.nextUrl.pathname)) return rewriteTo ? NextResponse.rewrite(rewriteTo) : NextResponse.next();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV === "development" });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = rewriteTo ? NextResponse.rewrite(rewriteTo, { request: { headers } }) : NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // όχι στατικά αρχεία / εικόνες / prefetch του next/link (δεν χρειάζονται CSP)
  matcher: [
    { source: "/((?!api|_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] },
    // στο synergaton.* και τα prefetch χρειάζονται το rewrite προς /synergaton, αλλιώς 404
    { source: "/((?!api|_next/static|_next/image|favicon.ico).*)", has: [{ type: "host", value: "synergaton\\..*" }] },
  ],
};
