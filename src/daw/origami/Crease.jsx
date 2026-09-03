import React from 'react';

/**
 * A crease — the folded state of a panel.
 *
 * This is the whole chrome of a closed flap: a one-pixel hairline across the
 * edge with the panel's name sitting on it. It is a real button, not a
 * decoration, so the shell is operable from the keyboard.
 *
 * @param {Object}   props
 * @param {'t'|'b'|'l'|'r'} props.edge  Which edge the flap is hinged on.
 * @param {string}   props.label        Name shown on the hairline.
 * @param {boolean}  props.open         Whether its panel is unfolded.
 * @param {string}   props.controls     id of the panel, for aria-controls.
 * @param {function} props.onToggle
 */
export default function Crease({ edge, label, open, controls, onToggle }) {
  const axis = edge === 't' || edge === 'b' ? 'h' : 'v';
  return (
    <button
      type="button"
      className={`crease ${axis} ${edge}${open ? ' open' : ''}`}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      title={`${open ? 'Fold' : 'Unfold'} ${label}`}
    >
      <span className="tick">{label}</span>
    </button>
  );
}
