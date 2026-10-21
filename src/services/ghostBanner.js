/**
 * THE GHOST NEVER WORKS UNDER THE LOGO BANNER.
 *
 * Chris: the banner at the top covered the ghost and what he was pointing at.
 * While the Ghost Demo or the Ghost's hand is on screen the banner folds away
 * (html.ghost-active, styled in index.css), which hands the tab its full height
 * back; it opens again when the last holder lets go. Counted, so the demo and
 * the hand can overlap without one reopening the banner under the other.
 */
let holds = 0;
const root = () => (typeof document !== 'undefined' ? document.documentElement : null);

export function holdBannerClosed() {
  holds += 1;
  root()?.classList.add('ghost-active');
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    if (!holds) root()?.classList.remove('ghost-active');
  };
}
