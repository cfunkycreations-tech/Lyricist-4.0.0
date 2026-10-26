// The Ghost's promo lines (promoScripts.js), by id. Kept on their own, with no
// imports, so the clip scripts can read them without loading the app. Each is
// recorded once in the Voice Lab and cut to src/assets/ghost-vo-phone/promo-<id>.mp3:
//   python scripts/cut-ghost-recording.py <recording.wav> promo --write
// Never use the words in src/services/cliches.js, and never call the app free.

export const PROMO_LINES = {
  'open-rider': "Watch this. One artist name, and I'll take it all the way to a finished song. No tricks.",
  'rider-artist': "First, an artist. Somebody everybody's playing right now.",
  'rider-analyze': 'Analyze. Ghost Rider studies how they write. The rhymes, the rhythm, the words they lean on.',
  'rider-wait': "Give it a second. It's reading a whole career.",
  'rider-report': 'There it is. How they ride the beat, what they write about, and how hard they rhyme.',
  'rider-topic': 'Now, something to write about.',
  'rider-write': 'Write Lyrics. A brand new song in their style. New words. Never theirs.',
  'rider-write-wait': "This is the part where I pretend I'm not nervous.",
  'rider-lyrics': 'And there it is. A whole song. Verses, a hook, the works.',
  'rider-dna': 'This is the Style DNA. Their fingerprint. How they ride the beat, and the pictures they keep coming back to.',
  'rider-dna-send': 'That goes to The Matrix.',
  'rider-words': 'And twenty words, pulled straight out of the song.',
  'rider-words-send': "Those go to The Matrix too. Let's follow them.",
  'rider-send-sw': 'Send to Songwriter. The song and its tags travel together.',
  'open-matrix': 'Got a few words rattling around in your head? Give them to The Matrix and watch.',
  'matrix-type': "I'll type a few. Anything you've got works.",
  'matrix-load': 'Load them into the grid.',
  'matrix-arrived': "There they are. All twenty, already on the grid. I didn't type a thing.",
  'matrix-autocraft': 'Auto-Craft. It heats the grid, locks it, and writes two whole songs from those words.',
  'matrix-wait': 'Two songs at once. I can barely write one.',
  'matrix-wait-2': "Every rhyme gets checked by sound, every line gets counted, and anything that doesn't fit gets fixed.",
  'matrix-songs': 'Song A and Song B. Scored for flow, rhyme and hook, with the rhymes color-coded.',
  'matrix-win': "I'm picking A. Don't tell B.",
  'matrix-send': 'Off to Songwriter.',
  'sw-arrived': "It lands in Songwriter, split into verses and choruses. Every line's editable.",
  'sw-send': "Now let's hear it. Send to Black Hole Studios.",
  'bh-arrived': 'The song is in. Genre, mood and voice came with it. Nothing to retype.',
  'bh-trim': "For a quick listen, I'll cut it down to thirty seconds. A verse and the hook.",
  'bh-make': 'Make the song.',
  'bh-wait': 'A real singer and a whole band, coming right up. This part takes a minute.',
  'bh-wait-2': 'Still cooking. Good music takes a minute. Okay, a couple of minutes.',
  'bh-play': 'Here it is.',
  'outro-rider': "One artist name to a finished song. That's Lyricist Pro.",
  'outro-matrix': "A handful of words to a finished song. That's Lyricist Pro.",
};

/** Every promo line, for the Voice Lab script, the cutter and the clip check. */
export function promoLines() {
  return Object.entries(PROMO_LINES).map(([id, text]) => ({ id: `promo-${id}`, tabId: 'promo', text }));
}
