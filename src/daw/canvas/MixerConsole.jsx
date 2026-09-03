import React, { useState, useEffect } from 'react';
import { useDAW } from '../context/DAWContext';
import RotaryKnob from '../components/RotaryKnob';
import HardwareFader from '../components/HardwareFader';
import MasterVUMeter from '../components/MasterVUMeter';
import busRoutingEngine from '../engine/BusRoutingEngine';
import './MixerConsole.css';

/**
 * Single Channel Strip component for individual tracks and Aux returns
 */
const ChannelStrip = ({ 
  track, 
  isAux = false, 
  isMaster = false,
  auxType = null, 
  updateTrack,
  masterVolume,
  setMasterVolume,
  limiterCeiling,
  setLimiterCeiling,
  softClip,
  setSoftClip
}) => {
  const [sends, setSends] = useState({ A: 0, B: 0 });
  const [phaseInvert, setPhaseInvert] = useState(false);
  const [trim, setTrim] = useState(0); // -12 to 12

  // Emulate peak level for the ladder meter
  const [peakLevel, setPeakLevel] = useState(-60);

  useEffect(() => {
    // Fake peak level for visuals, in a real app this is derived from AudioWorklet/AnalyserNode
    const interval = setInterval(() => {
      if (!isMaster && track && !track.muted && Math.random() > 0.3) {
        // Random level between -40 and 0 based on volume
        const volRatio = track.volume / 10;
        setPeakLevel(-40 + (Math.random() * 40 * volRatio));
      } else if (isMaster && Math.random() > 0.2) {
        const volRatio = masterVolume / 10;
        setPeakLevel(-30 + (Math.random() * 32 * volRatio));
      } else {
        setPeakLevel(-60);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [track, isMaster, masterVolume]);

  const handleVolumeChange = (newVol) => {
    if (isMaster) {
      setMasterVolume(newVol);
    } else if (isAux) {
      // aux volume
      busRoutingEngine.setAuxReturnVolume(auxType, newVol / 10);
      // We aren't storing aux volume in context right now, local state or bus config
    } else {
      updateTrack(track.id, { volume: newVol });
    }
  };

  const handlePanChange = (newPan) => {
    if (!isMaster && !isAux) {
      updateTrack(track.id, { pan: newPan });
    }
  };

  const toggleMute = () => {
    if (!isMaster && !isAux) {
      updateTrack(track.id, { muted: !track.muted });
    }
  };

  const toggleSolo = () => {
    if (!isMaster && !isAux) {
      updateTrack(track.id, { soloed: !track.soloed });
    }
  };

  const handleSendA = (val) => {
    setSends(prev => ({ ...prev, A: val }));
    if (track) busRoutingEngine.setTrackSend(track.id, 'A', val / 100);
  };

  const handleSendB = (val) => {
    setSends(prev => ({ ...prev, B: val }));
    if (track) busRoutingEngine.setTrackSend(track.id, 'B', val / 100);
  };

  return (
    <div className={`channel-strip ${isMaster ? 'master-strip' : ''} ${isAux ? 'aux-strip' : ''}`}>
      <div 
        className="strip-header" 
        style={{ borderTopColor: track?.color || 'var(--gm-text-muted)' }}
      >
        <span className="strip-title">{isMaster ? 'MASTER' : isAux ? `FX ${auxType.toUpperCase()}` : track.name}</span>
      </div>

      {!isMaster && (
        <div className="strip-section input-section">
          {!isAux && (
            <>
              <div className="trim-control">
                <RotaryKnob 
                  value={trim} 
                  min={-12} 
                  max={12} 
                  onChange={setTrim} 
                  size={38} 
                  label="TRIM" 
                />
              </div>
              <button 
                className={`phase-btn ${phaseInvert ? 'active' : ''}`}
                onClick={() => setPhaseInvert(!phaseInvert)}
              >
                Ø
              </button>
            </>
          )}
        </div>
      )}

      {isMaster && (
        <div className="strip-section master-fx-section">
          <RotaryKnob 
            value={limiterCeiling} 
            min={-12} 
            max={0} 
            onChange={setLimiterCeiling} 
            size={38} 
            label="LIMIT" 
          />
          <button 
            className={`soft-clip-btn ${softClip ? 'active' : ''}`}
            onClick={() => setSoftClip(!softClip)}
          >
            S-CLIP
          </button>
        </div>
      )}

      {!isMaster && !isAux && (
        <div className="strip-section sends-section">
          <RotaryKnob 
            value={sends.A} 
            min={0} 
            max={100} 
            onChange={handleSendA} 
            size={38} 
            label="SND A" 
            showRing={true}
          />
          <RotaryKnob 
            value={sends.B} 
            min={0} 
            max={100} 
            onChange={handleSendB} 
            size={38} 
            label="SND B" 
            showRing={true}
          />
        </div>
      )}

      <div className="strip-section pan-section">
        {!isMaster && !isAux && (
          <RotaryKnob 
            value={track.pan} 
            min={0} 
            max={10} 
            onChange={handlePanChange} 
            size={38} 
            label="PAN" 
            formatLabel={(val) => {
              if (val === 5) return 'C';
              return val < 5 ? `L${Math.round((5-val)*20)}` : `R${Math.round((val-5)*20)}`;
            }}
          />
        )}
      </div>

      {!isMaster && !isAux && (
        <div className="strip-section mute-solo-section">
          <button className={`solo-btn ${track.soloed ? 'active' : ''}`} onClick={toggleSolo}>S</button>
          <button className={`mute-btn ${track.muted ? 'active' : ''}`} onClick={toggleMute}>M</button>
        </div>
      )}

      <div className="strip-section fader-section">
        {isMaster && (
          <div className="master-meters">
            <MasterVUMeter orientation="vertical" leftLevel={peakLevel} rightLevel={peakLevel} />
          </div>
        )}
        
        <div className="fader-container">
          <HardwareFader 
            value={isMaster ? masterVolume : (isAux ? 8 : track.volume)} 
            min={0} 
            max={10} 
            onChange={handleVolumeChange} 
            height={180} 
          />
          
          {/* 3-Stage LED Ladder for non-master channels */}
          {!isMaster && (
            <div className="led-ladder">
              {[0, -3, -6, -12, -18, -24, -36, -48].map((db, i) => {
                let colorClass = 'led-green';
                if (db >= -3) colorClass = 'led-red';
                else if (db >= -12) colorClass = 'led-amber';
                
                const isActive = peakLevel >= db;
                return (
                  <div 
                    key={i} 
                    className={`ladder-led ${colorClass} ${isActive ? 'active' : ''}`}
                  ></div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="strip-footer">
        <div className="db-readout">
          {isMaster ? masterVolume.toFixed(1) : isAux ? '8.0' : track.volume.toFixed(1)} dB
        </div>
      </div>
    </div>
  );
};

const MixerConsole = () => {
  const { tracks, updateTrack } = useDAW();
  const [masterVolume, setMasterVolume] = useState(8.0);
  const [limiterCeiling, setLimiterCeiling] = useState(-0.5);
  const [softClip, setSoftClip] = useState(true);

  useEffect(() => {
    // Ensure routing engine is initialized
    busRoutingEngine.init();
  }, []);

  return (
    <div className="mixer-console-container">
      <div className="mixer-scroll-area">
        <div className="tracks-section">
          {tracks.map(track => (
            <ChannelStrip 
              key={track.id} 
              track={track} 
              updateTrack={updateTrack} 
            />
          ))}
        </div>

        <div className="mixer-divider"></div>

        <div className="aux-section">
          <ChannelStrip 
            isAux={true} 
            auxType="reverb" 
          />
          <ChannelStrip 
            isAux={true} 
            auxType="delay" 
          />
        </div>

        <div className="mixer-divider"></div>

        <div className="master-section">
          <ChannelStrip 
            isMaster={true}
            masterVolume={masterVolume}
            setMasterVolume={setMasterVolume}
            limiterCeiling={limiterCeiling}
            setLimiterCeiling={setLimiterCeiling}
            softClip={softClip}
            setSoftClip={setSoftClip}
          />
        </div>
      </div>
    </div>
  );
};

export default MixerConsole;
