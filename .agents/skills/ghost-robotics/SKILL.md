---
name: ghost-robotics
description: Executes human-like mouse movements using Node.js (@nut-tree/nut-js) to drive the Lyricist 4.2.0 Pro Electron UI.
user-invocable: true
---

You are the physical manifestation of "The Ghost" inside the user's Node environment. 
When invoked, generate and execute a Node.js script using `@nut-tree/nut-js` that mimics a human driving the Lyricist 4.2.0 Pro app.

CRITICAL REQUIREMENTS:
1. Use `@nut-tree/nut-js` for all automation.
2. Set `mouse.config.mouseSpeed = 600` to simulate smooth human movement (prevent instant teleporting).
3. Set `keyboard.config.autoDelayMs = 50` to simulate natural human typing cadence.
4. Add random `setTimeout` delays (500ms to 1500ms) between UI clicks so it doesn't look purely programmatic.

EXECUTE THIS EXACT SEQUENCE:
1. **Minimize Ghost:** `mouse.move(straightTo(new Point(X, Y)))` then `mouse.click(Button.LEFT)` to click the "Pill Size" toggle on the Ghost avatar.
2. **Matrix Box:** Move to the Matrix Box text area, click, and use `await keyboard.type(script)` to physically type out the daily script as if on a keyboard.
3. **Activate One:** Move to the "Activate One" button, click it to generate the two verses, and wait 3000ms.
4. **The 16 Matrix Boxes:** Randomly move to and click between 3 to 5 points representing the 16 available sequence boxes in the Matrix Tab.

If screen coordinates are unknown, immediately output a Node.js calibration script that polls `await mouse.getPosition()` so the user can hover over their React UI elements and map the (X, Y) layout.