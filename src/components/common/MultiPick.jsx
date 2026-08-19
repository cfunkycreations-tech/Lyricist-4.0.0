import React from 'react';
import './MultiPick.css';
import { MAX_PICKS as MAX } from '../../utils/blend.js';

/**
 * Pick more than one. Up to five, blended into one thing.
 *
 * Chris, 2026-08-19: *"I wanna be able to choose more than one genre. I want it
 * to go up to five genres mixed into one... and moods, by the way, and
 * everything else."*
 *
 * BUILT AS BUTTONS AND A DROPDOWN, NOT A CTRL-CLICK MULTI-SELECT. A native
 * `<select multiple>` is the obvious lazy answer and it is unusable for anyone
 * who does not already know that ctrl-click is a thing. He builds for beginners
 * and there are no hidden controls in this app: what you picked is a row of
 * labelled chips you can see, each with an x on it, and adding one is choosing
 * from a normal dropdown that says "Add another".
 *
 * ORDER CARRIES MEANING. The first pick is the LEAD and it is labelled as such,
 * because "Country + Trap" and "Trap + Country" are two different songs. Every
 * prompt this feeds is written to lean on the lead and let the rest colour it,
 * which is also why a plain comma-separated list would not have been enough.
 */

export const MAX_PICKS = MAX;

/**
 * @param {string}   label     what these are, e.g. "Genre"
 * @param {string[]} value     what is picked, in order; first is the lead
 * @param {Function} onChange  handed the new array
 * @param {string[]|object} options  a flat list, or { groupName: [...] } for optgroups
 * @param {Function} [nameOf]  pulls the name out of an option when it is an object
 * @param {string}   [help]    tooltip text for the app's own data-help system
 * @param {number}   [max]     ceiling, five unless told otherwise
 * @param {number}   [min]     floor, one unless told otherwise; you cannot remove the last one
 */
export default function MultiPick({
  label, value, onChange, options, nameOf = (o) => (typeof o === 'string' ? o : o.name),
  help = '', max = MAX_PICKS, min = 1, addLabel = 'Add another',
}) {
  const picks = Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
  const full = picks.length >= max;
  const grouped = options && !Array.isArray(options);

  const remaining = (list) => list.filter((o) => !picks.includes(nameOf(o)));

  const add = (name) => {
    if (!name || full || picks.includes(name)) return;
    onChange([...picks, name]);
  };
  const remove = (name) => {
    if (picks.length <= min) return;
    onChange(picks.filter((p) => p !== name));
  };
  // Promote a pick to lead. Two taps to reorder is enough control for something
  // that only has five slots; a drag-and-drop list here would be showing off.
  const lead = (name) => onChange([name, ...picks.filter((p) => p !== name)]);

  return (
    <div className="mpick" data-help={help || undefined}>
      <div className="mpick-head">
        <span className="mpick-label">{label}</span>
        <span className={`mpick-count${full ? ' at-max' : ''}`}>{picks.length} of {max}</span>
      </div>

      <div className="mpick-chips">
        {picks.map((p, i) => (
          <span key={p} className={`mpick-chip${i === 0 ? ' is-lead' : ''}`}>
            {i === 0 && <b className="mpick-lead">lead</b>}
            <button
              type="button"
              className="mpick-name"
              title={i === 0 ? 'This one leads the blend' : `Make ${p} the lead`}
              onClick={() => lead(p)}
            >
              {p}
            </button>
            {picks.length > min && (
              <button
                type="button"
                className="mpick-x"
                title={`Remove ${p}`}
                aria-label={`Remove ${p}`}
                onClick={() => remove(p)}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>

      <select
        className="mpick-add"
        value=""
        disabled={full}
        onChange={(e) => { add(e.target.value); e.target.value = ''; }}
      >
        <option value="">{full ? `${max} is the most you can mix` : `${addLabel}…`}</option>
        {grouped
          ? Object.entries(options).map(([group, list]) => {
            const left = remaining(list);
            if (!left.length) return null;
            return (
              <optgroup key={group} label={group}>
                {left.map((o) => <option key={nameOf(o)} value={nameOf(o)}>{nameOf(o)}</option>)}
              </optgroup>
            );
          })
          : remaining(options || []).map((o) => (
            <option key={nameOf(o)} value={nameOf(o)}>{nameOf(o)}</option>
          ))}
      </select>

      {picks.length > 1 && (
        <p className="mpick-note">
          Blended as <b>{picks.join(' + ')}</b>. <i>{picks[0]}</i> leads; tap another to make it the lead.
        </p>
      )}
    </div>
  );
}
