import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { recordLogin } from "@/lib/gdpr/consent";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string; roles: string[]; permissions: string[]; storeId?: string | null };
  }
}

/**
 * Back-office authentication (Auth.js v5). Credentials against the Staff
 * table (bcrypt), JWT session carrying role keys and the flattened
 * permission keys so every server component/action can check `can()`
 * without a DB round-trip. SSO providers (Microsoft Entra, Google) plug in
 * here later without touching the pages.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 12 * 3600 },
  pages: { signIn: "/admin/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (c) => {
        const email = String(c.email ?? "").toLowerCase().trim();
        const password = String(c.password ?? "");
        if (!email || !password) return null;
        const staff = await db.staff.findUnique({ where: { email }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
        if (!staff || !staff.active || !staff.passwordHash) { await recordLogin({ email, success: false, method: "admin", reason: !staff ? "unknown" : "blocked" }); return null; }
        const ok = await bcrypt.compare(password, staff.passwordHash);
        if (!ok) { await recordLogin({ staffId: staff.id, email, success: false, method: "admin", reason: "bad-password" }); return null; }
        await db.staff.update({ where: { id: staff.id }, data: { lastLoginAt: new Date() } });
        const roles = staff.roles.map((r) => r.role.key);
        const permissions = roles.includes("super-admin") ? ["*"] : [...new Set(staff.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key)))];
        if (!permissions.length) { await recordLogin({ staffId: staff.id, email, success: false, method: "admin", reason: "no-access" }); return null; } // e.g. «customer» role
        await recordLogin({ staffId: staff.id, email, success: true, method: "admin" });
        return { id: staff.id, email: staff.email, name: staff.name, roles, permissions, storeId: staff.storeId };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        const u = user as { id: string; roles: string[]; permissions: string[]; storeId?: string | null };
        token.id = u.id;
        token.roles = u.roles;
        token.permissions = u.permissions;
        token.storeId = u.storeId ?? null;
      }
      return token;
    },
    session: ({ session, token }) => {
      session.user.id = token.id as string;
      session.user.roles = (token.roles as string[]) ?? [];
      session.user.permissions = (token.permissions as string[]) ?? [];
      session.user.storeId = (token.storeId as string | null) ?? null;
      return session;
    },
  },
});
