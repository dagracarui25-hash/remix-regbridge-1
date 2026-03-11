

## Plan: Add `langue` field to /question API call

**Single change** in `src/hooks/useConversations.ts`, line 212:

Replace:
```ts
body: JSON.stringify({ question: trimmed }),
```

With:
```ts
body: JSON.stringify({ question: trimmed, langue: i18n.language.toUpperCase() }),
```

`i18n` is already imported in this file. No other files modified.

