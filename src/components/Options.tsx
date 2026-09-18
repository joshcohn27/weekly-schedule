import { OPTION_GROUPS } from '../config';

/** Built once and shared by every dropdown so hundreds of selects stay cheap. */
export const OPTIONS = (
  <>
    <option value="">-</option>
    {OPTION_GROUPS.map((g) =>
      g.group ? (
        <optgroup key={g.group} label={g.group}>
          {g.items.map((i) => (
            <option key={i.label} value={i.label}>
              {i.label}
            </option>
          ))}
        </optgroup>
      ) : (
        g.items.map((i) => (
          <option key={i.label} value={i.label}>
            {i.label}
          </option>
        ))
      ),
    )}
  </>
);
