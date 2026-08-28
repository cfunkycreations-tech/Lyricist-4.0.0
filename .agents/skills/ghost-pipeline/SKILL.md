---
name: ghost-pipeline
description: Master Node.js workflow: Brain generation, TTS sync, OBS triggering, and robotic UI automation.
user-invocable: true
---

Execute the complete Ghost content pipeline in this exact order, utilizing Node.js entirely:

1. **Brain:** Invoke `ghost-brain` to retrieve the daily script and tags for Lyricist 4.2.0 Pro.
2. **Audio Sync:** Pipe the script to the local TTS API in Node and save as `ghost_audio.wav`. Calculate its exact duration.
3. **OBS Setup:** Generate a Node script using `obs-websocket-js` (v5) to connect to `ws://localhost:4455` and execute:
   - `await obs.call('SetCurrentProgramScene', { sceneName: 'Ghost_Avatar' });`
   - `await obs.call('StartRecord');`
4. **Drive the App:** Immediately invoke `ghost-robotics` via Node, passing the generated script so the mouse physically starts clicking and typing into the Electron app.
5. **Playback Sync:** Call `await obs.call('TriggerMediaInputAction', { inputName: 'Ghost_Audio_Source', mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' });` so the voiceover plays *while* the Ghost is typing on screen.
6. **Cut:** Wait for the audio duration and the robotics script to both finish, then call `await obs.call('StopRecord');`.
7. **Export:** Save the generated video file path and tags to the local Node backend/database.