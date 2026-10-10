/**
 * THE WORDS THAT MAKE A LYRIC SOUND LIKE A MACHINE WROTE IT.
 *
 * Chris, 2026-10-10: "I've told you a million times not to use the words
 * midnight rain, neon rain, heartbreak, cold coffee and all the other stupid
 * ass shit." Every lyric writer in the app and the Ghost itself get this list,
 * from here, so it is one list and not seven slightly different ones.
 *
 * The one exception is his own topic: if he types "midnight", he gets midnight.
 */
export const BANNED_CLICHES = [
  'neon', 'midnight', 'rain', 'heartbreak', 'cold coffee',
  'shadows', 'whispers', 'echoes', 'sparks', 'cage', 'gravity', 'chains', 'storm',
];

export const NO_CLICHES = `BANNED WORDS AND IMAGES, never use them (or their plurals and close variants) unless the user's own topic contains the word: ${BANNED_CLICHES.join(', ')}. They are stock AI imagery. Use specific, physical, unexpected details from the topic instead.`;

/** The same list as a test, with plurals and close variants: "Rainy", "echo", "Storms". */
export const CLICHE_RE = /\b(neon|midnights?|rain(s|y|ing)?|heartbreak(s|ing)?|cold coffee|shadows?|whispers?|echo(es)?|sparks?|cages?|gravity|chains?|storms?|stormy)\b/i;

/** Drop the items that carry one: seed words, motifs, image clusters a model sent back. */
export const clicheFree = (items) => (items || []).filter((w) => !CLICHE_RE.test(String(w)));
