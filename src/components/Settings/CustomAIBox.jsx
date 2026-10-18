import React, { useState } from 'react';
import { PRESETS, customAIFrom, customRequest, normalizeBaseUrl, normalizeKey, hostOf } from '../../services/customAI.js';

/**
 * YOUR OWN AI SERVER. OmniRoute, LM Studio, Ollama: anything with an
 * OpenAI-style address. Switched on and filled in, the writing tools use it in
 * place of OpenRouter (see services/customAI.js). The whole box is kept away
 * from the Ghost: the key is in it, and a tunnel address can carry a token.
 */
const labelStyle = { fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(155,161,170,0.7)', marginBottom: 5, display: 'block' };
const inputStyle = {
  flex: 1, minWidth: 0, width: '100%', boxSizing: 'border-box',
  background: 'rgba(16,18,21,0.7)', border: '1px solid rgba(155,161,170,0.22)', borderRadius: 8,
  padding: '8px 11px', fontSize: '0.84rem', color: '#e6e8eb', outline: 'none', fontFamily: 'var(--faf-font)',
};
const buttonStyle = {
  padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(155,161,170,0.25)', background: 'rgba(16,18,21,0.7)',
  color: 'rgba(230,232,235,0.8)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--faf-font)', whiteSpace: 'nowrap',
};
const TONE = { ok: '#4ade80', bad: '#f87171', busy: 'rgba(230,232,235,0.7)' };

export default function CustomAIBox({ config, onUpdate }) {
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState(null);
  const on = Boolean(config.customAiOn);
  const url = normalizeBaseUrl(config.customAiUrl);
  const key = normalizeKey(config.customAiKey);
  const model = String(config.customAiModel || '').trim();
  const ready = Boolean(customAIFrom(config));

  const findModels = async () => {
    if (!url) { setStatus({ tone: 'bad', text: 'Put the address in first.' }); return; }
    setStatus({ tone: 'busy', text: `Asking ${hostOf(url)} for its models…` });
    const r = await customRequest('models', { url, key });
    if (!r.ok) { setStatus({ tone: 'bad', text: r.message }); return; }
    const ids = [...new Set((r.json?.data || r.json?.models || []).map((m) => m?.id || m?.name).filter(Boolean))];
    setModels(ids);
    if (!ids.length) { setStatus({ tone: 'bad', text: `${hostOf(url)} answered but listed no models. Type the model name yourself.` }); return; }
    if (!model) onUpdate('customAiModel', ids[0]);
    setStatus({ tone: 'ok', text: `Found ${ids.length} model${ids.length === 1 ? '' : 's'}. Pick one in the Model box.` });
  };

  const test = async () => {
    if (!url || !model) { setStatus({ tone: 'bad', text: 'Fill in the address and the model first.' }); return; }
    setStatus({ tone: 'busy', text: `Testing ${model} on ${hostOf(url)}…` });
    const r = await customRequest('chat/completions', {
      url, key, body: { model, max_tokens: 8, messages: [{ role: 'user', content: 'Reply with the single word OK.' }] },
    });
    if (!r.ok) { setStatus({ tone: 'bad', text: r.message }); return; }
    const said = String(r.json?.choices?.[0]?.message?.content || '').trim().slice(0, 40);
    setStatus({ tone: 'ok', text: `It works. ${model} answered${said ? `: "${said}"` : '.'}${on ? '' : ' Switch it on above to write with it.'}` });
  };

  return (
    <div
      style={{ marginBottom: 18 }}
      data-ghost-keep-out
      data-help="Optional. Use your own AI server (OmniRoute, LM Studio, Ollama) for the writing tools instead of OpenRouter. Pictures and voices still use your OpenRouter key. Everything here stays on this device."
    >
      <label style={labelStyle}>Your own AI server (optional)</label>

      <button
        type="button"
        onClick={() => onUpdate('customAiOn', !on)}
        aria-pressed={on}
        style={{ ...buttonStyle, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, whiteSpace: 'normal', textAlign: 'left' }}
      >
        <span aria-hidden="true" style={{
          width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto',
          background: on ? 'var(--accent-emerald)' : 'var(--text-dim)',
          boxShadow: on ? '0 0 0 1px var(--accent-emerald)' : 'none',
        }} />
        {on ? 'On: the writing tools use your server' : 'Off: the writing tools use OpenRouter'}
      </button>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 7 }}>
        {PRESETS.map((p) => (
          <button key={p.name} type="button" style={{ ...buttonStyle, padding: '5px 10px', fontSize: '0.72rem' }} onClick={() => onUpdate('customAiUrl', p.url)}>
            {p.name}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={config.customAiUrl || ''}
        onChange={(e) => onUpdate('customAiUrl', e.target.value)}
        placeholder="Address, e.g. http://localhost:20128/v1"
        autoComplete="off"
        spellCheck={false}
        style={{ ...inputStyle, marginBottom: 7 }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
        <input
          type={showKey ? 'text' : 'password'}
          value={config.customAiKey || ''}
          onChange={(e) => onUpdate('customAiKey', e.target.value)}
          placeholder="Key (leave empty if your server has none)"
          autoComplete="off"
          style={inputStyle}
        />
        <button type="button" style={buttonStyle} onClick={() => setShowKey(!showKey)}>{showKey ? 'Hide' : 'Show'}</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
        <input
          type="text"
          list="custom-ai-models"
          value={config.customAiModel || ''}
          onChange={(e) => onUpdate('customAiModel', e.target.value)}
          placeholder="Model name"
          autoComplete="off"
          spellCheck={false}
          style={inputStyle}
        />
        <datalist id="custom-ai-models">
          {models.map((m) => <option key={m} value={m} />)}
        </datalist>
        <button type="button" style={buttonStyle} onClick={findModels}>Find models</button>
      </div>

      <button type="button" style={{ ...buttonStyle, width: '100%' }} onClick={test}>Test it</button>

      {status && (
        <p role="status" style={{ fontSize: '0.72rem', color: TONE[status.tone], marginTop: 6, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          {status.text}
        </p>
      )}
      {on && !ready && (
        <p style={{ fontSize: '0.72rem', color: '#FFD08A', marginTop: 6, lineHeight: 1.5 }}>
          Fill in the address and the model. Until both are in, the writing tools keep using OpenRouter.
        </p>
      )}

      <p style={{ fontSize: '0.65rem', color: 'rgba(155,161,170,0.45)', marginTop: 6, lineHeight: 1.55 }}>
        For OmniRoute, LM Studio, Ollama or any server with an OpenAI-style address. Tap your server above, press
        Find models, pick one, then Test it. When it&rsquo;s on, Songwriter, Ghost Rider, The Matrix, Rhyme Helper,
        Song Forge lyrics and the caption skill write with it. Pictures and voices still use your OpenRouter key.
        On a phone the address has to start with https://.
      </p>
    </div>
  );
}
