import { ACTIVITIES } from '../config';

/** Shared by every activity input so the browser's native type-to-search suggestions work everywhere. */
export const ACTIVITY_LIST_ID = 'activity-options';

/** Built once and shared by every activity input, same as the old <select>'s options were. */
export const ActivityDatalist = (
  <datalist id={ACTIVITY_LIST_ID}>
    {ACTIVITIES.map((a) => (
      <option key={a.label} value={a.label} />
    ))}
  </datalist>
);
