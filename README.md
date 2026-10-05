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

**Contact support** at the foot of every page (and in the how-to, and beside any settings problem) opens an email to
joshcohn27@gmail.com. The address is `SUPPORT_EMAIL` in `src/config.ts`. The version number shown beside it
(1.2.3 now) is `APP_VERSION` in the same file: the first number is the app itself, the second goes up when a feature is
added (2 is Auto generate), and the third goes up for a fix.

The how-to opens by itself the very first time the page is opened in a browser, and not again after that. The **?**
next to the title opens it any time. It is a plain how-to for the whole page: the tabs, building a week step by step, changing
things by hand, the rules that are always kept, the settings, and saving and printing. It is written for someone who
has not seen the page before.

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
- **Clear** (the row under it): choose *what* (everything, or one program area), *for whom* (all bunks, a village, or
  one bunk), *which day* (or the whole week) and *which periods* (all day, morning, afternoon, or one period). For
  example: Waterfront for all bunks on Tuesday; everything for O3 on Thursday; everything for S village on Monday
  morning; Athletics for all bunks for the whole week. It tells you how many periods it will empty and asks first.
  The emptied periods are left blank and shown in **yellow** on the Build and Schedule tabs until something is put
  there again, by hand or with Auto generate set to build around what is there. **Remove the yellow marks** takes the
  color off and leaves the periods empty. The marks are saved in the browser with the week; they are not written to
  the Excel file.

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
- **Specialist schedules** saves a separate workbook with one tab per program area (Waterfront, Pool, Ropes,
  Athletics, A&C, Music and so on; not hobbies or trips). Each tab has a grid for every loaded week, days across and
  periods down, like the main schedule. A box reads "O1, O2 (2nd visit, 22 campers)": who comes, which time it is for
  them in that area counted from the start of the session, and how many campers. Bunks on different visits are
  written "O1 3rd, O2 2nd", a whole village "O village", and a double period shows in both of its periods. It is for
  printing and handing out; uploading it does nothing. The **Specialists** tab shows the same grids on screen, one
  program area at a time, with Print.
- You can edit the file in Excel or Sheets and upload it again. Keep the tab names and the header rows. Numbers typed
  into Grades or Count are fine.

## Sessions, dates and the calendar

Pick the session at the top of the page: **Session 1** (4 weeks, June 27 to July 23, 2027) or **Session 2** (3 weeks,
with Color War, July 26 to August 15, 2027). Each keeps its own bunks, schedule and settings, so switching does not
lose the other. A session starts from its template (`src/autogen/sessionCalendar.ts`): its bunks, its numbers, and its
calendar already on the schedule. **Start this session over** goes back to that. On the Build tab, **Add a bunk to**
O, C, S, M or T adds the next bunk of that village to every week, and **Fill in the biggest camp** brings every village
up to its most bunks (5, 6, 6, 6 and 4) at 15 campers each, a round number to plan with that nothing enforces. The week dropdown and the day
headings carry the dates.

**The session calendar** is everything that is not a period: opening day, the Tiyuls, the Tusc bike trips, village day
(O-Day, C-Day, ...), Mass Program, Color War, Visitor's Day and the clean up. It starts as the session was in 2026 and
is on the Settings tab, one line for each item (what, who, week, day, when). Move, remove or add a line there; the
button under the table puts the calendar on the schedule (empty periods only). Auto generate does the same before it
builds a week, and never moves anything that is on the calendar or was entered by hand.

**Taste of CSL.** Bunks named TC1, TC2, ... are in camp for week 1 of Session 2 only. Their week is set (copied from
2026: the first half of them follows what "TC 1" did, the rest what "TC 2" did), Auto generate leaves it alone, and
nobody else is put at a program area in a period they have it. They are a village of their own, not part of Tusc.

