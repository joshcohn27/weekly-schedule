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
  atLeast: 'What every bunk is given.',
  atMost: 'The most a bunk may have. Anything above the first number is only used to fill a period that would otherwise be Athletics or A&C, so not every bunk gets it.',
  leftover: 'Athletics and A&C are whatever periods the other areas leave. This is the most of them a bunk may have in a week, not a number it is given.',
  atOnce: 'How many bunks may be in this area in the same period.',
  perDay: 'How many bunks of one village may go to this area on the same day.',
  sameVisit: 'Ticked: bunks that share a period here must be on the same visit number (both on their second, say). Unticked: any visit will do.',
  estimate: 'This is arithmetic on the numbers, not a trial run. "Unlikely" is an estimate from what did and did not generate when it was tried.',
};
