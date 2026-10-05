interface Props {
  /** 1-based numbers of the weeks that were generated, in order. */
  weekNumbers: number[];
  seed: number;
  onUndo: () => void;
}

/** "Week 2", "Weeks 1 and 3", "Weeks 1 to 4". */
export function weeksPhrase(numbers: number[]): string {
  if (numbers.length === 1) return `Week ${numbers[0]}`;
  const inARow = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
  if (inARow && numbers.length > 2) return `Weeks ${numbers[0]} to ${numbers[numbers.length - 1]}`;
  return `Weeks ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
}

/** The line under the week bar after Auto generate. It never says anything about what could or could not be met. */
export default function AutoGenerateStatus({ weekNumbers, seed, onUndo }: Props) {
  return (
    <div className="autogen-status">
      <span>
        {weeksPhrase(weekNumbers)} generated. Check the Tracking tab for the totals. Press Auto generate again for a different version.
      </span>{' '}
      <button type="button" onClick={onUndo}>
        Undo
      </button>{' '}
      <span className="muted">Seed {seed}</span>
    </div>
  );
}
