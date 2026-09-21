import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { canonicalLabel, isListed, searchGroups } from '../activitySearch';

interface Props {
  value: string;
  label: string;
  onCommit: (label: string) => void;
  /** Called while open: which other bunks already have each activity in this period, e.g. "(O1)". */
  usage?: () => Map<string, string>;
}

const NO_USAGE = new Map<string, string>();

interface Pos {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

const PANEL_MAX_HEIGHT = 260;

interface Lead {
  label: string;
  text: string;
}

/**
 * The activity dropdown: click to open the grouped list, type to filter it, or type something
 * that isn't listed and press Enter / click away to write it in. One instance per grid cell, so
 * the list itself only exists while a cell is open.
 */
export default function ActivityPicker({ value, label, onCommit, usage }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<Pos | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const r = inputRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const flip = below < PANEL_MAX_HEIGHT + 8 && r.top > below;
    const room = (flip ? r.top : below) - 8;
    setPos({
      left: r.left,
      width: r.width,
      maxHeight: Math.max(120, Math.min(PANEL_MAX_HEIGHT, room)),
      ...(flip ? { bottom: window.innerHeight - r.top } : { top: r.bottom }),
    });
  };

  const openPanel = () => {
    place();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if (!panelRef.current?.contains(e.target as Node)) place();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (open && active >= 0) panelRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const query = typed ?? '';
  const trimmed = query.trim();
  const lead: Lead[] = [];
  if (open && !trimmed) lead.push({ label: '', text: '-' });
  // Last, so ArrowDown from the text box lands on the first real match rather than the write-in.
  const tail: Lead[] = open && trimmed && !isListed(trimmed) ? [{ label: trimmed, text: `Use "${trimmed}"` }] : [];
  const used = open && usage ? usage() : NO_USAGE;
  const groups = open ? searchGroups(query) : [];
  const writtenIn = [...used.keys()].filter((l) => !isListed(l) && l.toLowerCase().includes(trimmed.toLowerCase()));
  if (writtenIn.length) groups.push({ group: 'Written in for this period', items: writtenIn.map((l) => ({ label: l, area: null })) });
  const flat = [...lead.map((l) => l.label), ...groups.flatMap((g) => g.items.map((a) => a.label)), ...tail.map((l) => l.label)];

  const close = () => {
    setTyped(null);
    setOpen(false);
    setActive(-1);
  };

  const choose = (chosen: string) => {
    onCommit(chosen);
    close();
  };

  const finishTyping = () => {
    if (typed !== null && canonicalLabel(typed) !== value) onCommit(canonicalLabel(typed));
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openPanel();
      setActive((a) => (e.key === 'ArrowDown' ? Math.min(a + 1, flat.length - 1) : Math.max(a - 1, -1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0) choose(flat[active]);
      else finishTyping();
    } else if (e.key === 'Escape') {
      close();
    }
  };

  let n = lead.length;

  return (
    <>
      <input
        ref={inputRef}
        className="activity-input"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        autoComplete="off"
        spellCheck={false}
        value={typed ?? value}
        onFocus={(e) => {
          e.currentTarget.select();
          openPanel();
        }}
        onClick={() => !open && openPanel()}
        onChange={(e) => {
          setTyped(e.target.value);
          setActive(-1);
          if (!open) openPanel();
        }}
        onBlur={finishTyping}
        onKeyDown={onKeyDown}
      />
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="combo-panel"
            role="listbox"
            style={{ left: pos.left, minWidth: Math.max(pos.width, 200), maxHeight: pos.maxHeight, top: pos.top, bottom: pos.bottom }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {lead.map((l, i) => (
              <div
                key={`lead${i}`}
                className="combo-option"
                role="option"
                aria-selected={active === i}
                data-active={active === i}
                onClick={() => choose(l.label)}
              >
                {l.text}
              </div>
            ))}
            {groups.map((g) => (
              <div key={g.group ?? g.items[0].label}>
                {g.group && <div className="combo-group">{g.group}</div>}
                {g.items.map((a) => {
                  const i = n++;
                  return (
                    <div
                      key={a.label}
                      className={`combo-option${a.label === value ? ' current' : ''}${g.group ? ' grouped' : ''}`}
                      role="option"
                      aria-selected={active === i}
                      data-active={active === i}
                      onClick={() => choose(a.label)}
                    >
                      {a.label}
                      {used.get(a.label) && <span className="combo-note"> {used.get(a.label)}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
            {tail.map((l) => {
              const i = n++;
              return (
                <div
                  key="write-in"
                  className="combo-option write-in"
                  role="option"
                  aria-selected={active === i}
                  data-active={active === i}
                  onClick={() => choose(l.label)}
                >
                  {l.text}
                </div>
              );
            })}
            {flat.length === 0 && <div className="combo-empty">No matches</div>}
          </div>,
          document.body,
        )}
    </>
  );
}
