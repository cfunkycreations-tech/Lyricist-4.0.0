import React, { useEffect, useRef, useState } from 'react';
import idleM1 from '../../assets/ghost-poses/ghost-idle-m1.webp';
import idleM2 from '../../assets/ghost-poses/ghost-idle-m2.webp';
import idleM3 from '../../assets/ghost-poses/ghost-idle-m3.webp';
import pointingM1 from '../../assets/ghost-poses/ghost-pointing-m1.webp';
import pointingM2 from '../../assets/ghost-poses/ghost-pointing-m2.webp';
import pointingM3 from '../../assets/ghost-poses/ghost-pointing-m3.webp';
import poseIdle from '../../assets/ghost-poses/ghost-idle.webp';
import posePointing from '../../assets/ghost-poses/ghost-pointing.webp';
import poseSinging from '../../assets/ghost-poses/ghost-singing.webp';
import poseDj from '../../assets/ghost-poses/ghost-dj.webp';
import poseThinking from '../../assets/ghost-poses/ghost-thinking.webp';
import poseCelebrating from '../../assets/ghost-poses/ghost-celebrating.webp';
import poseSleepy from '../../assets/ghost-poses/ghost-sleepy.webp';
import './GhostRiderMascot.css';

/**
 * GHOST RIDER, THE MASCOT. Chris, 2026-10-28: replace the old Ghost Rider
 * everywhere with the new psychedelic neon ghost (src/assets/mascot/, from
 * his art, transparent), make him feel alive, and keep him off the content.
 *
 * One component, used everywhere:
 *   variant  'header' (36-44 px) | 'card' | 'report' (72-110 px, its own
 *            space) | 'loading' (160-220 px) | 'welcome' (hero) | 'guide'
 *            (the walkthrough Ghost; size from the parent)
 *   state    'idle' | 'analyzing' | 'success' | 'error' | 'welcome' | 'sleepy'
 *   pose     'idle' | 'pointing' | 'singing' | 'dj' | 'thinking' | 'celebrating' | 'sleepy'
 *            (optional; see POSES. Overrides the pose the state would pick)
 *   speech   () => ({ id, t }) | null   the line he is speaking (walkthroughs)
 *   kind     'phone' | 'desktop'        which measured clips the ids belong to
 *
 * What moves (the art is one flat picture, so the whole character moves; no
 * part of him is warped to fake a face):
 *   idle       floats 6 px over 3.5 s with a 1.5 degree sway, neon rim pulses,
 *              the mic grille glows gold.
 *   analyzing  floats higher, rocks like he is performing, the mic glow and
 *              the rim brighten, small energy sparks circle him.
 *   success    a hop and a spin of light; error: a short puzzled tilt.
 *   welcome    leans forward.
 *   tap        108 % with a tilt and a spring back, a glow pulse (650 ms);
 *              never stops the click from reaching what it was meant for.
 *   speaking   the mic glow and a small lean follow the measured loudness of
 *              the line he is saying (the same data the old face used).
 * Off screen or in a background tab he stops. Reduced motion: a still Ghost.
 *
 * Not possible with a flat picture: real winks, a focused or worried face.
 * Those need the eyes and mouth as separate layers.
 */

// Where things are on the art, as a share of the square it is framed in.
export const MASCOT = {
  finger: [0.955, 0.412],   // the pointing fingertip
  tail: [0.587, 0.963],     // the bottom of him, where he fades out
  outline: [[155, 9], [214, 22], [316, 135], [239, 269], [189, 309], [109, 291], [62, 199], [68, 122]], // his silhouette in a 320 px square
};
// The crown-and-headphones Ghost, redrawn 2026-10-30 (Chris's art, ChatGPT, true
// transparency, lined up on the head by registration so no pose makes him jump).
// The walkthrough Ghost points right, so figureAt() and GhostHand still hang him
// up-left of the pointer. Each base has three mouths (small "ah", wide, round "oh")
// as whole-Ghost pictures swapped by --talk; the base art is the resting grin.
const MOUTHS = { idle: [idleM1, idleM2, idleM3], pointing: [pointingM1, pointingM2, pointingM3] };

/**
 * THE SEVEN POSES (Chris, 2026-10-30: the ones on the Gumroad page belong in the
 * app too). Whole-Ghost pictures, 512 px squares. A pose is only shown while he
 * is not speaking, because the lip-sync mouths are cut for the base art. With no
 * `pose` prop the state picks one: working shows him thinking, done shows him
 * celebrating, an error shows him puzzled (thinking), `sleepy` is for idle empty
 * states. Otherwise he rests in idle, and the walkthrough Ghost (variant 'guide')
 * in pointing, which figureAt() and GhostHand are built around.
 */
