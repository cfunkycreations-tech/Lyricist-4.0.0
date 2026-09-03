import React, { useState } from 'react';
import Vst3Browser from './sidebar/Vst3Browser';
import ArtistFlowManager from './sidebar/ArtistFlowManager';
import LexiconInspector from './sidebar/LexiconInspector';
import StyleMatch from './sidebar/StyleMatch';

const TABS = [
  { id: 'VST3', label: 'VST3' },
  { id: 'Style Match', label: 'Style' },
  { id: 'Rap Styles', label: 'Flow' },
  { id: 'Lexicon', label: 'Lexicon' }
];

/**
 * The library flap's contents.
 *
 * It no longer owns a width, a background, a border or a collapse button —
 * the flap it lives in owns all four. What is left is the tab strip and the
 * panel, both at the shell's weight.
 */
export default function Sidebar() {
  const [activeTab, setActiveTab] = useState('VST3');

  return (
    <>
      <div className="flaptabs">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`flaptab${activeTab === t.id ? ' on' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flapbody">
        {activeTab === 'VST3' && <Vst3Browser />}
        {activeTab === 'Style Match' && <StyleMatch />}
        {activeTab === 'Rap Styles' && <ArtistFlowManager />}
        {activeTab === 'Lexicon' && <LexiconInspector />}
      </div>
    </>
  );
}
