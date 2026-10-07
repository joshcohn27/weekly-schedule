/** A week the run could not finish inside its time: how many of its periods were left empty (0 when it is short in another way). */
export interface UnfinishedWeek {
  weekNumber: number;
  empty: number;
}

interface Props {
  /** 1-based numbers of the weeks that were generated, in order. */
  weekNumbers: number[];
  seed: number;
  onUndo: () => void;
  /** The weeks that did not come out complete. Left out or empty: every week is complete. */
  unfinished?: UnfinishedWeek[];
  /** Generate the unfinished weeks again, with the week before the first of them and the ones after. */
  onKeepTrying?: () => void;
}

/** "Week 2", "Weeks 1 and 3", "Weeks 1 to 4". */
export function weeksPhrase(numbers: number[]): string {
  if (numbers.length === 1) return `Week ${numbers[0]}`;
  const inARow = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
  if (inARow && numbers.length > 2) return `Weeks ${numbers[0]} to ${numbers[numbers.length - 1]}`;
  return `Weeks ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
}

/**
 * The line after Auto generate. Either every week is complete, or it says plainly which weeks are not fully done and
 * offers to keep trying. It never lists rules.
 */
export default function AutoGenerateStatus({ weekNumbers, seed, onUndo, unfinished = [], onKeepTrying }: Props) {
  const complete = unfinished.length === 0;
  return (
    <div className={complete ? 'autogen-status' : 'autogen-status not-done'}>
      {complete ? (
        <span>
          {weeksPhrase(weekNumbers)} generated. Check the Tracking tab for the totals. Press Auto generate again for a different version.
        </span>
      ) : (
        <span>
          <strong>Not fully done.</strong>{' '}
          {unfinished
            .map((u) => (u.empty > 0 ? `Week ${u.weekNumber} has ${u.empty} empty ${u.empty === 1 ? 'period' : 'periods'}, in yellow` : `Week ${u.weekNumber} is not complete`))
            .join('. ')}
          . Nothing that keeps every rule was found for {unfinished.length === 1 ? 'it' : 'them'} in the time allowed. Everything that is on the
          schedule keeps the rules.
        </span>
      )}{' '}
      {!complete && onKeepTrying && (
        <>
          <button type="button" className="primary" onClick={onKeepTrying}>
            Keep trying
          </button>{' '}
        </>
      )}
      <button type="button" onClick={onUndo}>
        Undo
      </button>{' '}
      <span className="muted">Seed {seed}</span>
    </div>
  );
}
