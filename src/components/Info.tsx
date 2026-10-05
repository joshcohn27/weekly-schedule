interface Props {
  /** What the "i" says when it is pointed at, or reached with the keyboard. */
  text: string;
}

/** A small "i" in a circle beside something that is an estimate, or that needs a sentence of explanation. */
export default function Info({ text }: Props) {
  return (
    <span className="info" role="img" aria-label={text} title={text} tabIndex={0}>
      i
    </span>
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
