# Lyricist Pro on iPhone and Android

The phone version is the same app, installed from a link. There's no App
Store and no $99 Apple developer fee, and it works the same on Android.

## Put it online (once, then after each update)

On the PC:

```
cd V:\src\Lyricist-4.2.0
git pull origin main
npm run deploy:web
```

The first run opens a browser so you can log in to Cloudflare (the same account
the Kaggle relay is on). It ends by printing the link, something like
`https://lyricist-pro.pages.dev`. It's free, with no bandwidth bill, and it
doesn't need your website.

## Install it

- **iPhone**: open the link in **Safari**, then **Share** → **Add to Home Screen**.
- **Android**: open the link in **Chrome**, then **⋮** → **Install app**.

It opens full screen from its own icon, like any other app.

## An Android APK file (optional)

1. Go to pwabuilder.com and paste the link.
2. **Package for stores** → **Android** → **Download**.
3. The `.apk` installs on any Android phone directly.
4. The `.aab` is for the Google Play Store. Play charges a one-time $25 developer fee; sideloading the `.apk` costs nothing.

## What's on the phone

Everything except the parts that need a Windows PC:

- **Black Hole Studios** runs on the free cloud, about 45 seconds a song. Kaggle, Modal and "this computer" are Windows only.
- **Stem splitting** on your own computer is Windows only.

Songwriter, Ghost Rider, Song Forge, The Matrix, Voice Lab, Collaboration,
RC-Funk 5000, Recording Booth, MIDI Studio (Audio → MIDI included), Mastering
Studio, Chopped & Screwed, Rhyme Helper, Thesaurus, Dictionary, AI Tools Hub
and Scratchpad all work on the phone.

## Built for iPhone

- The ring/silent switch no longer mutes the app.
- The first tap anywhere wakes the audio, so the first Play always makes sound.
- In the installed app, every Download button opens the share sheet: Save to Files, AirDrop, Messages.
- Recordings work in the iPhone's own format.
- The big MIDI soundfont is split so the free host takes it, then put back together on the phone.
- Holding the phone upright asks you to turn it sideways, with a "Use it anyway" button.

## Tap test on a real iPhone (5 minutes)

1. Add to Home Screen, open it from the icon. It should be full screen, no Safari bars.
2. Flip the silent switch on. Play a loop in RC-Funk 5000. You should hear it.
3. Recording Booth: record 5 seconds, play it back.
4. MIDI Studio: Record Memo, hum a few notes, then Play. You should hear a piano.
5. Recording Booth: Download a take as WAV. The share sheet opens. Save to Files.
6. Black Hole Studios: make a short song on the free cloud.

Send me anything that misses.
