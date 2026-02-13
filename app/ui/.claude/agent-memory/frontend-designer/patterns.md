# Component Patterns

## Drawer/Sheet Pattern (ActivityDrawer)
- Accept optional `trigger` prop (ReactNode) for custom trigger placement
- Export a default trigger button component separately for convenience
- Use `onOpenChange` on Sheet to fetch data when opened
- Structure: SheetContent > SheetHeader (border-b) + ScrollArea (flex-1)
- SheetContent needs `flex flex-col gap-0 p-0` to control layout manually
- Content padding goes on inner div inside ScrollArea, not SheetContent itself

## State Display Pattern
Three mutually exclusive states: loading / error / content (empty or populated)
- Loading: centered Spinner with "Loading..." text
- Error: centered icon + message + retry Button (outline, sm)
- Empty: centered icon in muted bg circle + display font heading + encouraging copy
- Content: list of cards with staggered bounce-in animation

## Collapsible Details Pattern (Bulk Entries)
- Wrap in Collapsible with local useState for open
- CollapsibleTrigger uses `asChild` with a styled button element
- Show ChevronDown/ChevronRight based on open state
- Content uses left border (`border-l-2`) as visual connector
- Items are small (text-xs) with status dots

## Timestamp Formatting
Use `Intl.DateTimeFormat` with `timeZone: 'America/New_York'` -- instantiate once at module level for performance.
Format produces "February 13, 2026 at 6:10 PM" style output.
