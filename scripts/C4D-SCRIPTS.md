# Cinema 4D scripts — Black Hole Studios

Run: Extensions -> Script Manager -> File -> Load Script -> Execute. Console: Shift+F10. Render: Shift+R.

**Standard renderer and Standard materials only.** Every script sets
`RDATA_RENDERENGINE_STANDARD` itself, because Cinema 4D starts in the other
renderer and would ignore these materials.

| Script | What it makes | Where |
|---|---|---|
| `blackhole_c4d.py` | The black hole rig | main |
| `splash_c4d.py` | Opening splash, chrome title | main |
| `molten_c4d.py` | Molten metal pool, Python Generator waves, metaballs, fog | `claude/molten-c4d` (#78) |
| `orbit_c4d.py` | Tab names orbiting the hole, camera on a pivot | `claude/orbit-hole-c4d` (#79) |
| `lyrics_hole_c4d.py` | Lyrics spiralling into the hole | `claude/orbit-hole-c4d` (#79) |
| `metaballs_c4d.py` | Liquid metaballs: 12 chrome droplets fuse and pour apart, looping | `claude/metaballs-c4d` (#82) |

Each scene script has a companion `*_textures.py` that writes the images it
reads, and each replaces its own top-level group on a re-run, so running one
twice is safe.

## Three things that cost a day in 2026.3.2

**A texture is cached by its file path for the whole session.** Regenerate an
image with a `*_textures.py` and run the scene script again and the render
comes back with the *old* picture, even in a brand new document. `MSG_UPDATE`,
clearing and restoring `BITMAPSHADER_FILENAME`, `MSG_FLUSHDOCUMENTCACHES` and
`FlushUnusedTextures()` all fail to shift it. The scripts work round it with
`fresh_copy()`, which hands the shader a copy named after the source's
timestamp and size, so a changed image always arrives on a path C4D has never
read.

**Aim cameras with a Target tag** (`Ttargetexpression`) on a Look At null, never
by setting pitch by hand. A sign error in `atan2` tilts the camera up instead of
down and puts the whole subject off the bottom of the frame.

**Parameter names move between versions.** 2026 has `MG_RADIAL_AXIS`, taking
`MG_RADIAL_AXIS_XZ`; there is no `MG_RADIAL_PLANE`. This is what the safe
setters are for: `put()` / `put_either()` try each known name, then the
parameter's label, then record a skip instead of stopping the script. The
closing popup reports the count and the Console lists them.

Never call `KillDocument()` on the active document and then force a redraw. It
crashes Cinema 4D in `drawport_directx`.

Still to build: every other Cinema 4D feature Chris wants used (more simulation
scenes). Add new ones here.
