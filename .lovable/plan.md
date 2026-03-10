

## Layout Fix Plan

### Problem 1: Sidebar button overlapping tab bar

The `ChatSidebar` is inside `QuestionFinma` which is rendered inside the tab content area. The sidebar's z-index (`z-[1]`) combined with its absolute/fixed positioning causes it to overlap the tab bar above.

**Fix in `src/components/ChatSidebar.tsx`:**
- Add `overflow-hidden` to the Sidebar to prevent content from visually bleeding out
- Ensure the sidebar stays contained with a max-width

**Fix in `src/pages/Index.tsx`:**
- Increase the tab bar's z-index to `z-[10]` so it always sits above the sidebar

### Problem 2: Truncated conversation titles need tooltips

**Fix in `src/components/ChatSidebar.tsx`:**
- Add a `title` attribute with the full conversation title on the truncated `<span>`
- Wrap each conversation item with a custom tooltip using Tailwind's `group-hover` pattern — a positioned `<div>` that appears on hover with the specified dark style (`bg-[#1E293B]`, white text, rounded, etc.), positioned to the right of the sidebar item

### Files to modify

1. **`src/pages/Index.tsx`** (line 84): Change the tab bar container's z-index from implicit to explicit `z-[10]` to ensure it layers above the sidebar.

2. **`src/components/ChatSidebar.tsx`**:
   - Add `overflow-hidden` to the Sidebar component
   - On each conversation item (line 91), add `title={conv.title}` on the truncated span
   - Add a hover tooltip `<div>` inside `SidebarMenuItem` that shows the full title on hover, styled with the specified dark theme, positioned absolutely to the right

### No changes to
- Any text content, colors, icons, or functionality
- Any other components or files

