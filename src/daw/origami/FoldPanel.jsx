import React from 'react';

/**
 * A flap: hinged on its edge, lying over the writing surface when open.
 *
 * It never participates in layout — the surface underneath keeps its full
 * size whether this is folded or not, so opening a panel cannot reflow the
 * words being written. The hinge itself is CSS (rotateX / rotateY on a
 * perspective); this only owns the open class and the content.
 *
 * @param {Object}  props
 * @param {'t'|'b'|'l'|'r'} props.edge
 * @param {string}  props.id
 * @param {string}  props.title    Panel name, shown in its header.
 * @param {string}  [props.meta]   Right-aligned hint in the header.
 * @param {boolean} props.open
 * @param {React.ReactNode} props.children
 */
export default function FoldPanel({ edge, id, title, meta, open, children }) {
  return (
    <section className={`fold ${edge}${open ? ' open' : ''}`} id={id} aria-hidden={!open}>
      <div className="fh">
        <b>{title}</b>
        {meta && <span>{meta}</span>}
      </div>
      <div className="fb">{children}</div>
    </section>
  );
}
