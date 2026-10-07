# Change log

What changed in each version of the Weekly Period Schedule Builder, newest first.

The version is shown at the bottom of every page. The first number is the app itself. The second goes up when something
new is added, and the third goes up for a fix or a small change (and goes back to 0 when the second moves).

## 1.8.1 (October 6, 2026)

- **Never four bunks at Athletics.** Three at once is the most at Athletics and at A&C, as the starting number and as a
  choice: 4 is no longer offered, and a schedule saved with 4 is read as 3. (1.7.1 had made 4 the starting number at
  Athletics. That was a mistake.)
- **Reset.** The button is called Reset and is at the top of the Setup tab and in the bar over a week. It does one of
  three plain things: clear everything (every week), clear only the week on screen, or reset the session to its base
  template. Clearing keeps your bunks and settings. The tick boxes about what to keep are gone.
- The Auto generate box and the Reset box open at their top.
- The page uses its whole width again.

## 1.8.0 (October 6, 2026)

- **A Setup tab.** The page opens on it. It holds what is decided once for a session, in order: which session, its
  bunks village by village, a line saying whether the numbers add up, and the way on to building. Uploading a file,
  downloading all weeks and Start over are at the bottom of it. (Start over became Reset, at the top, in 1.8.1.)
- **Bunks belong to the session.** A bunk added, renamed, moved or removed on Setup is changed in every week. The Build
  tab shows the bunks and no longer changes them.
- **The Build tab is only the week's periods.** The bar over it has the week, Auto generate and that week's download.
  The bar is on the Build, Schedule and Tracking tabs, the ones that show one week.
- **Village names.** Everywhere the page said "O village" or "Village M" it says Onondaga, Cayuga, Seneca, Mohawk, Tusc.
- **Taste of CSL** is not on the Settings tab: no league, no numbers of its own, and its set week is not listed on the
  calendar table.
- **Session 2** starts with no Ceramics for Onondaga and Cayuga and one for Seneca, Mohawk and Tusc. Its Shabbat
  setting shows its three weeks.
- Opening a box, or going to another tab, starts from the top of the page.

## 1.7.1 (October 5, 2026)

- **Exactly, or a range.** Each program area's row on the Settings tab now starts with a choice: "exactly 2 a session", or
  "from 2 to 3 a session". Time with UH has it too. The numbers themselves have not changed, and neither has how a
  schedule is generated: "exactly" is what both numbers the same always meant.
- The Settings tab no longer says "Will come up short" when a village is only a period or two short of what the numbers
  ask for, which is what a lot of league does. It still says so from three periods up.
- **Ceramics** is set village by village, like Dance: Onondaga and Cayuga once a session, Seneca, Mohawk and Tusc twice.
  It goes by campers, like ropes and Yoga: at most 16 at once.
- **Teva** is from 1 to 3 a session (it was exactly 3).
- **The numbers the app starts with fit the biggest camp**, so there is no separate set of settings for big villages to
  switch on: 3 bunks of a village a day at every area, and any two bunks of a village within a grade may share. (It
  also raised Athletics to 4 bunks at once, which 1.8.1 took back out.) Schedules saved with the old starting numbers are moved to these.
- **Session 2 starts with numbers that fit it**: ropes once, league twice a week, Ceramics once for every village, and
  Judaics and Israel from 1 to 2. Its Settings tab no longer opens with warnings.
- The Settings check leaves Taste of CSL out of its counts, and counts Yoga and Ceramics by how many bunks really fit
  under their camper limits.

## 1.7.0 (October 5, 2026)

- **Start over.** One button in the bar under the tabs replaces four: Reset Week, Clear all activities, Reset to sample
  and Start this session over. It asks what to start over (this week or the whole session) and what to keep (your bunks,
  and for a whole session your settings), and says what will happen before it does anything.
- When a week runs out of time, the periods that had to be emptied are given another activity where one fits. Only the
  ones nothing fits in are left empty and yellow.
- The "?" how-to now covers the bunk buttons, the 27-bunk limit, the ropes warning and Start over.

## 1.6.4 (October 5, 2026)

- **Ropes.** Every bunk gets its ropes when the session has room for it. Before this, bunks could end a session with one
  ropes or none.
- When ropes cannot fit for everyone (one group is at ropes in a half-day), the Settings tab says so, with the numbers
  and what to try. In that case everyone gets a first turn before anyone gets a second.

## 1.6.3 (October 5, 2026)

- The Tracking grid lights up the bunk and the program area of the number under the pointer, the same way the sharing
  grid does.

## 1.6.2 (October 5, 2026)

- The grades each village's bunks start with: Onondaga 3rd/4th, 4th, 5th, 6th, 6th. Cayuga 3rd/4th, 4th, 5th, 5th, 6th,
  6th. Seneca and Mohawk two bunks each of 7th, 8th and 9th. Tusc 10th.

## 1.6.1 (October 5, 2026)

- The camp holds 27 bunks, so no week can have more, Taste of CSL included. Taste of CSL's cabins come out of Onondaga's
  and Cayuga's: Session 2 starts with 3 Onondaga and 4 Cayuga.
