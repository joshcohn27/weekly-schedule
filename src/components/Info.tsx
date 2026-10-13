import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  /** What the "i" says when it is pointed at, tapped, or reached with the keyboard. */
  text: string;
}

const BUBBLE_WIDTH = 280;

/**
 * A small "i" in a circle beside something that is an estimate, or that needs a sentence of explanation. Pointing at it,
 * tapping it or tabbing to it shows the sentence in a bubble. The bubble is drawn over the whole page (not inside the
 * table), so a scrolling table never cuts it off.
 */
export default function Info({ text }: Props) {
  const icon = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const show = () => {
    const r = icon.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(window.innerWidth - BUBBLE_WIDTH - 8, r.left + r.width / 2 - BUBBLE_WIDTH / 2));
    setAt({ left, top: r.bottom + 6 });
  };
  const hide = () => setAt(null);

  return (
    <>
      <button
        type="button"
        ref={icon}
        className="info"
        aria-label={text}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.preventDefault();
          if (at) hide();
          else show();
        }}
      >
        i
      </button>
      {at &&
        createPortal(
          <div className="info-bubble" role="tooltip" style={{ left: at.left, top: at.top, width: BUBBLE_WIDTH }}>
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}

/** What the "i" says in the places it is used more than once. */
export const HINT = {
  aWeek: 'A rough number: the average over the whole session. A short week, or one with a trip in it, gets fewer.',
  villageWeek: 'A whole village goes at a time. The first number is what the village is given in a week; anything up to the second is only added when its bunks have periods to spare. These are averages over the session: a short week, or one with a trip in it, gets fewer. Nothing is two days running, so three in a week is the most there can be.',
  musicWeek: 'The first number is the weekly Music, and anything above it only fills a period. A bunk may go without in a week where it will not fit, as long as it has Music every other week, and it never has more than four in a session.',
  exactly: 'Every bunk is given this many, no more.',
  atLeast: 'Every bunk is given this many. More may be added to fill a period that would otherwise be Athletics or A&C.',
  noMore: 'Nobody is given a set number. The area only fills periods that would otherwise be Athletics or A&C, up to this many for a bunk.',
  leftoverKind: 'No number at all: the area fills whatever periods the others leave, like Athletics and A&C.',
  atMost: 'The most a bunk may have. Anything above the first number is only used to fill a period that would otherwise be Athletics or A&C, so not every bunk gets it.',
  leftover: 'Athletics and A&C are whatever periods the other areas leave. A most is kept. A least is aimed for, and is never a reason to leave a week unfinished: when the other areas have used the periods, a bunk gets fewer.',
  atOnce: 'How many bunks may be in this area in the same period.',
  andCampers: 'The most campers there at once, on top of the number of bunks: two bunks only go together when they have no more campers between them than this. 0 means no limit in campers.',
  perDay: 'How many bunks of one village may go to this area on the same day.',
  sameVisit: 'Ticked: bunks that share a period here must be on the same visit number (both on their second, say). Unticked: any visit will do.',
  estimate: 'This is arithmetic on the numbers, not a trial run. "Unlikely" is an estimate from what did and did not generate when it was tried.',
};
