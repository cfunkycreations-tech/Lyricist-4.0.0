import React, { useState } from 'react';
import DeviceChain from './dock/DeviceChain';
import PianoRoll from './dock/PianoRoll';
import LooperDock from './dock/LooperDock';
import TapeSlicer from './dock/TapeSlicer';
import StemSeparator from './dock/StemSeparator';
import PluginHostEditor from './dock/PluginHostEditor';
import ChordPalette from './dock/ChordPalette';
import MacroRack from './dock/MacroRack';
import DrumPadSampler from './dock/DrumPadSampler';
import GranularSynth from './dock/GranularSynth';
import AutoTuneDock from './dock/AutoTuneDock';

const TABS = [
  ['Chains', DeviceChain],
  ['Piano', PianoRoll],
  ['Pads', DrumPadSampler],
  ['Looper', LooperDock],
  ['Slicer', TapeSlicer],
  ['Stems', StemSeparator],
  ['Editor', PluginHostEditor],
  ['Chords', ChordPalette],
  ['Macros', MacroRack],
  ['Granular', GranularSynth],
  ['Tune', AutoTuneDock]
];

/**
 * The rack flap's contents.
 *
 * The dock used to own its own height, resize handle and collapse toggle.
 * The flap owns all of that now — a panel that can fold to a crease does not
 * also need a collapse button, and two of them disagreeing is how you end up
 * with content clipped behind chrome.
 */
export default function BottomDock() {
  const [activeTab, setActiveTab] = useState('Chains');
  const Panel = (TABS.find(([name]) => name === activeTab) || TABS[0])[1];

  return (
    <>
      <div className="flaptabs">
        {TABS.map(([name]) => (
          <button
            type="button"
            key={name}
            className={`flaptab${activeTab === name ? ' on' : ''}`}
            onClick={() => setActiveTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="flapbody">
        <Panel />
      </div>
    </>
  );
}
