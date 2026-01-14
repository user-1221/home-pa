# LLM Integration

## Overview

HomePA uses Gemini API (via `@google/generative-ai` SDK) for task enrichment. The LLM automatically suggests metadata for newly created tasks, improving the suggestion system's accuracy.

## Architecture

```
Client (Browser)
    ↓
enrichMemoViaAPI(memo)
    ↓
Remote Function (enrich.remote.ts)
    ↓ Server-side (API key secure)
Gemini API (gemini-2.5-flash-lite)
    ↓
EnrichmentResult
    ↓
Task updated with enriched fields
```

## Enrichment Fields

The LLM fills these optional fields on tasks:

| Field                   | Type                        | Description                                         |
| ----------------------- | --------------------------- | --------------------------------------------------- |
| `genre`                 | string                      | Task category: 勉強, 運動, 家事, 仕事, 趣味, その他 |
| `importance`            | "low" \| "medium" \| "high" | Priority level                                      |
| `sessionDuration`       | number                      | Recommended minutes per session (10-120)            |
| `totalDurationExpected` | number                      | Estimated total minutes to complete                 |

## Configuration

### Environment Variables

```bash
# .env or environment
GEMINI_API_KEY=your-api-key-here
```

### Model Selection

Default model: `gemini-2.5-flash-lite` (most cost-effective)

Configurable via `LLMEnrichmentConfig`:

```typescript
interface LLMEnrichmentConfig {
  apiKey?: string;
  model?: string; // default: "gemini-2.5-flash-lite"
  maxConcurrent?: number; // default: 2
  requestDelayMs?: number; // default: 500
  enableCache?: boolean; // default: true
}
```

## Prompt Design

The LLM receives a structured prompt:

```
You are a task planning assistant. Given a task, estimate the following properties.

Task: "{memo.title}"
Type: {memo.type}
{Deadline info if present}

Please estimate:
1. Genre (category): one of [勉強, 運動, 家事, 仕事, 趣味, その他]
2. Importance: "low", "medium", or "high"
3. Session duration: recommended minutes per session (10-120, in 10-min increments)
4. Total duration: estimated total minutes to complete the task

Respond with ONLY valid JSON...
```

## Response Validation

Responses are validated with valibot:

```typescript
const RawLLMResponseSchema = v.object({
  genre: v.optional(v.string()),
  importance: v.optional(v.string()),
  sessionDuration: v.optional(v.number()),
  totalDurationExpected: v.optional(v.number()),
});
```

After parsing, values are sanitized:

- `genre` must be in valid list, else "その他"
- `importance` must be low/medium/high, else "medium"
- `sessionDuration` clamped to 10-120 range
- `totalDurationExpected` must be ≥ sessionDuration

## Fallback Behavior

When LLM is unavailable or fails, rule-based fallbacks are used:

### By Task Type

| Type       | Session | Total  | Importance |
| ---------- | ------- | ------ | ---------- |
| 期限付き   | 45 min  | 90 min | medium     |
| ルーティン | 30 min  | 30 min | medium     |
| バックログ | 30 min  | 60 min | medium     |

### Genre Detection (Keyword-based)

- 勉強: "勉強", "study", "読書", "learn"
- 運動: "運動", "exercise", "ジム", "散歩"
- 家事: "掃除", "洗濯", "料理", "家事"
- 仕事: "仕事", "work", "会議", "メール"

## Caching

In-memory cache prevents redundant API calls:

```typescript
// Cache structure: memo.id → EnrichmentResult
const enrichmentCache = new Map<string, EnrichmentResult>();

// API functions
clearEnrichmentCache(); // Clear all
invalidateCacheEntry(memoId); // Clear specific
getCacheStats(); // Debug info
```

## Rate Limiting

Batch enrichment includes built-in rate limiting:

```typescript
async function enrichMemos(memos: Memo[], config: LLMEnrichmentConfig) {
  for (const memo of memos) {
    await enrichMemo(memo, config);
    // Delay between requests (default: 500ms)
    await sleep(config.requestDelayMs);
  }
}
```

## Usage

### Client-Side (Browser)

```typescript
import { enrichMemoViaAPI } from "$lib/features/assistant/services/suggestions/llm-enrichment";

// Enrich a single memo (calls Remote Function)
const enrichment = await enrichMemoViaAPI(memo);

// enrichment = {
//   genre: "勉強",
//   importance: "medium",
//   sessionDuration: 45,
//   totalDurationExpected: 90
// }
```

### Server-Side (Direct)

```typescript
import { enrichMemo } from "$lib/features/assistant/services/suggestions/llm-enrichment";

// Direct call (for server-side code)
const enrichedMemo = await enrichMemo(memo, {
  apiKey: process.env.GEMINI_API_KEY,
});
```

## File References

| Purpose           | File                                                        |
| ----------------- | ----------------------------------------------------------- |
| Client-side logic | `features/assistant/services/suggestions/llm-enrichment.ts` |
| Remote Function   | `features/assistant/services/suggestions/enrich.remote.ts`  |
| Type definitions  | `lib/types.ts` (EnrichmentResult, ImportanceLevel)          |

## Error Handling

The system gracefully degrades on errors:

1. **No API Key**: Uses fallback immediately
2. **SDK Not Installed**: Catches import error, uses fallback
3. **API Error**: Logs error, uses fallback
4. **Parse Error**: Validates response, uses fallback if invalid

No errors are shown to users - tasks remain fully functional without enrichment.

## Security

- **API Key**: Never sent to browser, stays on server
- **Remote Function**: Validates input with valibot schema
- **No PII in Prompts**: Only task title and type sent to LLM

## Cost Optimization

1. **Model**: Uses `gemini-2.5-flash-lite` (cheapest)
2. **Caching**: Avoids duplicate requests
3. **Rate Limiting**: Prevents quota exhaustion
4. **Fallback First**: Can disable LLM entirely if needed
