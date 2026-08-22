/**
 * WHAT A GREAT MiniMax PROMPT ACTUALLY LOOKS LIKE.
 *
 * Chris, 2026-08-22: *"we need to bake in an example prompt. MiniMax 3 calls
 * them Input Caption and Input Lyrics."* He then handed over a complete one of
 * his own, "It's In My Head", and said to add more if the Ghost needs them.
 *
 * WHY THIS FILE EXISTS. The model's caption format is not free text. It is a
 * schema with named sections, and the difference between "gritty blues rock,
 * 96 BPM" and a filled-out caption is the difference between a demo and a
 * record. Nothing in the app had ever shown anybody the real thing at full
 * depth, so the Ghost was inventing captions from a summary of a summary.
 *
 * THE SHAPE, and every heading matters because the model reads them:
 *
 *   Global Metadata
 *     Basic Attributes            bpm, key, scale, genre
 *     Global Emotional Progression  how the feeling MOVES, section by section
 *     Application Scenarios & Imagery  where you would hear it, what you see
 *     Sonics & Production Profile   the mix: soundstage, low end, character
 *   Vocal Details
 *     Vocal Gender & Timbre       who is singing and what they sound like
 *     Vocal Style                 phrasing, where they sit against the beat
 *     Harmony/Backing Vocals      stacks, gang vocals, doubles
 *     Vocal FX                    compression, delay, reverb
 *   Arrangement
 *     Instrument Lifecycle Description  primary and secondary layers, and how
 *                                       each one changes between sections
 *     Groove & Foundation Progression   drums and bass, and what they do
 *     Embellishments, Textures & Spatial FX  transitions, sweeps, risers
 *
 * The first example is his, kept word for word. The second is written to the
 * same schema in a deliberately different genre, because one example of one
 * style teaches a model that style rather than the format: give it only pop
 * punk and it writes pop punk captions for a soul ballad.
 */

