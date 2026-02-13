# Debugging Notes

## TypeScript Strict Mode
- `noUnusedLocals` and `noUnusedParameters` are ON -- every import/variable/param must be used
- Always run `npx tsc --noEmit` (or `npm run lint`) before declaring work complete
- The project script `lint` is just `tsc --noEmit`

## Common Pitfalls
- Sheet component is built on @radix-ui/react-dialog (not a dedicated sheet primitive)
- ScrollArea inside Sheet: must set `flex-1` on ScrollArea and `flex flex-col` on SheetContent for proper height
- SheetContent default has `p-6` padding -- override with `p-0` when managing layout manually
- Badge variants: use 'success' and 'warning' (not 'info' or custom strings)
- Collapsible from radix re-exports Root, CollapsibleTrigger, CollapsibleContent
