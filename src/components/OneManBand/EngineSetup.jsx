import React, { useEffect, useRef, useState } from 'react';
import './EngineSetup.css';

/**
 * THE SETUP THAT USED TO BE A PARAGRAPH OF INSTRUCTIONS.
 *
 * Chris, 2026-08-19: *"we have to figure out a way to tell people how to install
 * ComfyUI and use Kaggle because the instructions are very vague. No one's gonna
 * know how to do that except people like me and you. So we have to figure out
 * how to push one button that sets it up for them."*
 *
 * So: two cards, one button each, and every hard part moved into the app.
 *
 * KAGGLE is the one worth caring about, because it is free, it needs no
 * hardware, and it is the only route to a full three-to-five minute song. It
 * used to mean: make an account, find the notebook, upload it, know that
 * "Accelerator" means GPU and set it to T4 x2, know that Internet is off by
 * default and turn it on, find the one cell that holds your words, paste them in
 * without breaking the Python, press Run All, wait, then find the Output panel.
 * Nine chances to get it wrong. It is now: click a button that opens the token
 * page, click Create New Token, click a button and pick the file that downloads.
 * Once, forever. Everything after that is the app talking to Kaggle's API.
 *
 * ON THIS COMPUTER is honest before it is eager. It reads the actual graphics
 * card and says what that card will really do, with numbers, BEFORE anybody
 * spends 12 GB of their data allowance finding out. If the answer is "hours",
 * it says hours and points at the two free options that are faster.
 *
 * Written for somebody who has never heard of a virtual environment. No jargon
 * survives into the visible text: no venv, no CUDA, no sm_75, no API key, no
 * kernel. Those live in the code and in the log, where they belong.
 */

const TOKEN_PAGE = 'https://www.kaggle.com/settings/account';

function Bar({ p }) {
  return (
    <div className="es-bar" role="progressbar" aria-valuenow={Math.round((p || 0) * 100)}>
      <span style={{ width: `${Math.max(2, Math.min(100, (p || 0) * 100))}%` }} />
    </div>
  );
}