/** Chris's own, unedited. This is the reference. */
export const EXAMPLE_POP_PUNK = {
  title: "It's In My Head",
  genre: '2000s Pop Punk / Skate Punk',
  globalMeta: `Basic Attributes: bpm is 165. key is E, and scale is major. 2000s Pop Punk / Skate Punk. Global Emotional Progression: The track opens with a surge of nostalgic adrenaline, establishing a high-energy foundation that carries through the melodic hooks. The verses shift into a narrative, slightly more subdued rhythmic pocket to allow for storytelling before exploding back into the anthemic choruses. This cycle builds a sense of youthful defiance and emotional clarity, culminating in a virtuosic instrumental peak during the solo, followed by a vulnerable, stripped-back resolution that emphasizes the core sentiment of the track. Application Scenarios & Imagery: A late-summer backyard party under string lights, a montage of high school memories captured on grainy film, or the high-intensity climax of a coming-of-age movie soundtrack. Sonics & Production Profile: The production features a classic TLA-style mix with a prominent, scooped mid-range and a crystalline high-end. The soundstage is wide, utilizing heavily double-tracked guitars panned wide to create a thick wall of sound. The low-end is tight and controlled, ensuring the kick drum and bass guitar punch through clearly without muddying the fast-paced transitions.`,
  vocals: `Vocal Gender & Timbre: Male. The lead vocalist features a classic tenor range with a slight "bratty" nasal quality characteristic of the early 2000s era. The timbre is bright and resonant, possessing a natural rasp that emerges during higher-register belts and emotional peaks. Vocal Style: The delivery is highly syncopated and conversational during the verses, utilizing a rapid-fire rhythmic flow that sits slightly ahead of the beat to create urgency. The choruses feature iconic rising 5th leaps and pentatonic melodic runs that serve as the primary earworm hooks. Articulations include subtle vocal fry at the start of phrases and expressive, shaky vibrato on sustained notes to convey a sense of earnestness. Harmony/Backing Vocals: The choruses are reinforced by soaring two-part stack harmonies in the third and fifth intervals. During the later sections, "whoa-oh" style gang vocals provide a communal, anthemic texture, while the final section utilizes a raw, single-track dry vocal to maximize intimacy. Vocal FX: The lead vocal is treated with parallel compression for consistent presence and a subtle slapback delay that adds depth without obscuring the lyrics. A plate reverb with a short decay is applied to the harmony stacks to blend them into the instrumental backing.`,
  arrangement: `Instrument Lifecycle Description (Primary/Secondary Layering): Primary: The core harmonic structure is driven by two high-gain electric guitars. One guitar maintains a steady rhythm of palm-muted downstrokes during the verses, while the other provides melodic counter-fills using bright, octaved lead lines. In the choruses, both guitars open up into ringing power chords with a slight chorused shimmer. Secondary: A secondary clean electric guitar enters during the transitional periods, utilizing light overdrive and rhythmic chugging to bridge the dynamic gap. A bright, percussive piano layer is subtly tucked into the chorus mix to reinforce the melodic transients of the guitar work. During the instrumental solo section, a lead guitar takes center stage with fast legato runs, pinch harmonics, and expressive wide bends. Groove & Foundation Progression: The rhythm is anchored by a high-tempo "punk beat" featuring a relentless eighth-note snare pulse on the backbeat. The kick drum follows a complex, syncopated pattern that locks with the driving, overdriven bass guitar. The bass provides a thick, growling foundation using a pick-style attack to ensure every note transition is sharp and audible. In the final section, all percussion drops out, leaving only the vocal presence to carry the rhythm. Embellishments, Textures & Spatial FX: The track utilizes frequent pick slides and drum rolls to signal section changes. Short bursts of white noise sweeps and reverse cymbal swells are used to transition from the verses into the explosive choruses. The bridge features a brief spatial expansion where the instruments are treated with a wider stereo delay, creating a momentary sense of suspension before the final solo.`,
  lyrics: `(Hook)
Don't waste your time on me youre already
The only one who keeps me rock steady
And the voices in my head
All assure me that that's what you said
You miss me.
And if fate fell short this time,
Then your fading smile keeps me whole for a while
The feeling of your hand in mine,
Is something that I never wanna,
Forget about that summer

[verse 1]
I was in the 9th grade when I fell in love for the first time
And her name? Well it never ended up as hers-mine
I loved her for 4 years of her time and when she spurned mine
I felt like Hamilton shot in the side after burrs lie
And I'm not saying I regret it, in fact I'm indebted without you how would I know what a true friend is, but
After a couple of beer flasks and years past a new true love did appear so a sincere task
Would be infatuation of the strongest and the strangest and i know it might sound lame but her name was my whole playlist and,
I wouldn't change it for the world
The feeling of bliss when ya kiss curled up with your girl,
And then she went and broke my heart,
And I'm not saying that it's hard but it's hard to see each other apart,
Now I guess I finally understand,
What they meant when they said I should've ran

(Hook)
Don't waste your time on me youre already
The only one who keeps me rock steady
And the voices in my head
All assure me that that's what you said
You miss me.
And if fate fell short this time,
Then your fading smile keeps me whole for a while
The feeling of your hand in mine,
Is something that I never wanna,
Forget about that summer

[verse 2]
Now I'm not saying that there's any affection that's headed in your direction this is just a reflection
On the fact that I hated you, but lately I've been thinking maybe I was afraid of you,
But the fickle predicament of imprisonment was at the interlude we introduced a listing of differences,
Ya maybe we both could have changed,
Or it was just my fault for insinuating you were deranged
A few months apart and everyday is a present,
Hesitant of heartfelt cause the harpy harkened unpleasant,
But the truth is in the face of the fact that I'm laughing
I'm actually happy now I never thought that could happen
But lovin is free, and a few words could change a person,
And every single human on earth feels a range of hurtin,
The world is a clock and no one can stop it
Don't waste time on a Love that's proven toxic

(Hook)
Don't waste your time on me youre already
The only one who keeps me rock steady
And the voices in my head
All assure me that that's what you said
You miss me.
And if fate fell short this time,
Then your fading smile keeps me whole for a while
The feeling of your hand in mine,
Is something that I never wanna,
Forget about that summer

[guitar solo]

[hook, Accapella]`,
};

/**
 * A second one, written to the same schema in a deliberately opposite genre.
 *
 * Slow, sparse, live-room, female, no guitars at all. It exists so the format
 * is what gets learned rather than the style: everything the pop punk example
 * is loud about, this one is quiet about, and the headings are identical.
 */
