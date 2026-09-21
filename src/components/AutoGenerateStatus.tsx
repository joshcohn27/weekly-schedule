interface Props {
  /** 1-based number of the week that was generated. */
  weekNumber: number;
  seed: number;
  onUndo: () => void;
}

/** The line under the week bar after Auto generate. It never says anything about what could or could not be met. */
export default function AutoGenerateStatus({ weekNumber, seed, onUndo }: Props) {
  return (
    <div className="autogen-status">
      <span>
        Week {weekNumber} generated. Check the Tracking tab for the totals. Press Auto generate again for a different version.
      </span>{' '}
      <button type="button" onClick={onUndo}>
        Undo
      </button>{' '}
      <span className="muted">Seed {seed}</span>
    </div>
  );
}
