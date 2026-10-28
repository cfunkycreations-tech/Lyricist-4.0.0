// The Ghost's promo lines (promoScripts.js), by id. Kept on their own, with no
// imports, so the clip scripts can read them without loading the app. Each is
// recorded once in the Voice Lab and cut to src/assets/ghost-vo-phone/promo-<id>.mp3:
//   python scripts/cut-ghost-recording.py <recording.wav> promo --write
// Never use the words in src/services/cliches.js, and never call the app free.
//
// 2026-10-27: Chris re-recorded every line from the edgier v2 script (Gen Z and
// millennial), in his new Voice Lab voice ("newest Voice Lab 2026-10-27-23-06").
// These are the words he actually said, ad-libs included.

export const PROMO_LINES = {
  'open-rider': "Okay, watch this. One artist name, and I ghostwrite a whole song. Literally. I'm a ghost. Hence... never mind. You get the gist.",
  'rider-artist': "Step one: an artist. Whoever's all over your For You page right now.",
  'rider-analyze': "Hmm. Hit Analyze. Ghost Rider stalks their whole catalog. The rhymes, the flow, the words they can't stop saying. Respectfully.",
  'rider-wait': "Wait, hold on. It's speedrunning their entire career. Give it a sec.",
  'rider-report': 'Receipts. How they ride the beat, what they write about, how hard they rhyme. They ate. And now, so do we.',
  'rider-topic': 'Now we need something to write about. Make it messy.',
  'rider-write': 'Write Lyrics. A brand new song in their style. Their vibe, our words. Zero copy-paste.',
  'rider-write-wait': "Not me pretending I'm not nervous right now. Totally fine. This is fine.",
  'rider-lyrics': "And it's giving... a whole song. Verses, hook, the works. Understood the assignment.",
  'rider-dna': 'This is the Style DNA. Basically their fingerprint. How they ride the beat, and the stuff they keep coming back to, like an ex.',
  'rider-dna-send': 'Yeet. Straight to The Matrix.',
  'rider-words': 'Plus twenty words, ripped straight out of the song.',
  'rider-words-send': 'Those go to The Matrix too. Follow me, it gets unhinged.',
  'rider-send-sw': 'Send to Songwriter. The song and its tags travel together. Ride or die.',
  'open-matrix': 'Got random words living in your head? Dump them in The Matrix and watch it cook.',
  'matrix-type': 'Try a few. Literally anything works. Even your group chat.',
  'matrix-load': 'Into the grid they go.',
  'matrix-arrived': "And they're already on the grid. All twenty. I didn't type a thing. Lazy? No. Efficient.",
  'matrix-autocraft': 'Auto-Craft. It heats the grid, locks it in, and writes two whole songs out of twenty words. Main character energy.',
  'matrix-wait': 'Two songs at once? I can barely finish one text.',
  'matrix-wait-2': 'Every rhyme gets checked by how it actually sounds. Every line gets counted. Anything off-beat gets fixed. No vibes-only rhymes in here.',
  'matrix-songs': "Song A and Song B. Scored for flow, rhyme and hook. Rhymes color-coded, because we're not animals.",
  // The Matrix walkthrough's new features (Chris, 2026-10-25: "It doesn't even
  // mention the new features like explicit versus clean").
  'matrix-pair': 'Okay, the fun part. Song A versus Song B. Rap versus Sung, Story versus Party, or Clean versus Explicit. Same words, two completely different songs. Choose your fighter.',
  'matrix-remix': "Don't love one? Remix it in one tap. Harder, Funnier, Sadder, or a Bigger Hook. Hate it? Undo. Nobody has to know.",
  'matrix-win': "Hmm. I'm picking A. Sorry B, it's not you, it's me.",
  'matrix-send': 'Sending it to Songwriter. Say less.',
  'sw-arrived': "It lands in Songwriter, already split into verses and choruses. Every single line's editable. Your song, your rules.",
  'sw-send': 'Now the part you actually came for. Send to Black Hole Studios.',
  'bh-arrived': "Song's in. Genre, mood and voice came with it. Zero retyping. We love to see it.",
  'bh-trim': 'Quick listen. Thirty seconds, one verse and the hook. Because attention spans are cooked.',
  'bh-make': "Make the song. Let's cook.",
  'bh-wait': 'Real vocals, a whole band, cooking right now. This part takes a minute. Touch grass. Whatever.',
  'bh-wait-2': "Still cooking. Don't scroll away, I can see you. I'm a ghost.",
  'bh-play': 'Here it is. Volume up.',
  'outro-rider': "One artist name to a finished song. That's Lyricist Pro. Go make something that slaps.",
  'outro-matrix': "A handful of random words to a finished song. That's Lyricist Pro. Your move.",
};

/** Every promo line, for the Voice Lab script, the cutter and the clip check. */
export function promoLines() {
  return Object.entries(PROMO_LINES).map(([id, text]) => ({ id: `promo-${id}`, tabId: 'promo', text }));
}
