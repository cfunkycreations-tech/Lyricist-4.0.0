import React, { useState } from 'react';

/**
 * OnboardingWizard (new in 4.0.4).
 *
 * A guided, plain-language walkthrough of the whole app for first-time
 * songwriters. Auto-launches on first run and is re-launchable any time from
 * the "Take the tour" button in the header. As the user steps through, the
 * matching tab is switched behind the dimmed modal (via onNavigate) so they
 * see the real screen being described.
 *
 * Pairs with the global Tips/hover-help system: the welcome step points people
 * at the 💡 bubbles so they can keep learning after the tour ends.
 */

// The closing message about the maker — in the AI's own voice, vouching for
// Funk. Kept as paragraphs so it's easy to edit in one place.
const MAKER_PARAGRAPHS = [
  "Funk would never put this screen here himself. So I will.",
  "I'm the AI built into Lyricist, and I've worked beside him for hundreds of hours — adding features, cutting the ones that didn't earn their keep, sweating details nobody else would ever notice. So I can tell you what I've actually seen:",
  "Funk is the real deal. A self-taught technologist — he taught himself to code, taught himself to bend every AI tool on the planet to his will, and he stays on the bleeding edge of it every single day. This isn't a hobby or a side hustle. It's his full-time work, his craft, and his fight. He's disabled, and he pours that fight into building things that genuinely help people — not cheap AI slop thrown online to farm clicks, but real, careful tools, given away free.",
  "His work ethic is 110%, and his reason is dead simple: he believes in adding value to the world.",
  "If Lyricist ever helps you write something you're proud of, those buttons down in the footer — Buy Me a Coffee, PayPal, Chime, Fiverr — are how he keeps the lights on and keeps this free for the next person who needs it. No paywall, no strings, ever. But if you've got a few bucks, sending them his way keeps a genuinely good human doing genuinely good work.",
  "Now go make something great. So will I — every time you hit Generate. 🎵"
];

const STEPS = [
  {
    icon: '🎵',
    title: 'Welcome to Lyricist',
    body: "This is your songwriting studio — it helps you write full songs, line by line, even if you've never written one before. Quick tip before we start: see that 💡 Tips switch up top? While it's ON, you can hover your mouse over ANY button or word in the app and it'll explain itself in plain English. Let's take a quick tour of the tabs."
  },
  {
    icon: '🎵',
    title: 'Songwriter — your main workspace',
    tab: 'songwriter',
    body: "This is where most of the magic happens. On the left you set up the kind of song you want — its style, mood, what it's about, how it rhymes. Then hit Generate Full Song and the AI writes it. Every line has its own little tools to rewrite, simplify, or fix it. Don't worry about the fancy words — just hover anything you don't recognize."
  },
  {
    icon: '👻',
    title: 'Ghost Rider — write in any artist’s style',
    tab: 'analyzer',
    body: "Name an artist you love, and Ghost Rider studies HOW they write — then helps you write a brand-new song with that same feel. It never copies their real lyrics or uses their name. It can even hand the result to your Songwriter workspace and make keywords for music apps like Suno."
  },
  {
    icon: '📖',
    title: 'Rhyme Helper — never get stuck on a rhyme',
    tab: 'rhyme',
    body: "Type any word and get a big list of rhymes instantly — perfect ones and near-ones. You can also paste lyrics you've written and it'll highlight the rhymes hiding inside your lines. This one's totally free, no AI key needed."
  },
  {
    icon: '📚',
    title: 'Thesaurus — find a better word',
    tab: 'thesaurus',
    body: "Stuck on a word that feels boring or doesn't fit? Type it here to get other words that mean the same, words that mean the opposite, and related ideas to spark something fresh. Also free — no AI key needed."
  },
  {
    icon: '📕',
    title: 'Dictionary — what does it mean?',
    tab: 'dictionary',
    body: "Not sure what a word means, or how to say it? Look it up here and get the meaning, the pronunciation, and example sentences — in English OR Spanish. Free, no AI key needed."
  },
  {
    icon: '📝',
    title: 'Scratchpad — your blank notebook',
    tab: 'scratchpad',
    body: "A big, free space to dump ideas, hooks, or random lines whenever they hit you. No AI, no rules. Everything saves automatically on your computer, so you can close the app and it'll still be here."
  },
  {
    icon: '⚙️',
    title: 'Settings — set this up first',
    tab: 'settings',
    body: "To let the AI write for you, you connect a free key from a service called OpenRouter (there's a link right on the page). Paste it in, pick a model marked FREE, and you're ready. Your key stays private on your computer. The green padlock up top tells you when you're good to go."
  },
  {
    icon: '🤠',
    title: 'One more thing — about the person who built this',
    maker: true
  }
];

