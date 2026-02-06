# Security Principles

Security guidelines for Home-PA development. Follow these rules across all features.

## 1. Authentication & Authorization

### Always verify authentication first

Every server-side function must check authentication before any business logic:

```typescript
function getAuthenticatedUser(): string {
  const event = getRequestEvent();
  if (!event.locals.user?.id) {
    throw new Error("Unauthorized");
  }
  return event.locals.user.id;
}
```

### Scope all data queries by userId

Never trust client-provided IDs alone. Always include `userId` in database queries:

```typescript
// GOOD: Scoped by authenticated user
const account = await prisma.googleCalendarAccount.findFirst({
  where: { id: input.accountId, userId },
});

// BAD: Trusts client-provided ID
const account = await prisma.googleCalendarAccount.findUnique({
  where: { id: input.accountId },
});
```

### Verify ownership before mutations

Before updating or deleting resources, verify the authenticated user owns them:

```typescript
// Verify ownership before deleting
const account = await prisma.googleCalendarAccount.findFirst({
  where: { id: input.accountId, userId },
});
if (!account) {
  throw new Error("Account not found"); // Don't reveal whether it exists
}
await prisma.googleCalendarAccount.delete({ where: { id: input.accountId } });
```

## 2. OAuth & External Services

### Use cryptographically random state parameters

OAuth `state` prevents CSRF. Never use predictable values (like user IDs):

```typescript
// GOOD: Random, one-time-use state
import { randomUUID } from "crypto";
const state = randomUUID();
oauthStateStore.set(state, { userId, expiresAt: Date.now() + TTL });

// BAD: Predictable state
const state = userId; // Attacker can guess this
```

### Validate and consume state tokens

State tokens should be:

- Validated against stored value (not just existence)
- Checked for expiration
- Deleted after use (one-time use)

### Request minimal OAuth scopes

Only request permissions you actually need:

```typescript
scope: [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  // Not: calendar (full access)
],
```

## 3. Secrets & Token Storage

### Encrypt tokens at rest

OAuth tokens grant access to external accounts. Encrypt before storing:

```typescript
import { encryptToken, decryptToken } from "$lib/server/crypto.ts";

// Storing
await prisma.update({
  data: { accessToken: encryptToken(token) },
});

// Reading
const token = decryptToken(account.accessToken);
```

### Never log tokens or secrets

Tokens, API keys, and passwords must never appear in logs:

```typescript
// GOOD: Log metadata only
console.log(`Token refreshed for ${account.email}`);

// BAD: Token in log
console.log(`New token: ${accessToken}`);
```

### Use environment variables for secrets

Never hardcode secrets in source code:

```typescript
// GOOD
const key = process.env.TOKEN_ENCRYPTION_KEY;

// BAD
const key = "my-secret-key-12345";
```

## 4. Input Validation

### Validate all external input

Use valibot schemas for all remote function inputs:

```typescript
const EnableSyncSchema = v.object({
  accountId: v.string(),
  calendarIds: v.array(v.string()),
});

export const enableCalendarSync = command(EnableSyncSchema, async (input) => {
  // input is now typed and validated
});
```

### Sanitize data for display

When displaying user-provided content, ensure proper escaping. Svelte does this automatically for `{expressions}`, but be careful with `{@html}`.

## 5. Error Handling

### Don't leak internal details

Error messages should be helpful but not reveal system internals:

```typescript
// GOOD: Generic error
throw new Error("Google account not found");

// BAD: Reveals internal state
throw new Error(`Account ${accountId} not in table GoogleCalendarAccount`);
```

### Log details server-side, return generic errors client-side

```typescript
try {
  await externalApi.call();
} catch (err) {
  console.error("[google-sync] API error:", err); // Full details in logs
  throw new Error("Failed to sync calendar"); // Generic to client
}
```

## 6. Database Security

### Use unique constraints to prevent duplicates

Prevent race conditions and data inconsistencies with database constraints:

```prisma
model GoogleCalendarAccount {
  @@unique([userId, googleAccountId])  // One connection per Google account per user
}
```

### Use cascade deletes for cleanup

When a parent record is deleted, related records should be cleaned up:

```prisma
model GoogleCalendarAccount {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

## 7. Rate Limiting & DoS Prevention

### Consider rate limits for expensive operations

For operations that consume external APIs or significant resources, add throttling:

```typescript
// Simple in-memory rate limiting
const lastSyncTime = new Map<string, number>();
const MIN_SYNC_INTERVAL = 60_000; // 1 minute

if (Date.now() - (lastSyncTime.get(userId) ?? 0) < MIN_SYNC_INTERVAL) {
  throw new Error("Please wait before syncing again");
}
```

## 8. Checklist for New Features

When adding features that handle sensitive data or external services:

- [ ] All remote functions check authentication
- [ ] Database queries are scoped by userId
- [ ] External tokens are encrypted at rest
- [ ] OAuth state uses cryptographic randomness
- [ ] Input is validated with schemas
- [ ] Error messages don't leak internals
- [ ] Secrets use environment variables
- [ ] No tokens or secrets in logs
