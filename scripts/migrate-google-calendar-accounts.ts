/**
 * Migration Script: Move Google Calendar tokens from Better Auth Account to GoogleCalendarAccount
 *
 * This one-time script migrates existing users who connected Google via Better Auth login
 * to the new independent GoogleCalendarAccount model.
 *
 * Run with: bun run scripts/migrate-google-calendar-accounts.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrate() {
  console.log("Starting Google Calendar Account migration...");

  // 1. Find all Better Auth Google accounts with refresh tokens
  const betterAuthAccounts = await prisma.account.findMany({
    where: {
      providerId: "google",
      refreshToken: { not: null },
    },
    include: {
      user: true,
    },
  });

  console.log(
    `Found ${betterAuthAccounts.length} Better Auth Google account(s) to migrate`,
  );

  for (const ba of betterAuthAccounts) {
    if (!ba.accessToken || !ba.refreshToken) {
      console.log(`  Skipping account ${ba.id}: missing tokens`);
      continue;
    }

    // Extract email from idToken if available
    let email = ba.user.email; // fallback
    if (ba.idToken) {
      try {
        const payload = JSON.parse(
          Buffer.from(ba.idToken.split(".")[1], "base64url").toString("utf-8"),
        ) as { email?: string };
        if (payload.email) {
          email = payload.email;
        }
      } catch {
        console.log(
          `  Could not decode idToken for account ${ba.id}, using user email`,
        );
      }
    }

    // 2. Create GoogleCalendarAccount
    const googleAccount = await prisma.googleCalendarAccount.upsert({
      where: {
        userId_googleAccountId: {
          userId: ba.userId,
          googleAccountId: ba.accountId,
        },
      },
      create: {
        userId: ba.userId,
        googleAccountId: ba.accountId,
        email,
        accessToken: ba.accessToken,
        refreshToken: ba.refreshToken,
        accessTokenExpiresAt: ba.accessTokenExpiresAt,
        scope: ba.scope,
        isValid: true,
      },
      update: {
        // Don't overwrite if already migrated
      },
    });

    console.log(
      `  Created/found GoogleCalendarAccount ${googleAccount.id} for user ${ba.userId} (${email})`,
    );

    // 3. Update GoogleCalendarSync records to point to the new account
    const syncConfigs = await prisma.googleCalendarSync.findMany({
      where: { userId: ba.userId },
    });

    for (const sync of syncConfigs) {
      // Check if already has googleAccountId set
      const existing = await prisma.googleCalendarSync.findUnique({
        where: { id: sync.id },
      });

      if (
        existing &&
        "googleAccountId" in existing &&
        existing.googleAccountId
      ) {
        console.log(
          `    Sync config ${sync.id} already has googleAccountId, skipping`,
        );
        continue;
      }

      await prisma.googleCalendarSync.update({
        where: { id: sync.id },
        data: { googleAccountId: googleAccount.id },
      });

      console.log(
        `    Updated sync config ${sync.id} (${sync.calendarName}) → account ${googleAccount.id}`,
      );

      // 4. Update CalendarEvent.calendarId from raw Google Calendar ID to sync config ID
      const updatedEvents = await prisma.calendarEvent.updateMany({
        where: {
          userId: ba.userId,
          calendarId: sync.googleCalendarId,
          syncStatus: "synced",
        },
        data: {
          calendarId: sync.id,
        },
      });

      console.log(
        `    Updated ${updatedEvents.count} events calendarId: "${sync.googleCalendarId}" → "${sync.id}"`,
      );

      // 5. Update CalendarEvent.uid to new prefixed format
      const events = await prisma.calendarEvent.findMany({
        where: {
          userId: ba.userId,
          calendarId: sync.id,
          syncStatus: "synced",
        },
      });

      let uidUpdated = 0;
      for (const event of events) {
        // Only prefix if not already prefixed
        if (!event.uid.startsWith(`${sync.id}_`)) {
          await prisma.calendarEvent.update({
            where: { id: event.id },
            data: { uid: `${sync.id}_${event.uid}` },
          });
          uidUpdated++;
        }
      }

      if (uidUpdated > 0) {
        console.log(
          `    Updated ${uidUpdated} event UIDs with sync config prefix`,
        );
      }
    }
  }

  console.log("Migration complete!");
}

migrate()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
