import { useEffect, useRef } from 'react';
import { SUPPORT_EMAIL, SUPPORT_LINK } from '../config';
import { FIXED_RULES } from './SettingsView';

interface Props {
  onClose: () => void;
}

/**
 * How to use the page, in plain words, for someone who has not seen it before. It opens from the "?" in the header.
 * It describes what the page does; the numbers themselves are on the Settings tab.
 */
export default function HelpPanel({ onClose }: Props) {
  // open at the top: the panel is long, and it must not start scrolled down to its Close button
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!panel.current) return;
    panel.current.scrollTop = 0;
    panel.current.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal help" role="dialog" aria-modal="true" aria-labelledby="help-title" tabIndex={-1} ref={panel}>
        <button type="button" className="close-top" onClick={onClose}>
          Close
        </button>
        <h2 id="help-title">How to use this page</h2>
        <p>
          This page holds the weekly period schedule: every bunk, four periods a day, Sunday to Friday, for up to four weeks. You can fill
          it in by hand, or have it build a week or a whole session for you. Everything is saved in this browser on this computer.
        </p>

        <h3>The tabs</h3>
        <ul>
          <li>
            <strong>Build</strong> is where the schedule is entered and changed.
          </li>
          <li>
            <strong>Schedule</strong> is the finished grid, ready to print. Bunks doing the same thing in the same period are merged into one
            box. Click a box to light up everything in the same program area.
          </li>
          <li>
            <strong>Tracking</strong> counts how many times each bunk has had each program area, for the week and for the whole session. This
            is the place to check that things are fair.
          </li>
          <li>
            <strong>Specialists</strong> shows the schedule from one program area's side. Pick the area, and each week is a grid, days
            across and periods down, saying which bunks come, which visit it is for them and how many campers. Print it for the specialist.
          </li>
          <li>
            <strong>Settings</strong> holds the numbers the schedule is built with.
          </li>
        </ul>

        <h3>Building a week</h3>
        <ol>
          <li>Pick the week at the top.</li>
          <li>On the Build tab, enter the bunks: name, grades and number of campers. Keep each village together in the list.</li>
          <li>
            Enter the trips by hand: a Tiyul, the Tusc bike trips. The page never decides when a trip happens. It builds around the ones
            you put in.
          </li>
          <li>
            Press <strong>Auto generate</strong>. Choose this week or the whole session. For each week you can leave it as it is, keep what
            is there and fill the gaps, or clear it and build it again. Choose Session 1 (four weeks) or Session 2 (three weeks).
          </li>
          <li>
            Let it work. A panel shows which weeks are done and how long it has been. You can keep using the page, and each week appears as
            soon as it is finished. A whole session usually takes under a minute, and a hard one can take a few.
          </li>
          <li>
            Look it over, starting with Tracking. Press Auto generate again for a different version, or <strong>Undo</strong> to go back.
          </li>
        </ol>
        <p>
          A week is only handed over when it keeps every rule. When an attempt does not, the page throws it away and builds it again by
          itself. That is why some weeks take longer than others.
        </p>

        <h3>Changing things by hand</h3>
        <ul>
          <li>Click any period on the Build tab to pick an activity, or type one that is not on the list.</li>
          <li>Hobbies fill the whole camp, and a league fills its whole village, when you pick them for one bunk.</li>
          <li>
            <strong>Set a whole period at once</strong> puts one activity in for everyone or for one village. Use it for an all-camp event.
          </li>
          <li>
            <strong>Clear</strong> empties part of the schedule in one go: everything or one program area, for everyone, one village or one
            bunk, on one day or the whole week. For example, Waterfront for everyone on Tuesday because of weather. The emptied periods turn
            yellow so it is plain what still needs filling. Then press Auto generate and choose to keep what is there and fill the gaps.
          </li>
        </ul>

        <h3>The rules that are always kept</h3>
        <ul>
          {FIXED_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
          <li>Bunks only share a period with bunks they are allowed to be with, and (except at Athletics) on the same visit number.</li>
          <li>League is about three times a week and Waterfront about twice. A short week gets fewer.</li>
        </ul>

        <h3>Settings</h3>
        <ul>
          <li>
            Every program area is in one table: how often each bunk has it (a week or a session, at least and at most), how many bunks at
            once, how many bunks of one village in a day, and whether bunks that share must be on the same visit number. Hobbies, Shabbat
            Prep, the pool's lessons and camper limit, and how many campers ropes takes at once are there too. League is set village by
            village, and hobbies is an exact number of sessions for the whole session.
          </li>
          <li>
            Shabbat Prep: tick which village or villages have Shabbat in each week, or No Shabbat. A village gets the Friday afternoon
            double in its Shabbat week, plus as many single periods earlier that week as you set. Nobody has Music or Judaics while a
            village is at Shabbat Prep, because those specialists run it.
          </li>
          <li>
            A number "a week" is rough: it is the average over the session, and a short week gets fewer. A small <strong>i</strong> beside
            a number says more when you point at it.
          </li>
          <li>
            <strong>Add a program area</strong> when someone is hired for it, such as archery or martial arts. It then shows up everywhere:
            in the list of activities, in Tracking, and in what Auto generate builds.
          </li>
          <li>
            <strong>Who may share a period</strong>, with three simple choices, and a grid behind "Advanced" with a box for every pair of
            bunks.
          </li>
          <li>
            The page checks the numbers as you change them. If a schedule cannot be built with them, it says so and says what to try.
          </li>
          <li>
            Whatever periods the program areas do not use become Athletics, A&amp;C or Time with the Unit Head. So adding an area means less
            of those, and taking one away means more.
          </li>
        </ul>

        <h3>Saving, sharing and printing</h3>
        <ul>
          <li>
            <strong>Download</strong> saves a week, or all weeks, as an Excel file, with the tracking counts and the settings in it.
            <strong> Upload</strong> loads such a file, on this computer or another.
          </li>
          <li>
            <strong>Specialist schedules</strong> saves a separate Excel file with one tab for each program area, laid out the same way as
            the Specialists tab: a grid for each week.
          </li>
          <li>The Schedule tab has a Print button.</li>
        </ul>

        <h3>Good to know</h3>
        <ul>
          <li>The schedule lives in this browser. To move it to another computer, download it and upload it there.</li>
          <li>The page does not know about weather, staffing or special events. Enter those by hand.</li>
          <li>A much bigger camp may not fit under the rules. The Settings tab will say so.</li>
        </ul>

        <p>
          Something not working, or a question this does not answer? <a href={SUPPORT_LINK}>Contact support</a> ({SUPPORT_EMAIL}).
        </p>
        <div className="modal-buttons">
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