export default function EngineSetup({ onKaggleReady, onLocalReady }) {
  const api = typeof window !== 'undefined' ? window.lyricistAPI : null;

  const [comfy, setComfy] = useState(null);
  const [kaggle, setKaggle] = useState(null);
  const [job, setJob] = useState(null);          // 'comfy' | 'kaggle' | null
  const [pct, setPct] = useState(0);
  const [line, setLine] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const refresh = async () => {
    if (!api) return;
    try { setComfy(await api.comfyStatus()); } catch { /* older build */ }
    try { setKaggle(await api.kaggleStatus(false)); } catch { /* older build */ }
  };
  useEffect(() => { refresh(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!api?.onSetupProgress) return undefined;
    return api.onSetupProgress(({ job: which, p, msg }) => {
      if (!mounted.current) return;
      if (typeof p === 'number') setPct(p);
      if (msg) setLine(msg);
      setJob((cur) => cur || which);
    });
  }, [api]);

  if (!api) {
    return (
      <div className="es">
        <p className="es-note">
          Setting these up needs the desktop app. In the browser preview only the free cloud runs.
        </p>
      </div>
    );
  }

  const installLocal = async () => {
    setErr(''); setNote(''); setJob('comfy'); setPct(0); setLine('Starting');
    const r = await api.comfyInstall();
    if (!mounted.current) return;
    setJob(null);
    if (!r?.ok) { setErr(r?.error || 'It did not finish.'); await refresh(); return; }
    setLine('Installed. Starting it up');
    setJob('comfy');
    const s = await api.comfyStart();
    setJob(null);
    if (!mounted.current) return;
    if (!s?.ok) { setErr(s.error || 'Installed, but it would not start.'); }
    else { setNote('Ready. "This computer" is switched on below.'); onLocalReady?.(s.base); }
    await refresh();
  };

  const connectKaggle = async () => {
    setErr(''); setNote('');
    const r = await api.kaggleConnectFile();
    if (!mounted.current) return;
    if (r?.canceled) return;
    if (!r?.ok) { setErr(r?.error || 'That did not work.'); return; }
    setNote(`Connected as ${r.username}. "Kaggle" is switched on below.`);
    onKaggleReady?.(r.username);
    await refresh();
  };

  const gpu = comfy?.gpu;
  const busy = !!job;
  const gbTotal = comfy ? (comfy.totalBytes / 1e9).toFixed(1) : '11.9';
  const gbLeft = comfy ? (comfy.missingBytes / 1e9).toFixed(1) : gbTotal;

  return (
    <div className="es">
      <div className="es-head">
        <h3>Make longer songs, free</h3>
        <p>
          The free cloud is instant but tops out around 45 seconds a song. These two make full
          songs, and both cost nothing. Set either one up once and it stays set up.
        </p>
      </div>

      <div className="es-cards">

        {/* ---- KAGGLE: free, no hardware, the one most people want ---- */}
        <section className={`es-card${kaggle?.connected ? ' is-ready' : ''}`}>
          <header>
            <h4>Kaggle</h4>
            <span className="es-tag good">free · no hardware needed</span>
          </header>
          <p className="es-what">
            Kaggle is Google-owned and gives away <b>30 hours a week</b> of a fast graphics card.
            Your song is made on their machine. A full three minute song takes about 17 minutes and
            costs nothing, ever.
          </p>

          {kaggle?.connected ? (
            <>
              <p className="es-ok">Connected as <b>{kaggle.username}</b>.</p>
              <p className="es-fine">
                Pick <b>Kaggle</b> under "Where it runs" and press Make the song. Everything else
                happens by itself.
              </p>
              <button type="button" className="es-plain" onClick={async () => { await api.kaggleDisconnect(); refresh(); }}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <ol className="es-steps">
                <li>
                  <span>Open your Kaggle account page. Make a free account first if you need one.</span>
                  <button type="button" className="es-go" onClick={() => window.open(TOKEN_PAGE, '_blank', 'noopener')}>
                    Open Kaggle
                  </button>
                </li>
                <li>
                  <span>
                    On that page scroll to <b>API</b> and click <b>Create New Token</b>. Your browser
                    downloads a small file called <b>kaggle.json</b>. That file is the whole setup.
                  </span>
                </li>
                <li>
                  <span>Come back here and point the app at it.</span>
                  <button type="button" className="es-go primary" onClick={connectKaggle}>
                    Pick my kaggle.json
                  </button>
                </li>
              </ol>
              <p className="es-fine">
                One thing worth knowing: Kaggle asks you to verify a phone number before it will
                hand out graphics cards. That is on their side, it is free, and it is once.
              </p>
            </>
          )}
        </section>

        {/* ---- LOCAL: honest about the machine it finds ---- */}
        <section className={`es-card${comfy?.installed ? ' is-ready' : ''}`}>
          <header>
            <h4>This computer</h4>
            <span className={`es-tag${gpu?.verdict === 'good' ? ' good' : ''}`}>
              {gpu?.verdict === 'good' ? 'free · fastest · private'
                : gpu?.present ? 'free · slower on this machine' : 'needs an NVIDIA card'}
            </span>
          </header>

          {gpu && (
            <div className={`es-verdict v-${gpu.verdict}`}>
              <b>{gpu.headline}</b>
              <span>{gpu.detail}</span>
            </div>
          )}

          {comfy?.installed ? (
            <>
              <p className="es-ok">Installed and ready.</p>
              <button type="button" className="es-go" disabled={busy} onClick={async () => {
                setJob('comfy'); const s = await api.comfyStart(); setJob(null);
                if (s?.ok) { setNote('Running.'); onLocalReady?.(s.base); } else setErr(s?.error || 'It would not start.');
              }}>
                Start it
              </button>
            </>
          ) : (
            <>
              <p className="es-what">
                Puts everything on your own machine so songs never leave it and there are no limits
                at all. It is {/^(8|11|18)/.test(String(gbLeft)) ? 'an' : 'a'} <b>{gbLeft} GB</b> download{comfy && comfy.missingBytes < comfy.totalBytes
                  ? ` (${gbTotal} GB in total, the rest is already here)` : ''} and it only happens once.
              </p>
              {comfy && !comfy.pythonFound && (
                <p className="es-fine warn">
                  This one also needs Python on your computer, which is a separate free download from
                  python.org. Tick "Add Python to PATH" when it asks. Kaggle needs nothing at all, so
                  it is the easier road.
                </p>
              )}
              <button type="button" className="es-go primary" disabled={busy || gpu?.verdict === 'none'} onClick={installLocal}>
                {gpu?.verdict === 'none' ? 'Not possible on this computer' : `Set it up (${gbLeft} GB)`}
              </button>
              <p className="es-fine">
                You can stop it part way and press it again later. It carries on from where it
                stopped rather than starting the download over.
              </p>
            </>
          )}
        </section>
      </div>

      {busy && (
        <div className="es-progress">
          <Bar p={pct} />
          <div className="es-progress-row">
            <span>{line || 'Working'}</span>
            <button type="button" className="es-plain" onClick={() => api.comfyStop()}>Stop</button>
          </div>
        </div>
      )}

      {note && <p className="es-ok big">{note}</p>}
      {err && <p className="es-err">{err}</p>}
    </div>
  );
}