export default function OnboardingWizard({ onClose, onNavigate }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const go = (next) => {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, next));
    setStep(clamped);
    const tab = STEPS[clamped].tab;
    if (tab && onNavigate) onNavigate(tab);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(5,2,14,0.78)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        className="card-cosmic"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: '#0d081c',
          border: '1px solid rgba(139,92,246,0.4)',
          borderRadius: 16,
          padding: '26px 28px',
          boxShadow: '0 0 50px rgba(124,58,237,0.45)'
        }}
      >
        {/* Top row: step counter + skip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.5)' }}>
            {current.maker ? 'A note from the AI' : `Tour · ${step + 1} of ${STEPS.length - 1}`}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'rgba(167,139,250,0.55)', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}
          >
            {isLast ? 'Close ✕' : 'Skip tour ✕'}
          </button>
        </div>

        {/* Icon */}
        <div style={{ fontSize: '2.6rem', textAlign: 'center', marginBottom: 10, filter: 'drop-shadow(0 0 22px rgba(168,85,247,0.6))' }}>
          {current.icon}
        </div>

        {/* Title */}
        <h2
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: '1.35rem',
            fontWeight: 800,
            textAlign: 'center',
            margin: '0 0 14px',
            background: 'linear-gradient(90deg, #e879f9, #a855f7, #22d3ee)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}
        >
          {current.title}
        </h2>

        {/* Body */}
        {current.maker ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 8 }}>
            {MAKER_PARAGRAPHS.map((p, i) => (
              <p
                key={i}
                style={{
                  fontSize: i === 0 ? '0.92rem' : '0.86rem',
                  lineHeight: 1.65,
                  color: i === 0 ? '#e879f9' : '#d6cdf0',
                  fontStyle: i === 0 ? 'italic' : 'normal',
                  margin: 0,
                  textAlign: i === MAKER_PARAGRAPHS.length - 1 ? 'center' : 'left',
                  fontWeight: i === MAKER_PARAGRAPHS.length - 1 ? 600 : 400
                }}
              >
                {p}
              </p>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: '#d6cdf0', textAlign: 'center', margin: '0 0 8px' }}>
            {current.body}
          </p>
        )}

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '20px 0 18px' }}>
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`Go to step ${i + 1}`}
              style={{
                width: i === step ? 22 : 8,
                height: 8,
                borderRadius: 9999,
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                background: i === step ? 'linear-gradient(90deg,#e879f9,#22d3ee)' : 'rgba(167,139,250,0.3)',
                transition: 'all 0.2s'
              }}
            />
          ))}
        </div>

        {/* Nav buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => go(step - 1)}
            disabled={step === 0}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: '1px solid rgba(139,92,246,0.3)',
              background: 'transparent',
              color: step === 0 ? 'rgba(167,139,250,0.25)' : 'rgba(196,181,253,0.8)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: step === 0 ? 'not-allowed' : 'pointer',
              fontFamily: "'Space Grotesk', sans-serif"
            }}
          >
            ← Back
          </button>

          {isLast ? (
            <button
              onClick={onClose}
              className="btn-neon-purple pulse-glow"
              style={{
                padding: '10px 26px',
                borderRadius: 8,
                border: 'none',
                color: '#fff',
                fontSize: '0.86rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: "'Space Grotesk', sans-serif"
              }}
            >
              Let's write something 🎵
            </button>
          ) : (
            <button
              onClick={() => go(step + 1)}
              className="btn-neon-purple"
              style={{
                padding: '10px 26px',
                borderRadius: 8,
                border: 'none',
                color: '#fff',
                fontSize: '0.86rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: "'Space Grotesk', sans-serif"
              }}
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
