import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { recordLogin } from "@/lib/gdpr/consent";
import { verifyStaffOtp } from "@/lib/auth/otp";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string; roles: string[]; permissions: string[]; storeId?: string | null };
  }
}

/**
 * Back-office authentication (Auth.js v5), **two factors**.
 *
 * Ο κωδικός πρόσβασης ελέγχεται στο `app/admin/login` (server action), που
 * στέλνει 6ψήφιο OTP στο εταιρικό email και δίνει ένα `challengeId`. Εδώ
 * φτάνει μόνο το δεύτερο βήμα: `challengeId` + `code`. Έτσι ο κωδικός δεν
 * ταξιδεύει δεύτερη φορά και η συνεδρία δημιουργείται μόνο αφού
 * επαληθευτεί ο δεύτερος παράγοντας.
 *
 * JWT συνεδρία με τα role keys και τα δικαιώματα «στρωμένα», ώστε κάθε
 * server component/action να ελέγχει `can()` χωρίς ερώτημα στη βάση. SSO
 * (Microsoft Entra, Google) μπαίνει ως provider χωρίς αλλαγή στις σελίδες.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 12 * 3600 },
  pages: { signIn: "/admin/login" },
  providers: [
    Credentials({
      credentials: { challengeId: {}, code: {} },
      authorize: async (c) => {
        const challengeId = String(c.challengeId ?? "");
        const code = String(c.code ?? "");
        if (!challengeId || !code) return null;
        const v = await verifyStaffOtp(challengeId, code);
        if (!v.ok) return null;
        const staff = await db.staff.findUnique({ where: { id: v.staffId }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
        if (!staff || !staff.active) { await recordLogin({ staffId: v.staffId, email: staff?.email ?? "", success: false, method: "admin", reason: "blocked" }); return null; }
        const roles = staff.roles.map((r) => r.role.key);
        const permissions = roles.includes("super-admin") ? ["*"] : [...new Set(staff.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key)))];
        if (!permissions.length) { await recordLogin({ staffId: staff.id, email: staff.email, success: false, method: "admin", reason: "no-access" }); return null; }
        await db.staff.update({ where: { id: staff.id }, data: { lastLoginAt: new Date() } });
        await recordLogin({ staffId: staff.id, email: staff.email, success: true, method: "admin-otp" });
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
