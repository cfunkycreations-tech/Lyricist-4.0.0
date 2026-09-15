import React from 'react';
import { useLyricStore, prebuiltTemplates, sectionLabels, sectionDefaultLines } from '../../context/LyricStore.jsx';
import { ArrowUp, ArrowDown, Trash2, PlusCircle } from 'lucide-react';

export default function StructureBuilder() {
  const store = useLyricStore();

  const handleTemplateChange = (id) => {
    store.setStructureTemplate(id);
    const preset = prebuiltTemplates.find(p => p.id === id);
    if (preset) {
      store.setCustomStructure(preset.structure);
      
      // Wipe or rebuild current sections based on template if empty
      if (store.lyrics.length === 0) {
        preset.structure.forEach(type => {
          store.addSection(type);
        });
      }
    }
  };

  const handleAddSectionType = (type) => {
    store.setCustomStructure(prev => [...prev, type]);
    // Also append directly to active lyrics if we have active song
    store.addSection(type);
  };

  const handleRemoveCustomSection = (idx, sectionId) => {
    const updated = [...store.customStructure];
    updated.splice(idx, 1);
    store.setCustomStructure(updated);

    if (sectionId) {
      store.removeSection(sectionId);
    }
  };

  const handleMove = (idx, direction) => {
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= store.lyrics.length) return;
    
    // Swap in active lyrics
    store.reorderSections(idx, nextIdx);

    // Swap in custom structure
    const updated = [...store.customStructure];
    const [moved] = updated.splice(idx, 1);
    updated.splice(nextIdx, 0, moved);
    store.setCustomStructure(updated);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Template selector */}
      <div data-help="A song's STRUCTURE is the order of its parts — like Verse, then Chorus, then Verse again. A preset is a ready-made order you can pick so you don't have to build it from scratch. You can still rearrange it below.">
        <label style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' }}>
          Song Structure (the order of parts)
        </label>
        <select
          value={store.structureTemplate}
          onChange={(e) => handleTemplateChange(e.target.value)}
          style={{
            width: '100%',
            background: 'rgba(16,18,21,0.7)',
            border: '1px solid rgba(155,161,170,0.22)',
            borderRadius: 8,
            padding: '7px 10px',
            fontSize: '0.82rem',
            color: '#e6e8eb',
            outline: 'none',
            fontFamily: 'var(--faf-font)'
          }}
        >
          {prebuiltTemplates.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* HOOK-FIRST MODE SITS BETWEEN THE TWO, and that is the whole point.
          Chris, 2026-09-11: *"this hook first is below the arrangement sequence
          box. I want it to go up here between the arrangement and song
          structure. That's where it needs to go, not below the arrangement
          sequence. That's backwards."* He is right: it answers "in what order do
          I write this song", which is the same question the preset above just
          asked and which the running order below is the answer to. Underneath
          the arrangement it read as an afterthought about a list it actually
          governs. */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 8,
          background: 'rgba(155,161,170,0.06)', border: '1px solid rgba(155,161,170,0.16)',
        }}
        data-help="The HOOK (also called the chorus) is the catchy part of a song that repeats and sticks in your head. Turn this ON to write that catchy part FIRST, then build the rest of the song around it. Off = write the song in order, start to finish."
      >
        <input
          type="checkbox"
          id="hook-first-toggle"
          checked={store.hookFirstMode}
          onChange={(e) => store.setHookFirstMode(e.target.checked)}
          style={{ width: '16px', height: '16px', accentColor: '#9ba1aa', flexShrink: 0 }}
        />
        <label htmlFor="hook-first-toggle" style={{ fontSize: '0.75rem', color: '#e6e8eb', cursor: 'pointer' }}>
          Hook-First Mode (write the catchy chorus first)
        </label>
      </div>

      {/* Custom structure builder */}
      <div style={{ background: 'rgba(16,18,21,0.5)', borderRadius: 10, padding: 12, border: '1px solid rgba(155,161,170,0.14)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span
            style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.8)' }}
            data-help="The exact running order of your song's parts, top to bottom. Use the up/down arrows to reorder a part, the trash can to remove it, and the buttons below to add a new part. This is YOUR arrangement — change it however you like."
          >
            Arrangement Sequence
          </span>
          <span style={{ fontSize: '0.6rem', color: 'rgba(155,161,170,0.45)' }}>
            ({store.lyrics.length} sections)
          </span>
        </div>

        {/* Section sequence drag/order view */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '200px', overflowY: 'auto', paddingRight: 4 }}>
          {store.lyrics.map((sec, idx) => (
            <div
              key={sec.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '5px 8px',
                background: 'rgba(16,18,21,0.8)',
                border: '1px solid rgba(155,161,170,0.18)',
                borderRadius: 6,
                fontSize: '0.74rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ opacity: 0.4 }}>{idx + 1}.</span>
                <span style={{ fontWeight: 600 }}>{sec.name}</span>
                <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>({sec.type})</span>
              </div>

              {/* Move arrows & Trash */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button
                  onClick={() => handleMove(idx, -1)}
                  disabled={idx === 0}
                  style={{ background: 'transparent', border: 'none', color: '#e6e8eb', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.3 : 1 }}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  onClick={() => handleMove(idx, 1)}
                  disabled={idx === store.lyrics.length - 1}
                  style={{ background: 'transparent', border: 'none', color: '#e6e8eb', cursor: idx === store.lyrics.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === store.lyrics.length - 1 ? 0.3 : 1 }}
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  onClick={() => handleRemoveCustomSection(idx, sec.id)}
                  style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          {store.lyrics.length === 0 && (
            <div style={{ textAlign: 'center', color: 'rgba(155,161,170,0.4)', fontSize: '0.72rem', padding: '10px 0' }}>
              No sections. Click below to add.
            </div>
          )}
        </div>

        {/* Add section triggers */}
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(155,161,170,0.12)' }}
          data-help="Add another part to your song. Each button adds that kind of section to the bottom of the arrangement above — then you can move it wherever you want."
        >
          {Object.keys(sectionLabels).map(type => (
            <button
              key={type}
              onClick={() => handleAddSectionType(type)}
              style={{
                padding: '3px 6px',
                fontSize: '0.62rem',
                fontWeight: 600,
                borderRadius: 5,
                background: 'rgba(155,161,170,0.12)',
                border: '1px solid rgba(155,161,170,0.25)',
                color: '#e6e8eb',
                cursor: 'pointer',
                transition: 'all 0.1s'
              }}
              onMouseEnter={(e) => { e.target.style.background = 'rgba(155,161,170,0.22)'; }}
              onMouseLeave={(e) => { e.target.style.background = 'rgba(155,161,170,0.12)'; }}
            >
              + {sectionLabels[type]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