**A week the calendar cuts short gets fewer.** Waterfront and league are an average over the session, so a week with
Mass Program or village day in it has fewer. The swim tests are on the first day that has periods. A bunk the calendar
leaves well short of an ordinary session gets as many visits as fit, and the Settings page says so ("Will come up
short") instead of calling the settings impossible.

## Auto generate

The **Auto generate** button in the week bar builds the periods for one week, or for the whole session, from
the bunks on the Build tab. It is disabled until the selected week has bunks.

**Trips.** They are on the session calendar and go on the schedule by themselves. A trip you enter by hand stays where
you put it, and the calendar does not add a second one for that village.

**What it builds.** A fixed calendar first: hobbies, the Sunday swim tests in week 1, the Shabbat Prep rotation, and in
the last week of Session 1 the Monday hobbies, Hobby Culmination, Packing Time and Banquet Prep, with Friday left
empty. Then Waterfront, league (Tusc has triathlon training), ropes and pool. Then every remaining period: Music and
the rarer areas first, and whatever is left becomes Athletics, A&C, Time with UH or a second Music. Every block is put
on the day its bunks have the most empty periods, so no bunk is left with a day that Athletics and A&C alone would have
to fill. It reads the other weeks you have
loaded, matching bunks by name, so totals stay fair across the session (two ropes per bunk, low then high, and
Waterfront within one block between villages).

**The dialog asks:**

- **Just this week, or the whole session.** For the whole session you choose for each week: *Lock* (leave it exactly as
  it is), *Build around what is there* (only the empty periods are filled) or *Regenerate* (clear it and build it
  again). A week that is already filled in starts as Lock. A week with no bunks takes the bunks of the week on screen.
- **For one week that already has activities:** keep what is there and build around it, or replace it.
- **When replacing, keep Bike Trip and Tiyul where they are.** On by default.
- **Count what the other weeks already have.** On by default: a bunk that already had Yoga twice in a week you are
  keeping is not given a third, and its visit numbers carry on from there. Unticked, the weeks you are not generating
  are ignored, as if this were the only schedule.
- **Leave the days that have already happened as they are (through today).** On by default: once the session is under
  way, generating a week again only touches the days still to come, and what already happened counts toward the totals.

Which session it is comes from the picker at the top of the page (Session 1: Mohawk plays MNL; Session 2: MAL).

Day details (RH & LOD, birthdays, EVP, notes) are never touched.

The Excel file carries the session it was saved from and, when it was changed, the session calendar (a `Calendar`
tab), so an upload comes back into the right session with its calendar.

**While it runs** it works in the background, so the page stays usable: switch tabs and weeks, look at Tracking,
download. A panel under the week bar shows a progress bar (weeks done out of the total), where each week stands (done,
working, waiting), the time so far and a **Stop** button. Each week is put on the page as soon as it is done, so you
can look at weeks 1 and 2 while 3 and 4 are still being worked on. The weeks in the run can be looked at but not
changed until it is over.

**What it hands over always keeps the rules.** Each week is tried several times at once, every attempt with its own
seed and on its own processor core (one fewer than the machine has, six at most), and the first good week is kept. A
try lasts 15 seconds at most. When none comes out right the week is generated again, without a word; the panel just
says "try 2". If it fails twice in a whole-session run, the week before it is redone as well, once, because what an
earlier week used up is the usual reason. A week is never worked on for more than 45 seconds in all: then the best one
found is handed over with the periods that break a rule emptied and marked yellow, for you to fill by hand
(`src/autogen/tidy.ts`). That is what happens with a roster or settings that are too tight to fit, for example six
bunks in every village. It never shows warnings; the browser console has the details.

**Six bunks in a village.** The biggest Session 1 camp is 5 Onondaga, 6 Cayuga, 6 Seneca, 6 Mohawk and 4 Tusc (27
bunks). The usual numbers do not fit that many, so the Auto generate dialog then offers the settings for big villages,
ticked: 4 bunks at once at Athletics, 2 at Ceramics, 3 bunks of a village a day at every area, and any two bunks of a
village within a grade may share (not only neighbours in the list). The Settings tab has the same as a button. Measured
in a browser with them: 8 whole sessions of 27 bunks, every one complete, 5 to 29 seconds each. Three things in the
generator make it fit: pool groups are matched to periods all at once, neighbours in a village are given the same
areas each week so they stay on the same visit and can go together, and they are nudged to stay level at A&C.

**Stop** keeps the weeks that are already done and leaves the rest as they were.

**Regenerate as often as you like.** Every run uses a fresh random seed (shown next to the status line), so pressing
the button again gives a different schedule.

**Undo** puts back every week the run made, and leaves alone anything you changed in other weeks meanwhile. It is kept
in memory only, and goes away when you edit a cell or upload a file.

### Settings

The **Settings** tab holds the numbers Auto generate works with, one row per program area (Judaics, Israel, Teva,
Ceramics, Yoga, Dance):

- **Times per bunk per session, at least and at most.** "At least" is what every bunk is given. When "at most" is
  higher, the extra visit only fills a period that would otherwise be Athletics or A&C. Dance is set village by village.
- **Bunks at once** (1 or 2) and **bunks of one village in a day.**

Whatever periods these areas do not use become Athletics, A&C or Time with UH. So raising a number means less of
those, and lowering one means more. Lowering is the risky direction: Athletics and A&C can only take so much (two
bunks of a village a day each, on alternating days), and with too little else to do no schedule exists. With Yoga
cut to 1 and no third Ceramics, for example, a run tried for its full time and did not find a good session.

**Every program area is in the one table**, and the defaults are what the generator has always used:

- **Hobbies:** exactly how many hobby sessions the **whole session** has (a session is a half-day for the whole
  camp). They are shared out over the weeks: every week gets its Friday morning first (the last week of a 4-week
  session gets Monday morning, and that is all it can have), then a midweek one each week (Wednesday afternoon or
  Tuesday morning), then Sunday mornings from week 2 on. So 4 is one a week, 7 is what a 4-week session has always
  had, and 9 is the most that fits (8 in a 3-week session). There is no chance in it.
- **Waterfront:** about how many times a week. **League:** about how many times a week, set village by village
  (Mohawk's are double periods; for Tusc the number is triathlon sessions).
- **Pool:** swims a week and the most a week, how many of an O or C bunk's first swims are lessons alone, and the most
  campers in the water at once.
- **Ropes:** times a session (low ropes first, then high), and the most campers at ropes at once. Ropes goes by
  people, not by bunks.
- **Shabbat Prep:** which village or villages have Shabbat in each week (or No Shabbat), and how many single periods (0 to 2) a village gets earlier in its Shabbat week on top of the Friday afternoon double, which is always there. Music and Judaics never have a period while a village is at Shabbat Prep, because their specialists run it; villages that share a week prepare together. The extra periods go where the fewest other bunks are free, and in a week with Shabbat Prep a bunk whose Music cannot fit goes without it that week.
- **Athletics and A&C:** the most a week, bunks at once, bunks of one village in a day.
- **Music:** times a week and the most. **Time with UH:** at least and at most a session.
- **Trips** have no numbers: a Tiyul or a bike trip is entered by hand.

"A week" is a rough number, the average over the session; a short week gets fewer. Each number on the page is
worded as what it is ("about", "at least", "at most", "exactly"), and a small **i** beside anything that is an
estimate or needs a sentence says more when you point at it.

**Same visit number.** Each area that bunks may share has a box for whether they must be on the same visit. It starts
ticked everywhere except Athletics and Time with UH. One more switch lets bunks be one visit apart in the last week of
the session, and it starts off.

**Adding a program area** (archery, martial arts: whatever was hired for). Type its name in the last row of the
table, choose its numbers and press Add. It becomes an activity you can pick on the Build tab, a column on the
Tracking tab and a tab in the specialist schedules, and Auto generate gives it to every bunk as single periods, like
the rarer areas that come with the app. Up to six can be added, each with a Remove button. To stop using an area
that comes with the app, set both of its numbers to 0. Every period an added area takes is one fewer Athletics or
A&C; every area taken away is that many more.

**Who may share a period.** Three basic choices: inside a village, only the bunk next in the list or any bunk of the
village; whether the paired villages (O with C, S with M) may mix; and how close in grade two bunks must be (the same
grade, within one, or any). Behind **Advanced: customize sharing** is a grid with a box for every pair of bunks. It
starts as what the three choices give. A box you tick or untick is outlined and wins over the choices for that pair,
including in a group of three at A&C. The grid goes by bunk name. None of this touches who swims together at the
pool, or Athletics, which takes any bunks; Tusc bunks share with each other unless a box says otherwise.

**The page checks the arithmetic as you type.** Above the table it says either that the settings add up, or what is
wrong and what to try: "A schedule is not possible with these settings ... Try giving each bunk about 2 more visits
a session". It counts periods; it does not build a schedule. "Not possible" means the periods cannot fit.
"Unlikely to work" means they fit on paper but settings that tight did not generate when tried; those two limits are
measured, and are marked as such in `src/autogen/feasibility.ts`.

Settings are saved with the schedule in the browser and written to **Settings** and **Sharing** tabs in the Excel file, so a file
carries its own rules; uploading a file that has that tab replaces the settings here. **Reset to the default
settings** puts everything back. The rules listed under "Always kept" on that tab are not settings.

### The rules it keeps

Who may share a period in the same area:

- Bunks in O, C, S and M share only with the bunk next to them in the village list, within one grade.
- Across villages only O with C and S with M, within one grade, and only at Athletics, A&C, Music, Teva, Dance and
  (S with M only, same age) the pool. Tusc bunks share with each other and with nobody else.
- **Athletics:** any two or three bunks. Being on the same visit number is preferred, not required.
- **A&C:** two bunks that may share, or three bunks of the same age, always on the same visit number.
- **Music, Teva, Dance:** two bunks that may share, on the same visit number; one bunk is preferred.
- **Yoga, Ceramics, Judaics, Israel:** one bunk at a time. Judaics and Israel may run in the same period.
- **Time with UH:** one bunk, or two of the same village.
- **Ropes:** one group per half-day in the whole camp. It goes by people, not by bunks: bunks next to each other in a
  village go together as long as their campers add up to no more than the number in Settings (30 to start with), and
  a bunk bigger than that goes alone. Low ropes first and high ropes second.

How much:

- **Nothing back to back.** Athletics and A&C are always single periods, never a double. No area is in period 4 and
  again in period 1 the next day. **No bunk has the same kind of period two days in a row**: not Athletics, not
  league, not Waterfront, not the pool, nothing. (Trips are exempt, and Friday into Sunday does not count.) To keep
  that, each bunk has its Athletics on every other day and its A&C on the days between; bunks next to each other in
  a village have the same days, so they can still share A&C.
- **No Waterfront until the swim test is done.** In week 1 no village is at Waterfront on Sunday morning, or before
  its own swim test. Mohawk takes its test during General Swim, after period 4 on the first day, so it has no
  Waterfront at all that day; Auto generate writes "Mohawk Swim test During General Swim" in that day's notes, which
  show under the schedule. Apart from that note, day details are never touched.
- At most 3 Athletics periods and 3 A&C periods per bunk per week, a second Music in a week only to fill a period, and
  no area twice in one day.
- At most 2 bunks of one village at Athletics, A&C, Music, Teva, Dance, Israel or Time with UH in one day, and 1 at
  Yoga, Ceramics or Judaics.
- Athletics and A&C stay within two blocks of each other per bunk over the session.
- Time with UH is planned once a session and may be used up to three times to fill periods. The third is held back
  for the last week, or for a week the bunk is away on a trip.
- Per session: Ropes 2, Judaics 2, Israel 2, Teva 3, Ceramics 2, Yoga 2, Dance 3 (O, S), 2 (C, T) or 1 (M). A third
  Yoga, Ceramics or Judaics may be given to fill a period. (They take one bunk at a time, so a third for everyone
  would not fit.) Israel is never more than 2.
- Music every week, except Mohawk: two of the first three weeks, a different week off for each bunk, so the little
  time Mohawk has left over goes to A&C.
- League three times a week (Mohawk three double periods), never on days next to each other. A week too short for
  three such days has two: weekly numbers are an average over the session, and a short week gets fewer.

Preferred, not required:

- Hobbies go on Wednesday afternoon or Tuesday morning; when a village is away on a trip for one of them, the other is
  used, so nobody misses hobbies.

The pool:

- One group at the pool per period, and Tusc triathlon training only when nobody is swimming.
- An O or C bunk's first two regular Pool blocks are lessons, one bunk alone. After that a run of bunks from one
  village may go together. O and C never share the pool. Tusc always goes as a whole village.
- **Every village swims about once a week.** O, C and Tusc must swim every week; Seneca and Mohawk are counted over
  the session and may end one short.
- A second swim in a week is given a whole village at a time, and only to a village that has swum the least so far,
  so the villages end the session within one swim of each other (4 or 5 each in a 4-week session).
- At most 80 campers at the pool at once, except when a whole village goes.

Building around periods you filled in by hand (other than trips) can put a target out of reach, so for such a week
each limit on shortfalls is one looser.

### What to expect

- The default roster (22 bunks) with its trips entered: 100 simulated 4-week sessions all came out fully good (no
  rule break and nothing short in any week), measured one attempt at a time: half within 19 seconds, 9 in 10 within
  40, the slowest 103. That was measured before the settings work and has not been repeated since. Run the same check
  with `AUTOGEN_RUNS=100 npx vitest run --pool=forks src/autogen/session.test.ts` (it takes over half an hour and
  slows the machine).
- With no trips entered everyone is in camp all four weeks, which is the hardest case: one such session came out
  fully good in 142 seconds, one attempt at a time. In the browser several attempts run at once; how much faster that
  is has not been measured.
- Settings that take activities away (fewer hobbies, Waterfront once a week, Yoga once a session) leave more periods
  for Athletics and A&C than they can hold. Two such settings did not generate at all when tried. The Settings tab
  says so before you generate.
- Every bunk gets A&C. Mohawk has about six spare periods all session, so it ends with 1 to 4 A&C per bunk.
- Pool ends at 4 or 5 swims per bunk in every village; now and then a Seneca or Mohawk bunk ends on 3.
- Mohawk and Tusc have the least room (league doubles, Waterfront, trips, a short last week), so they may end the
  session one block short on a rarer area. Check the Tracking tab for the real totals.
- In the last week Tusc comes back from the bike trip with one free day, so only two of its bunks get Music that week.
- **A roster with six bunks in each of O, C, S and M does not fit under these limits.** There are more leftover periods
  than Athletics, A&C and Time with UH can hold, and weeks come back with rule breaks. The limits that would have to
  give are in `src/autogen/config.ts`: `DAY_CAP` (bunks of one village per day) and `SLOT_CAP` (bunks per period).
- A Waterfront half-day off each week is written but switched off (`WATERFRONT_HALF_DAY_OFF`), because the periods it
  frees made weeks fail to generate.

### For whoever changes it

Everything lives in `src/autogen/`. Every number is in `src/autogen/config.ts`. The hard rules are checked by
`validateWeek` in `src/autogen/validate.ts`, independently of the code that builds the week. The remaining periods are
filled by a local search in `src/autogen/fill.ts`.

`npm test` covers the generator. `AUTOGEN_SEEDS=100 npm test` checks 100 full sessions, and `AUTOGEN_REPORT=1 npm test`
prints a per-bunk tracking table for a simulated session. If a long run stops with "Worker exited unexpectedly", run it
as `npx vitest run --pool=forks`.

## How it is organized

    src/config.ts          days, periods, week count, the activity list, program areas, dropdown groups
    src/merge.ts           auto-merge: turns the grid into merged blocks
    src/tracking.ts        counts program areas per bunk (one week, or the whole session)
    src/autofill.ts        village lookup, double-period and whole-village rules, bulk-fill period choices
    src/clear.ts           the Clear tool: which periods a request empties, and the yellow marks
    src/activitySearch.ts  dropdown filtering and name snapping
    src/slotUsage.ts       the "who else has it this period" notes
    src/excel.ts           build workbooks, download, and read uploads
    src/specialist.ts      the session from each specialist's side: blocks, bunks and visit numbers per program area
    src/storage.ts         load, save and repair the saved weeks (localStorage)
    src/sample.ts          default roster, blank schedule, helpers
    src/autogen/           Auto generate: calendar, quota planner, placement, the fill search, and the rule checker;
                           settings.ts holds the numbers the Settings tab can change (config.ts has the defaults);
                           session.ts redoes a week until it is good, background.ts and worker.ts run it off the page
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