export const POSES = {
  idle: poseIdle, pointing: posePointing, singing: poseSinging, dj: poseDj,
  thinking: poseThinking, celebrating: poseCelebrating, sleepy: poseSleepy,
};
const POSE_FOR_STATE = { analyzing: 'thinking', success: 'celebrating', error: 'thinking', sleepy: 'sleepy' };

const FPS = 25;
const loaders = {
  phone: () => import('../../assets/ghost-face/mouth-phone.json'),
  desktop: () => import('../../assets/ghost-face/mouth-desktop.json'),
};
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function GhostRiderMascot({
  variant = 'card', state = 'idle', pose, animated = true, interactive = false,
  speech, kind = 'phone', label, size, className = '', style, onClick,
}) {
  const rootRef = useRef(null);
  const speechRef = useRef(speech);
  speechRef.current = speech;
  const [tapped, setTapped] = useState(0);
  const [offscreen, setOffscreen] = useState(false);
  const still = !animated || reducedMotion();

  // Pause when off screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || still || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting), { rootMargin: '40px' });
    io.observe(el);
    return () => io.disconnect();
  }, [still]);

  // Speaking: the loudness of the playing line drives --talk (0..1). It never
  // touches the audio itself (Web Audio on iPhone can silence it).
  useEffect(() => {
    if (!speech || still) return undefined;
    let dead = false, raf = 0, data = null, talk = 0;
    loaders[kind]?.().then((m) => { if (!dead) data = m.default || m; }).catch(() => {});
    const frame = (now) => {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      const sp = speechRef.current?.();
      let want = 0;
      if (sp) {
        const row = data?.[sp.id];
        if (row) {
          const i = Math.floor(sp.t * FPS);
          const c = i >= 0 && i < row.length ? row.charCodeAt(i) - 48 : 0;
          want = c >= 0 && c <= 3 ? c / 3 : 0;
        } else {
          want = (Math.sin(now / 95) + Math.sin(now / 41) * 0.6 + 1.6) / 3.2;
        }
      }
      talk += (want - talk) * 0.35;
      rootRef.current?.style.setProperty('--talk', talk.toFixed(3));
      if (rootRef.current) rootRef.current.dataset.mouth = String(Math.min(3, Math.round(talk * 3)));
    };
    raf = requestAnimationFrame(frame);
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, [Boolean(speech), kind, still]);

  const base = variant === 'guide' ? 'pointing' : 'idle';
  const src = POSES[speech ? base : (pose || POSE_FOR_STATE[state] || base)];
  const mouths = speech ? MOUTHS[base] : null;
  const tap = (e) => {
    if (interactive && !still) setTapped((n) => n + 1);
    onClick?.(e);
  };
  const decorative = !label;

  return (
    <span
      ref={rootRef}
      className={[
        'grm', `grm-${variant}`, `grm-${state}`,
        still ? 'is-still' : '', offscreen ? 'is-off' : '', speech ? 'is-speaking' : '',
        interactive ? 'is-interactive' : '', className,
      ].filter(Boolean).join(' ')}
      style={{ ...(size ? { '--grm-size': typeof size === 'number' ? `${size}px` : size } : null), ...style }}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? 'true' : undefined}
      onClick={interactive || onClick ? tap : undefined}
    >
      <span className="grm-float">
        <span key={`${state}-${tapped}`} className={`grm-act${tapped ? ' is-tapped' : ''}`}>
          <img className="grm-glow" src={src} alt="" draggable="false" decoding="async" />
          <img className="grm-art" src={src} alt="" draggable="false" decoding="async" />
          {mouths && mouths.map((m, i) => (
            <img key={i} className={`grm-art grm-mouth grm-m${i + 1}`} src={m} alt="" draggable="false" decoding="async" />
          ))}
          {state === 'analyzing' && !still && (
            <span className="grm-sparks">{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ '--i': i }} />)}</span>
          )}
        </span>
      </span>
    </span>
  );
}

const LOADING_LINES = [
  'Ghost Rider is reading your lyrics…',
  'Breaking down the rhyme patterns…',
  'Analyzing flow and structure…',
  'Finding the emotional heartbeat…',
  'Putting the finishing touches on the analysis…',
];

/**
 * While an analysis runs: the big Ghost performing, and a line that changes
 * every few seconds. The lines are only presentation; none of them claims a
 * step has finished. It runs on CSS and one timer, so it never holds up the
 * request, and it disappears the moment the caller stops rendering it.
 */
export function GhostRiderLoading({ lines = LOADING_LINES }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % lines.length), 2600);
    return () => clearInterval(id);
  }, [lines.length]);
  return (
    <div className="grm-loading-card" role="status" aria-live="polite">
      <GhostRiderMascot variant="loading" state="analyzing" />
      <p key={i} className="grm-loading-line">{lines[i]}</p>
    </div>
  );
}
