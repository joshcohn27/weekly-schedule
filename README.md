# Weekly Period Schedule Builder

React + TypeScript + Vite. Visitors build a sample week (Sunday to Friday, 4 periods a day) from dropdowns.
Matching neighbors merge automatically, and a Tracking tab counts program areas per bunk.
Everything is saved in the visitor's browser (localStorage). There is no backend.

## Run it

    npm install
    npm run dev        # local dev server
    npm test           # merge, tracking and render tests
    npm run build      # typecheck + production build into dist/

## Deploy to weekly.joshbcohn.com

Upload the contents of `dist/` the same way as your other subdomains. It is a single page with no routing,
so no rewrite rules are needed.

## How it is organized

    src/config.ts        days, periods, the activity list (dropdown), program areas
    src/merge.ts         auto-merge: turns the grid into merged blocks
    src/tracking.ts      counts program areas per bunk from those blocks
    src/storage.ts       load and save (and repair) the saved schedule
    src/sample.ts        the starter schedule and helpers
    src/components/      BuildGrid (dropdowns), ScheduleView (merged table), TrackingView, DayDetails
    src/theme.css        all styling, in one file

## Common edits

- **Add or regroup an activity:** edit `ACTIVITIES` in `src/config.ts`. The second argument is the program area it
  counts toward, for example `a('Kayaking', 'Paddle Sports')`. `null` means not counted. Areas appear as tracking
  columns in the order they first show up in that list.
- **Change the days or periods:** `DAYS` and `PERIODS_PER_DAY` in `src/config.ts`.
- **See the unstyled app:** comment out `import './theme.css'` in `src/main.tsx`.

## Merge and counting rules

- Neighbors with the same activity in the same day merge across periods (a double period) and down across bunks
  (a shared block). Merging never crosses a day boundary, and empty cells never merge.
- A double period counts once. A block shared by several bunks counts once for each bunk.
- Merging depends on bunk order, so keep each village together in the list.
