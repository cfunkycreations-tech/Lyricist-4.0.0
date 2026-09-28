import React, { useEffect, useState } from 'react';
import { vstAvailable, cachedInstruments, scanInstruments, listDrivers, getDriver, setDriver } from '../../services/vstEngine.js';

/**
 * Settings plate (Creator build): the ASIO driver the VST3 instruments play on,
 * and the instruments the scan found. They show up on the pad board's Sound knob.
 */
const LBL = { fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' };
const P = { fontSize: '0.72rem', color: 'rgba(230,232,235,0.6)', margin: '0 0 10px', lineHeight: 1.5 };
const SEL = { padding: '7px 10px', borderRadius: 6, fontSize: '0.78rem', minWidth: 0 };
const BTN = { padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--faf-font)', fontSize: '0.74rem', color: '#FFD08A', background: 'rgba(16,18,21,0.7)', border: '1px solid rgba(231,165,64,0.45)' };

export default function VstPlugins() {
  const [drivers, setDrivers] = useState([]);
  const [driver, setDrv] = useState(getDriver);
  const [list, setList] = useState(cachedInstruments);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!vstAvailable()) return;
    listDrivers().then(setDrivers).catch((e) => setMsg(e.message));
  }, []);

  if (!vstAvailable()) return null;

  const rescan = async () => {
    setBusy(true); setMsg('Scanning your VST3 folder…');
    try {
      const l = await scanInstruments();
      setList(l);
      setMsg(`${l.length} instruments found.`);
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ marginBottom: 18 }} data-help="Real VST3 instruments (Diva, Zebra2, Synplant...) played by Lyricist Pro's own audio engine through an ASIO driver. Pick them on the pad board's Sound knob.">
      <label style={LBL}>
        VST3 Instruments — <span style={{ color: list.length ? '#34d399' : '#9ba1aa' }}>{list.length ? `${list.length} ready` : 'not scanned'}</span>
      </label>
      <p style={P}>
        Turn the pad board's <strong>Sound</strong> knob past the built-in sounds to reach them; <strong>Synth UI</strong> opens the plugin's own window.
        They play through the ASIO driver below. FlexASIO plays through your normal Windows output; your interface's own driver gives the lowest latency.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <select style={SEL} value={driver} aria-label="ASIO driver"
          onChange={(e) => { setDrv(e.target.value); setDriver(e.target.value); }}
          data-help="The ASIO driver the VST3 instruments play on.">
          <option value="">Automatic (FlexASIO)</option>
          {drivers.filter((d) => !/push/i.test(d)).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button type="button" style={BTN} onClick={rescan} disabled={busy} aria-busy={busy}
          data-help="Scan C:\Program Files\Common Files\VST3 again, after you install a new synth.">
          Rescan
        </button>
      </div>
      {msg && <p style={{ ...P, margin: '0 0 6px', color: '#FFD08A' }}>{msg}</p>}
      {list.length > 0 && (
        <p style={{ ...P, margin: 0 }}>{list.map((p) => p.name).join(' · ')}</p>
      )}
    </div>
  );
}