- Specialist schedules name the village (Onondaga, Cayuga, Seneca, Mohawk, Tusc, Taste) instead of its letter.

## 1.6.0 (October 5, 2026)

- **Adding bunks.** "Add a bunk to" O, C, S, M or T adds the next bunk of that village to every week of the session.
  "Fill in the biggest camp" brings every village up to its most bunks, at 15 campers each.
- Yoga takes 20 campers at once (it was 22).
- A camp of full bunks is no longer planned two at a time at Yoga when only one fits.
- The user's manual is in the repository, in `docs/manual/`.

## 1.5.1 (October 5, 2026)

- The biggest Session 1 camp (27 bunks) comes out complete. Pool lessons always find a period when there is one, and
  neighbours in a village are kept on the same visit so they can keep going to an area together.
- With six bunks in a village, the Auto generate box offers settings that fit a camp that size.
- In Session 2, Tusc has Ceramics once and one ropes, High Ropes.

## 1.5.0 (October 5, 2026)

- **Time limits.** A try at a week lasts 15 seconds at most, and a week 45 seconds in all. After that the best week found
  is handed back with the periods that break a rule emptied and marked yellow, so what comes back always keeps the rules.
- **Days that have already happened** (through today) are left exactly as they are when a week is generated again.
- The Excel file carries which session it is from and any changes to the session calendar.
- The Settings check knows the calendar. It says "Will come up short" for a squeezed session instead of calling it
  impossible.
- The weekly swim is wanted, not required, in the short last week.

## 1.4.0 (October 5, 2026)

- **Two sessions.** Pick Session 1 (4 weeks) or Session 2 (3 weeks, with Color War) at the top of the page. Each keeps its
  own bunks, schedule and settings, and starts with its bunks and its calendar already in.
- **The session calendar.** Opening day, Tiyuls, bike trips, village day, Mass Program, Color War, Visitor's Day and the
  clean up are on a calendar on the Settings tab, set to where they were in 2026. Auto generate puts them on the schedule
  and builds around them.
- **Dates.** Weeks and day headings carry the summer 2027 dates: Session 1 June 27 to July 23, Session 2 July 26 to
  August 15.
- **Taste of CSL.** Bunks named TC1, TC2 and so on are in camp for week 1 of Session 2 only, with a set week, and nobody
  shares a program area with them.
- A week the calendar cuts short gets fewer Waterfront and league periods, and the swim tests are on the first day that
  has periods.
- Session 2 starts with fewer Yoga and Dance than Session 1.
- Yoga goes by campers, the way ropes does.
- The "Always kept" list of rules is hidden on the Settings tab and in the how-to.
- The sharing grid lights up the two bunks of the box under the pointer.

## 1.3.1 (October 5, 2026)

- Auto generate is much faster, and finishes with the settings that used to leave it stuck.
- Judaics takes two bunks of one village at once, on the same visit.
- In week 4 of Session 1 only: A&C partners need not be on the same visit, three bunks of a village a day may have
  Athletics or A&C, and a bunk may have one more Time with UH.
- A village takes one more Waterfront or league period where a half-day is open.

## 1.3.0 (October 5, 2026)

- **Shabbat settings.** Pick which village or villages have Shabbat each week, and how many extra Shabbat Prep periods
  they get on top of the Friday afternoon double.
- No bunk has Music or Judaics while a village is at Shabbat Prep, because those specialists run it.

## 1.2.3 (October 4, 2026)

- The page has an icon in the browser tab.

## 1.2.2 (October 4, 2026)

- Hobbies is an exact number of sessions for the whole session, shared out over the weeks. (It had been read as a number
  a week.)

## Before 1.2.2

Versions were not numbered before 1.2.2. In the order it was built:

- **The first page (September 18 to 20, 2026).** A weekly grid of bunks and periods, Sunday to Friday, saved in the
  browser. Build, Schedule and Tracking tabs. Up to four weeks, with Excel download and upload. Copying the previous
  week's bunks. Hobbies fill the whole camp and a league fills its village. Setting a whole period at once. A searchable
  list of activities, with write-ins.
- **Auto generate, first version (September 20 to 21).** A button that builds a week, with a box to confirm and an Undo.
  A checker for the scheduling rules. A week that does not come out right is tried again quietly, with no warnings on
  screen. Clicking a block on the Schedule tab lights up its program area.
- **Auto generate for the whole session (October 3 to 4).** One week or the whole session, in the background, with a
  progress panel and Stop. Trips entered by hand are built around. Rules for who may share a period, how many bunks an
  area takes, and the pool. Athletics and A&C as single periods only, and nothing two days in a row.
- **The Clear tool (October 4).** Empty an area, a bunk or a village for a day or a week, with the emptied periods
  marked yellow.
- **Specialist schedules (October 4).** A grid for each program area, on screen and as an Excel file.
- **Settings (October 4).** How often each program area happens and how many bunks it takes, saved with the schedule and
  in the Excel file. Adding and removing program areas. Who may share a period, with a bunk by bunk grid. A check that
  says when the numbers cannot work and what to try.
- **The how-to (October 4).** The "?" in the header, which opens by itself on the very first visit.
- Ropes goes by campers, not bunks.
