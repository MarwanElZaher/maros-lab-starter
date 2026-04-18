import NextAuth from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "@/lib/db";
import type { NextAuthOptions } from "next-auth";

// Add OAuth providers here — see https://next-auth.js.org/providers/
// Example: import GitHubProvider from "next-auth/providers/github"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  providers: [
    // GitHubProvider({
    //   clientId: process.env.GITHUB_CLIENT_ID!,
    //   clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    // }),
  ],
  session: {
    strategy: "database",
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
