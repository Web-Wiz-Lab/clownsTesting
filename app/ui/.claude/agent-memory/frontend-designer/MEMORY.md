# Frontend Designer Agent Memory

## Project: Sling Schedule Manager
- **Stack**: React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS v4 + shadcn/ui (New York style)
- **Theme**: "Sunday Morning Clarity" -- peachy-orange primary, soft teal secondary, lavender accent
- **Fonts**: DM Sans (body via `font-family-sans`), Fredoka (display via `font-display`)
- **Border radius**: 1rem base (`--radius`), components use `rounded-2xl` / `rounded-3xl` heavily
- **tsconfig**: strict mode with `noUnusedLocals` and `noUnusedParameters` -- every import must be used

## Key File Paths
- `src/index.css` -- Theme variables, animations (bounce-in, wiggle, shine, flash-success)
- `src/lib/utils.ts` -- `cn()` helper (clsx + tailwind-merge)
- `src/lib/api.ts` -- `apiRequest<T>()` generic fetch wrapper
- `src/types/activity.ts` -- ActivityEntry, ActivityGroup, ActivityResponse, ChangelogDay
- `src/types/schedule.ts` -- ShiftData, TeamData, BulkUpdateGroup, etc.
- `src/hooks/use-activity.ts` -- entries, loading, loadingMore, error, nextCursor, fetchActivity, fetchMore
- `src/hooks/use-changelog.ts` -- days, loading, error, investigating, fetchChangelog, dismissInvestigating, checkInvestigating
- `src/features/changelog/ChangelogDrawer.tsx` -- ChangelogDrawer + ChangelogTriggerButton (exports)
- `src/features/activity/ActivityDrawer.tsx` -- ActivityDrawer + ActivityTriggerButton (reference pattern)

## Installed shadcn/ui Components
alert, badge, button, calendar, collapsible, dialog, native-select, popover, scroll-area, select, sheet, spinner, table

## Badge Variants
default, secondary, destructive, outline, success, warning

## Button Variants
default, destructive, outline, secondary, ghost, link | Sizes: default, sm, lg, icon

## Design Patterns
- Cards use `bg-white/80 border border-border/50 shadow-sm hover:shadow-md rounded-2xl` with padding p-4 or p-5
- Animations use `animate-bounce-in` class with staggered `animationDelay` via inline style
- Status indicators use colored dots (`h-2 w-2 rounded-full`) inside Badge components (see StatusBadge.tsx)
- Empty states: centered column, icon in rounded-full muted bg, display font heading, muted description
- Error states: similar to empty, with destructive color bg and retry button
- OperationModal pattern: Dialog with Spinner/CheckCircle2/XCircle for loading/success/error
- Sheet is pre-configured for right side: `sm:w-[30vw] sm:min-w-[360px] sm:max-w-[520px]`
- Drawer pattern: Sheet + SheetContent(p-0) > SheetHeader(px-6 pt-6 pb-4 border-b) + ScrollArea(flex-1) > div(px-6 py-4)
- Notification dot pattern: `absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5` with animate-pulse inner span + solid outer span
- Warning banner: `rounded-2xl border-warning-300 bg-warning-50 p-4` with Radio icon in warning-200 circle

## CSS Custom Colors
- success-50 through success-950 (mint green)
- warning-50 through warning-950 (sunny yellow-orange)
- primary: hsl(24 88% 65%) -- peachy-orange
- destructive: hsl(8 85% 62%) -- coral
- accent: hsl(260 60% 96%) -- lavender
- secondary: hsl(170 50% 94%) -- soft teal
