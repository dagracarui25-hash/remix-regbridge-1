

## Plan: Fix 2 issues

### CORRECTION 1 -- Sidebar button hidden

**Root cause**: The `z-[1]` added to the `motion.div` in `src/pages/Index.tsx` (line 118) creates a low stacking context. The sidebar inside it has `position: fixed; z-index: 10` but is trapped inside the `z-[1]` parent. The tab bar has `z-[10]`, so it covers the top portion of the sidebar (where the button is).

**Fix in `src/pages/Index.tsx`**: Remove `z-[1]` from the motion.div class. The suggestions don't need it since they're inside a scrollable container that's already positioned below the tab bar in the flex layout.

```tsx
// Line 118: remove z-[1]
className="flex-1 flex flex-col overflow-hidden absolute inset-0"
```

### CORRECTION 2 -- Floating suggestions offset for EN/IT

**Fix in `src/components/QuestionFinma.tsx`**: Add dynamic top padding on the scroll container based on active language. EN and IT need extra `pt-20` instead of `pt-16`.

```tsx
const lang = i18n.language;
const needsExtraTop = lang === "en" || lang === "it";
// On the scroll div:
className={`h-full overflow-y-auto px-4 sm:px-8 lg:px-16 ${needsExtraTop ? 'pt-20' : 'pt-16'} py-6 pb-8`}
```

### Files modified
1. `src/pages/Index.tsx` -- Remove `z-[1]` from motion.div (line 118)
2. `src/components/QuestionFinma.tsx` -- Dynamic top padding for EN/IT

