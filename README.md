# Weekly Period Schedule Builder

React + TypeScript + Vite. Build a camp's weekly period schedule (Sunday to Friday, 4 periods a day) for up to
4 weeks at a time. Pick activities from a searchable dropdown (or write your own), and matching neighbors merge
automatically on the Schedule tab. A Tracking tab counts program areas per bunk, for one week or the whole session.

There is no backend. Everything is saved in the browser (localStorage), so **download your weeks to Excel as a
backup**: clearing site data or switching browsers loses anything that wasn't downloaded.

## Run it

    npm install
    npm run dev        # local dev server
    npm test           # merge, tracking, autofill, search, Excel and render tests
    npm run build      # typecheck + production build into dist/

## Deploy to weekly.joshbcohn.com

Upload the contents of `dist/` the same way as your other subdomains. It is a single page with no routing,
so no rewrite rules are needed.

## Using it

- **Weeks:** the week bar above the tabs switches between Week 1-4. Weeks 2-4 start blank. "Reset Week N" blanks
  the selected week. On Weeks 2-4, "Use Week N-1's bunks" (next to "Add bunk") copies the previous week's roster
  with blank activities.
- **Default roster:** Week 1 starts with O1-O5, C1-C4, S1-S5, M1-M4, T1-T4 (see `sampleSchedule()` in
  `src/sample.ts`). "Reset to sample" in the footer restores it for the selected week.
- **Villages** are the first letter of the bunk name (O, C, S, M, T). Keep that convention: colours, village
  autofill and the village notes all depend on it.
- **Activity dropdown:** click a cell for the grouped list, type to filter (by name or program area), or type
  something not on the list and press Enter to write it in. Each option notes which other bunks already have it in
  that period: `Pool (O1)`, `Pool (O)` when a whole village has it, `AM Hobbies (all)` when every other bunk does.
  Write-ins are not counted in Tracking.
- **Set a whole period at once** (above the grid): pick a day, a period (1-4, Morning, or Afternoon), a village or
  all bunks, and an activity. Use this for events, which are deliberately not autofilled.

### Autofill when you pick an activity in one bunk's cell

| Activity | Bunks filled | Periods filled |
| --- | --- | --- |
| AM Hobbies / PM Hobbies | all bunks | periods 1-2 / periods 3-4 that day |
| Low Ropes, High Ropes, Waterfront | that bunk only | the half of the day (1-2 or 3-4) containing the period you picked |
| MNL, MAL | that bunk's village | the half of the day containing the period you picked |
| Any other league (League, CHL, SSL, Tusc ...) | that bunk's village | the one period you picked |
| Anything else, including write-ins | that bunk only | the one period you picked |

Choosing "-" or editing a single cell afterwards only changes that cell, so exceptions never cascade. Autofill
replaces whatever was in the cells it fills, without asking.

### Excel download and upload

- **Download Week N** saves a `Week N` tab plus a `Tracking` tab. **Download all weeks** saves one `Week N` tab per
  non-empty week plus `Whole Session Tracking`.
- A week tab has the bunk grid (Bunk, Grades, Count, then Sun P1 ... Fri P4), a blank row, then a day-info block
  (RH & LOD, TS, General Day, DOD, Birthdays, EVP, Notes).
- **Upload** reads every tab named `Week 1` ... `Week 4` (one week or several) and loads each into its matching week
  after a confirm that lists what will be overwritten. Tracking tabs are ignored. Weeks numbered above 4 are skipped.
- You can edit the file in Excel or Sheets and upload it again. Keep the tab names and the header rows. Numbers typed
  into Grades or Count are fine.

## How it is organized

    src/config.ts          days, periods, week count, the activity list, program areas, dropdown groups
    src/merge.ts           auto-merge: turns the grid into merged blocks
    src/tracking.ts        counts program areas per bunk (one week, or the whole session)
    src/autofill.ts        village lookup, double-period and whole-village rules, bulk-fill period choices
    src/activitySearch.ts  dropdown filtering and name snapping
    src/slotUsage.ts       the "who else has it this period" notes
    src/excel.ts           build workbooks, download, and read uploads
    src/storage.ts         load, save and repair the saved weeks (localStorage)
    src/sample.ts          default roster, blank schedule, helpers
    src/components/        BuildGrid, ActivityPicker (the dropdown), ScheduleView, TrackingView, DayDetails
    src/theme.css          all styling, in one file

## Common edits

- **Add or regroup an activity:** edit `ACTIVITIES` in `src/config.ts`. The second argument is the program area it
  counts toward, for example `a('Kayaking', 'Paddle Sports')`. `null` means not counted. Areas appear as tracking
  columns in the order they first show up in that list, and as headings in the dropdown.
- **Change what autofills or is always a double period:** `src/autofill.ts` (`ALWAYS_DOUBLE_PERIOD`, and the
  Hobbies / League rules in `bunkIdsForLabel` and `periodsForLabel`).
- **Change the number of weeks, days or periods:** `WEEK_COUNT`, `DAYS` and `PERIODS_PER_DAY` in `src/config.ts`.
- **Change the default roster:** `sampleSchedule()` in `src/sample.ts`.
- **See the unstyled app:** comment out `import './theme.css'` in `src/main.tsx`.
- **Day details** (RH & LOD, TS, DOD, birthdays, EVP, notes) have no on-screen editor right now: the section is
  commented out in `src/App.tsx`. The fields still show on the Schedule tab and travel through Excel, so fill them in
  the spreadsheet, or re-enable `DayDetails`.

## Merge and counting rules

- Neighbors with the same activity in the same day merge across periods (a double period) and down across bunks
  (a shared block). Merging never crosses a day boundary, and empty cells never merge.
- A double period counts once. A block shared by several bunks counts once for each bunk.
- Merging depends on bunk order, so keep each village together in the list.
- Whole-session tracking sums weeks by bunk name, so a bunk renamed between weeks shows up as two rows.

## Note on the Excel library

`xlsx` is installed from SheetJS's own site (see `package.json`), not the npm registry, because the registry copy
(0.18.5) has known unpatched security issues.
