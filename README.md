# Weekly Period Schedule Builder

React + TypeScript + Vite. Build a camp's weekly period schedule (Sunday to Friday, 4 periods a day) for up to
4 weeks at a time. Pick activities from a searchable dropdown (or write your own), and matching neighbors merge
automatically on the Schedule tab. A Tracking tab counts program areas per bunk, for one week or the whole session.

Live site: https://weekly.joshbcohn.com

This is a scheduling tool I built for camp staff to plan the weekly period schedule.

There is no backend. Everything is saved in the browser (localStorage), so **download your weeks to Excel as a
backup**: clearing site data or switching browsers loses anything that wasn't downloaded.

## Run it

    npm install
    npm run dev        # local dev server
    npm test           # merge, tracking, autofill, search, Excel, auto generate and render tests
    npm run build      # typecheck + production build into dist/

## Deployment

Hosted on Vercel at weekly.joshbcohn.com. It is a single page with no routing, so no rewrite rules are needed.
The build output is the `dist/` folder from `npm run build`.

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

## Auto generate a week

The **Auto generate Week N** button in the week bar builds a complete schedule for the selected week from the bunks on
the Build tab. It is disabled until the week has bunks.

- **What it builds:** a fixed calendar first (hobbies, the Sunday swim tests in week 1, the Tusc bike trips, the
  Shabbat Prep rotation, one Tiyul per village), then Waterfront, league (Tusc plays triathlon training), ropes and
  pool, then it fills every remaining period. It reads the other weeks you have loaded, matching bunks by name, so each
  bunk's totals stay fair across the whole session (for example two ropes per bunk, low first and then high, and
  Waterfront equal across villages). Bunks that share a period in the same activity, in one village or Seneca with
  Mohawk, are always on the same "time number" for that activity.
- **The confirm dialog** explains this, and asks two things. If the week already has activities: keep what is filled in
  and only fill the empty cells (good when you already placed an All-Camp Event or Village Day; those cells count toward
  the quotas, and a planned block that one of them makes impossible is skipped with a warning), or replace everything in
  the week. And the session length: 4 weeks (Mohawk plays MNL) or 3 weeks (Mohawk plays MAL). Day details (RH & LOD,
  birthdays, EVP, notes) are never touched.
- **Regenerate as often as you like.** Every click uses a fresh random seed, so pressing the button again gives a
  different valid schedule. The seed is shown next to the status line.
- **Undo** puts the week back the way it was. It is kept in memory only, and goes away as soon as you edit a cell,
  switch weeks or upload a file.
- **The last week of a 4-week session** has its own calendar: hobbies only on Monday morning, Hobby Culmination on
  Thursday morning, Packing Time on Thursday afternoon (Banquet Prep for Tusc), Tusc on the bike trip Sunday to Tuesday,
  and Friday left empty. Those three new labels are not counted in Tracking.
- **What to expect in the totals.** Ropes, Waterfront, league, pool, Music, Shabbat Prep and Tiyul come out exact. Mohawk
  and Tusc are over-subscribed by design (league doubles, Waterfront, trips and a short last week), so they may end one
  block short on Yoga, Ceramics, Teva, Israel, Judaics, Dance or Time with UH, or with Athletics and A&C two apart. O, C
  and Seneca normally hit every target, and now and then miss one. Every shortfall is listed under **A few things could
  not be met** after generating, so nothing is silent. Check the Tracking tab for the real totals.

Everything it decides lives in `src/autogen/`. Targets, the Shabbat and Tiyul calendars, pool limits and the soft
preference weights are in `src/autogen/config.ts`; the hard rules it must never break are checked by `validateWeek` in
`src/autogen/validate.ts`. `npm test` covers the generator; `AUTOGEN_SEEDS=100 npm test` runs the hard-rule check over
100 full sessions, and `AUTOGEN_REPORT=1 npm test` prints a per-bunk tracking table for a simulated session.

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
    src/autogen/           Auto generate: calendar, quota planner, placement, fill, and the rule checker
    src/components/        BuildGrid, ActivityPicker (the dropdown), ScheduleView, TrackingView, DayDetails
    src/theme.css          all styling, in one file

## Common edits

- **Add or regroup an activity:** edit `ACTIVITIES` in `src/config.ts`. The second argument is the program area it
  counts toward, for example `a('Kayaking', 'Paddle Sports')`. `null` means not counted. Areas appear as tracking
  columns in the order they first show up in that list, and as headings in the dropdown.
- **Change what autofills or is always a double period:** `src/autofill.ts` (`ALWAYS_DOUBLE_PERIOD`, and the
  Hobbies / League rules in `bunkIdsForLabel` and `periodsForLabel`).
- **Change the number of weeks, days or periods:** `WEEK_COUNT`, `DAYS` and `PERIODS_PER_DAY` in `src/config.ts`.
- **Change what Auto generate aims for** (targets, rotations, weights): `src/autogen/config.ts`.
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
