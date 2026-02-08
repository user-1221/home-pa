import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { prisma } from "./server/prisma";
import { appName } from "./app-info.ts";
import { getRequestEvent } from "$app/server";
import { bearer } from "better-auth/plugins";
import { dev } from "$app/environment";
import { featureFlags } from "./config/feature-flags.ts";

export const auth = betterAuth({
  appName,
  database: prismaAdapter(prisma, { provider: "mongodb" }),
  // Only use BETTER_AUTH_URL in production
  ...(dev ? {} : { baseURL: process.env.BETTER_AUTH_URL }),
  plugins: [bearer(), sveltekitCookies(getRequestEvent)],
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      scope: ["openid", "email", "profile"],
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async () => {
          if (featureFlags.MAX_ACCOUNTS <= 0) return;

          const count = await prisma.user.count();
          if (count >= featureFlags.MAX_ACCOUNTS) {
            throw new APIError("FORBIDDEN", {
              message: "Registration is currently closed.",
            });
          }
        },
      },
    },
  },
});
