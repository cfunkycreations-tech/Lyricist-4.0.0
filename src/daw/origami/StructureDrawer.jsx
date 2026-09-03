import React from 'react';
import { useDAW } from '../context/DAWContext';

/**
 * Song structure, in the right-hand flap.
 *
 * Lifted out of the lyric page so the writing surface holds nothing but the
 * words. Selecting here is what the surface writes into, which is why the
 * active section lives in DAWContext rather than in either component.
 */
export default function StructureDrawer() {
  const { lyrics, activeSectionId, setActiveSectionId, addLyricSection } = useDAW();
  const current = activeSectionId || (lyrics[0] && lyrics[0].id);

  return (
    <>
      <div className="grp">Arrangement</div>
      {lyrics.map((sec, i) => {
        const lines = (sec.lines || []).filter((l) => String(l.text || '').trim()).length;
        const on = sec.id === current;
        return (
          <button
            type="button"
            key={sec.id}
            className={`li li-btn${on ? ' on' : ''}`}
            onClick={() => setActiveSectionId(sec.id)}
          >
            <b style={{ textTransform: 'capitalize' }}>{i + 1}. {sec.type}</b>
            <u>{lines ? `${lines} ln` : 'empty'}</u>
          </button>
        );
      })}
      <div className="grp">Add</div>
      <div className="chipwrap">
        {['verse', 'chorus', 'bridge', 'outro'].map((t) => (
          <button type="button" key={t} className="pat" onClick={() => addLyricSection(t)}>
            {t}
          </button>
        ))}
      </div>
    </>
  );
}
