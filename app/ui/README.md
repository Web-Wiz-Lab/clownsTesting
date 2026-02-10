# Sling Schedule Manager - React Frontend

Modern React application for managing Sling shift schedules with Caspio team assignments.

## Tech Stack

- **React 18** with TypeScript
- **Vite 7** - Fast development server and build tool
- **Tailwind CSS v3** - Utility-first CSS framework
- **shadcn/ui** - High-quality React components
- **Inter Font** - Modern, professional typography
- **date-fns** - Date formatting and manipulation

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
cd app/ui
npm install
```

### Environment Configuration

Create a `.env` file in the `app/ui` directory:

```env
VITE_API_BASE_URL=https://sling-scheduling-89502226654.us-east1.run.app
```

### Development

Start the Vite development server with hot module replacement:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Building for Production

```bash
npm run build
```

Builds to `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

Serves the built files at `http://localhost:4173`

## Project Structure

```
src/
├── features/schedule/     # Schedule management feature
│   ├── SchedulePage.tsx   # Main page component
│   ├── SearchBar.tsx      # Date picker + search
│   ├── TeamsTable.tsx     # Main teams table
│   ├── TeamRow.tsx        # Individual team row (display/edit)
│   ├── UnmatchedBanner.tsx # Collapsible warning banner
│   ├── UnmatchedRow.tsx   # Unmatched shift row
│   ├── BulkControls.tsx   # Edit All / Update All / Cancel
│   ├── StatusBadge.tsx    # Published/Unpublished badge
│   ├── TimeSelect.tsx     # Time dropdown with optgroups
│   ├── StatusSelect.tsx   # Status dropdown
│   └── OperationModal.tsx # Loading/Success/Error modal
├── components/ui/         # Reusable shadcn components
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities (API, errors, time)
├── types/                 # TypeScript type definitions
└── index.css             # Global styles + Tailwind
```

## Key Features

### UX Patterns (All Preserved from Original)

1. Date selection with Popover calendar and Enter key support
2. URL parameter loading from `?date=MM/DD/YYYY`
3. Time dropdowns with MORNING/AFTERNOON/EVENING optgroups
4. Dynamic end time filtering based on start time
5. Yellow highlight on edited rows
6. No-change detection with auto-cancel
7. Bulk edit mode for all teams
8. Collapsible warning banner with arrow rotation
9. Flash success animation on unmatched shift update
10. Operation modal with loading/success/error states
11. Error reporting to Slack with fingerprint deduplication
12. Idempotency keys on write operations

### State Management

Single `useSchedule` custom hook manages all application state. No external state libraries required.

## Testing Checklist

- [ ] `npm run dev` starts without errors
- [ ] Date selection and search works
- [ ] Single team edit flow works
- [ ] Bulk edit flow works
- [ ] Unmatched shifts edit and update
- [ ] URL `?date=` parameter auto-loads
- [ ] Enter key triggers search
- [ ] `npm run build` succeeds

## Deployment

See `FRONTEND_REDESIGN_PLAN.md` for full deployment instructions including Netlify configuration and GitHub Actions workflow.

## Migration Notes

This is a complete rewrite from vanilla HTML/CSS/JS to React + TypeScript. All UX patterns and functionality have been preserved while modernizing the codebase and visual design.
