import { useEffect, useState } from 'react';

/**
 * IS THIS THE PHONE BUILD?
 *
 * The mobile shell replaces the 18-tab strip with a launcher grid, because
 * 3325px of tabs inside a 915px screen is not navigation. But it must NEVER
 * appear on the desktop app, where the tab strip works fine and is what people
 * already know.
 *
 * Three conditions, all required:
 *   - not Electron. window.lyricistAPI is the bridge; if it exists this is the
 *     installed desktop app and nothing here applies.
 *   - actually served over http(s). file:// is Electron.
 *   - the window is phone-shaped: short or narrow. A phone sideways is about
 *     915 x 412, so HEIGHT is the tell there; held upright (9:16) it is about
 *     412 x 915, so WIDTH is. A 1280x800 desktop browser window is wider than
 *     a phone in landscape but twice as tall.
 *
 * 560px is the cut. A Pixel sideways is 412 tall; the smallest laptop is 600+.
 *
 * Either dimension being phone-sized is enough. The app does not lock the
 * phone's orientation: it follows however the phone is held, and the shell
 * stays on in both. A desktop browser narrowed below 560px gets the phone
 * shell too, which is the better layout there anyway.
 */
const SHORT = '(max-height: 560px), (max-width: 560px)';

function detect() {
  if (typeof window === 'undefined') return false;
  if (window.lyricistAPI) return false;
  if (!/^https?:$/.test(window.location.protocol)) return false;
  return window.matchMedia(SHORT).matches;
}

export function useMobile() {
  const [mobile, setMobile] = useState(detect);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.lyricistAPI) return;
    const mq = window.matchMedia(SHORT);
    const onChange = () => setMobile(detect());
    // Safari on old iOS only has addListener, and this must not throw there.
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
    };
  }, []);

  return mobile;
}