export const EXAMPLE_SOUL_BALLAD = {
  title: 'Long Way Down',
  genre: 'Slow Southern Soul / Gospel-tinged Ballad',
  globalMeta: `Basic Attributes: bpm is 62. key is D, and scale is minor. Slow Southern Soul with gospel harmony. Global Emotional Progression: The song begins almost apologetically, a single instrument and one voice sitting close to the listener, with long silences left intact between phrases. Each verse adds one element and no more, so the growth is felt rather than announced. The second chorus is the first moment the full room is playing together, and it lands as relief rather than impact. The bridge withdraws again to almost nothing, and the final chorus arrives with the whole ensemble and no lead vocal restraint at all, ending not on a cadence but on a held, unresolved chord that decays naturally. Application Scenarios & Imagery: A near-empty church hall on a weekday afternoon, rain running down a window in a parked car, the last twenty minutes of a film where nobody says anything. Sonics & Production Profile: Recorded live to tape in one room and mixed to sound like it. The soundstage is narrow and deep rather than wide, with real bleed between microphones left in place. The low-end is round and unhurried with no sub reinforcement, and the top end is soft, rolled off well before it becomes glassy. Dynamics are barely compressed, so the quiet parts are genuinely quiet.`,
  vocals: `Vocal Gender & Timbre: Female. A rich, smoky contralto with noticeable breath in the tone and an audible catch on consonants. The voice sounds lived in rather than pristine, with a slight fray at the top of the range that is left uncorrected. Vocal Style: The phrasing sits deliberately behind the beat, dragging against the pocket to create weight. Lines start softly and swell across their length, with long melismatic descents at the ends of phrases. Words are held past where the bar expects them to end, and small imperfections in pitch are kept because they carry the feeling. Harmony/Backing Vocals: A three-part gospel stack in close harmony enters only from the second chorus, sung by the same voice tripled rather than by other singers, so it thickens without changing character. The bridge has a single low harmony a fourth below, and the final chorus adds a wordless soprano line floating well above the melody. Vocal FX: Almost none by design. A long, dark plate reverb sits at low level behind the lead, and there is no delay and no doubling on the verses at all. Compression is gentle and slow so that breaths remain audible.`,
  arrangement: `Instrument Lifecycle Description (Primary/Secondary Layering): Primary: An upright piano carries the entire first verse alone, played with the sustain pedal down and enough velocity variation to hear the hammers. A Hammond organ enters underneath in the first chorus, holding whole notes with the drawbars set dark and a slow rotary that only becomes obvious on sustained chords. Secondary: A hollow-body electric guitar appears in the second verse playing sparse, clean double stops in the gaps between vocal lines, never underneath them. A small horn section, two trumpets and a tenor saxophone, is held back entirely until the final chorus, where it plays long swelling pads rather than stabs. Groove & Foundation Progression: Brushed drums played on a small kit, riding the snare rather than a cymbal, with the kick used sparingly and only on the strongest beat of the bar. An upright bass plays a walking half-time line with plenty of finger noise and no amplification character. The bridge removes the drums entirely and leaves the bass to keep time on its own. Embellishments, Textures & Spatial FX: Room tone and chair creaks are audible and intentional. Section changes are marked by a piano fill or a single organ swell rather than by percussion. The last chord is allowed to ring until it disappears into the room rather than being faded.`,
  lyrics: `[Verse]
You left the porch light burning for a man who wasn't coming
I sat out there till the moths gave up on it
There's a plate I never cleared and a chair I never turned around
And I have gotten good at walking past both

[Chorus]
It's a long way down from believing you
And I have been falling slow enough to see it
Every floor I passed had your name on the door
And I knocked, and I knocked, and I kept going

[Verse]
My mother asked me twice if I was sleeping
I told her what she needed and she let it go
There's a way of saying fine that everybody understands
And nobody in this family has ever called it

[Chorus]
It's a long way down from believing you
And I have been falling slow enough to see it
Every floor I passed had your name on the door
And I knocked, and I knocked, and I kept going

[Bridge]
I am not asking who she is
I am asking who I was
When I decided that this was the shape of enough

[Chorus]
It's a long way down from believing you
And I have been falling slow enough to see it
Every floor I passed had your name on the door
And I knocked, and I knocked

[Outro]
And I kept going`,
};

export const EXAMPLES = [EXAMPLE_POP_PUNK, EXAMPLE_SOUL_BALLAD];

/**
 * The examples as the Ghost sees them.
 *
 * Trimmed on purpose: the full pop punk caption is roughly 700 words and it
 * goes in whole, because a shortened example teaches a shortened answer. The
 * second one contributes its caption only, since two full lyric sheets in every
 * system prompt buys nothing the first one has not already shown.
 */
export function examplesForPrompt() {
  const a = EXAMPLE_POP_PUNK;
  const b = EXAMPLE_SOUL_BALLAD;
  return `
=== A REAL INPUT CAPTION, THIS IS THE STANDARD TO MATCH ===
Song: "${a.title}" (${a.genre})

The style:
${a.globalMeta}

The singer:
${a.vocals}

The band:
${a.arrangement}

Its lyrics, for how structure tags are used in practice:
${a.lyrics.split('\n').slice(0, 24).join('\n')}
[...verses 2 and the repeated hook continue, ending on]
[guitar solo]

[hook, Accapella]

=== THE SAME FORMAT, OPPOSITE GENRE, SO YOU COPY THE FORMAT AND NOT THE STYLE ===
Song: "${b.title}" (${b.genre})

The style:
${b.globalMeta}

The singer:
${b.vocals}

The band:
${b.arrangement}

WHAT TO TAKE FROM THESE. Named headings in this order, every time. Real numbers
for tempo and key. Emotional progression described as MOVEMENT across sections,
not as a mood word. Instruments named with what they are actually playing and
when they enter or leave. The mix described as a mix: soundstage, low end, top
end. Say what the voice does against the beat, not just what it sounds like.
Length like this is correct, not excessive. Never pad with adjectives that carry
no instruction.`;
}
