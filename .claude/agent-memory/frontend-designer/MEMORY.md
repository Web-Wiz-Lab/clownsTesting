# Frontend Designer Memory

## Project: Sling Schedule Manager Migration

### Tech Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 7.3.1
- **Styling**: Tailwind CSS v3.4.0 (v4 had compatibility issues with Vite 7)
- **UI Components**: shadcn/ui (manually installed components)
- **Date Handling**: date-fns + react-day-picker
- **Icons**: lucide-react

### Tailwind CSS Version Notes
- Initially attempted Tailwind v4 with CSS `@theme` configuration
- Vite 7 and @tailwindcss/vite@4 have peer dependency conflicts
- Switched to Tailwind v3 with traditional tailwind.config.js
- Used --legacy-peer-deps flag for package installations

### shadcn/ui Implementation
- Manual component installation required due to dependency conflicts
- Created custom Select component for native `<select>` with optgroups
- Badge variants extended for success/warning states
- Alert variants extended for success/warning states
- Calendar component adjusted for react-day-picker compatibility

### Color Scheme
- **Primary**: Blue (HSL 221.2 83.2% 53.3%) - modern professional look
- **Success**: Green (HSL 142.1 70.6% 45.3%) - for published status
- **Warning**: Amber (HSL 37.7 92.1% 50.2%) - for unpublished/edited states
- **Destructive**: Red (HSL 0 84.2% 60.2%) - for errors
- Inter font family throughout

### Key UX Patterns Preserved
1. **Time Select with Optgroups**: Native `<select>` with MORNING/AFTERNOON/EVENING groups
2. **Dynamic End Time Filtering**: End time options filter based on selected start time
3. **Yellow Highlight on Edit**: Edited rows get warning-100 background color
4. **No-Change Detection**: Auto-cancels if no actual changes made
5. **Flash Success Animation**: Green flash on unmatched shift update (1.2s ease-in-out)
6. **Collapsible Banner**: Arrow rotation (180deg) animation on expand/collapse
7. **Modal States**: Loading (spinner) → Success (checkmark) → Error (X) with auto-dismiss

### State Management
- Single `useSchedule` hook manages all application state
- No external state libraries (Redux/Zustand)
- Local component state for edit values
- Bulk edit mode stores original values for comparison

### File Structure Pattern
```
src/
├── features/schedule/     # Feature-specific components
├── components/ui/         # Reusable shadcn components
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities (API, errors, time)
└── types/                 # TypeScript type definitions
```

### API Integration
- Environment variable: `VITE_API_BASE_URL`
- Request ID on all requests
- Idempotency keys on POST/PUT operations
- Error reporting to Slack with fingerprint deduplication
- Friendly error messages mapped from error codes

### Build Configuration
- Path alias: `@/*` → `./src/*`
- TypeScript strict mode enabled
- PostCSS with Tailwind and Autoprefixer
- Build output: `dist/` directory

### Common Issues & Solutions
- **Vite 7 + Tailwind v4**: Use Tailwind v3 instead
- **shadcn CLI failures**: Install Radix dependencies manually with --legacy-peer-deps
- **Optgroup support**: Use native `<select>` instead of Radix Select
- **TypeScript errors**: Prefix unused parameters with underscore

### Component Composition Patterns
- TimeSelect + StatusSelect for inline editing
- TeamRow handles both display and edit modes
- BulkControls visibility toggled by edit mode state
- OperationModal controlled by state.modal object

### Testing Checklist
- npm run dev → starts dev server
- npm run build → produces dist/
- npm run preview → serves built files locally
- All 22 UX patterns functional
- Enter key triggers search
- URL ?date=MM/DD/YYYY auto-loads
- Slack error reporting works
