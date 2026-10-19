"""
BLACK HOLE STUDIOS — your lyrics spiral into a black hole, built by script, in Cinema 4D.

Every line of LYRICS rides its own spiral arm toward the hole. The words enter
at the rim one after another, nose to tail, speed up as they fall, stretch long
and thin, and are swallowed at the horizon. The black hole is a black sphere, an accretion
disc of glowing rings with hot spots that race round it, and glowing rings that
always face the lens.

WHAT YOU NEED: this script. No images, no extra files.

RUN
  1. File -> New (start from an empty scene).
  2. Extensions -> Script Manager -> File -> Load Script -> this file -> Execute.
  3. Save the .c4d.
  4. Shift+R (Render to Picture Viewer). Frames go to lyrics/ next to the .c4d.

YOUR LYRICS  Edit LYRICS below: one line per entry, about 25 characters or
fewer. The Console (Extensions -> Console, Shift+F10) says if a line is too
long for the shot, and how much of the frame the scene fills.

SHOTS  (MODE below)
  "hero"    1920x1080, the wide shot.
  "phone"   1080x1920, held upright, the arms rise and fall as a funnel.
  "header"  720x720, transparent background, for the tab header.
All three loop: the last frame leads straight back into the first.

IF IT CRASHES PART WAY: set START_FRAME below to the first missing frame, run
the script again, and Shift+R. Finished frames are kept.

HOW IT'S BUILT
  hole      plain shapes, lit from inside: a black sphere, flat rings from
            white-hot to deep orange, and camera-facing rings round the rim.
  words    one null per word, holding the extruded text. The null does all
            the moving: it follows the spiral, turns to point along it, and
            stretches along it. Every word is keyed over the whole loop.
  loop      each word's trip takes exactly one loop. It shrinks to a speck
            while it is swallowed, jumps back to the rim while it is a speck,
            and grows again. Nothing pops.
  look      the words are lit from inside: one flat colour, no image, no
            lights, nothing that can render differently from version to version.
It renders with the Standard engine and Standard materials only (the engine is
set here).

Anything this version of Cinema 4D refuses is skipped and listed in the
Console instead of stopping the script.
"""

import math

import c4d
from c4d import bitmaps, gui, utils

# ── CONFIG ─────────────────────────────────────────────────────────────────

# One line per entry. Each line gets its own spiral arm.
LYRICS = [
    "Pull me under",
    "Nothing here lets go",
    "Every word bends to you",
    "Time slows at the edge",
]

GROUP_NAME = "LYRICS_HOLE_RIG"       # re-running the script replaces this group
OUTPUT_PATH = "lyrics/lyrics_"       # relative to the saved .c4d

MODE = "hero"                        # "hero", "phone" or "header"

FPS = 30
FRAMES = 300                         # 10 s loop; the disc turns once per loop
START_FRAME = 0                      # raise this to resume after a crash
STEP = 4                             # frames between keys; FRAMES must divide by it

# The hole. The disc is DISC_RINGS flat rings from DISC_INNER to DISC_OUTER,
# each with hot spots that orbit it (inner rings faster, whole turns per loop
# so the loop closes). The rim rings always face the camera.
HORIZON_RADIUS = 100.0
DISC_INNER = 130.0
DISC_OUTER = 460.0
DISC_RINGS = 8
DISC_FLAT = 0.07                     # ring thickness as a share of its width
DISC_HOT = c4d.Vector(1.0, 0.95, 0.82)       # white-hot at the inner edge
DISC_WARM = c4d.Vector(1.0, 0.52, 0.12)
DISC_DEEP = c4d.Vector(0.42, 0.10, 0.03)     # dim at the outer edge
SPOT = c4d.Vector(1.0, 0.98, 0.92)
# Camera-facing rim: (radius as a multiple of the horizon, pipe radius, colour)
RIM = [
    (1.07, 4.5, c4d.Vector(1.0, 0.96, 0.86)),
    (1.30, 9.0, c4d.Vector(1.0, 0.62, 0.20)),
    (1.65, 14.0, c4d.Vector(0.55, 0.16, 0.05)),
]
HALO_OUTER = HORIZON_RADIUS * RIM[-1][0] + RIM[-1][1]

# res; r_out the radius where words enter; text_h their letter height; spread
# how far above and below the disc the arms start (they all end on it); dist,
# view (degrees above the disc) and focal the camera; sway and push how far it
# drifts (degrees, units) over a loop.
SHOTS = {
    "hero":   dict(res=(1920, 1080), r_out=560.0, text_h=100.0, spread=120.0,
                   dist=2100.0, view=26.0, focal=34.0, sway=8.0, push=50.0),
    "phone":  dict(res=(1080, 1920), r_out=480.0, text_h=100.0, spread=600.0,
                   dist=1900.0, view=26.0, focal=40.0, sway=6.0, push=50.0),
    "header": dict(res=(720, 720), r_out=330.0, text_h=42.0, spread=130.0,
                   dist=1650.0, view=24.0, focal=50.0, sway=0.0, push=0.0),
}

# The fall. Progress p runs 0 (entering) to 1 (swallowed); radius and angle
# are worked out from it so every word takes the same path.
TURNS = 1.5                          # turns round the hole between rim and horizon
SWIRL = 2.2                          # how much faster it turns near the hole
FALL = 1.35                          # above 1: slow at the rim, fast at the hole
END_RADIUS = 0.5                     # where a word ends, as a share of the horizon
STRETCH = 1.0                        # extra length at the horizon, as a multiple
U_END = 0.9                          # share of the loop spent falling; the rest hidden
FADE_IN = (0.015, 0.06)              # share of the loop over which a word grows in
FADE_OUT = (0.6, 0.9)                # share of the fall over which a word is swallowed
FACE = (0.1, 0.5)                    # a word shows once its front turns this far toward the lens
                                     # (cosine of its heading); on the far side it reads backwards, so it hides
HIDDEN = 0.001                       # scale of a word that is out of sight
GOLDEN = 0.6180339887

CHAR_W = 0.62                        # word width per letter, as a share of its height
WORD_GAP = 0.45                      # space between words, as a share of letter height
DEPTH = 0.2                          # extrusion, as a share of letter height
REACH = 1.1                          # room kept round a word for font width and depth
LONG_LINE = 0.8                      # a line's train may take this much of the loop

FOCAL_FILM = 36.0                    # film width in mm, Cinema 4D's default

# Bold fonts to try, in order. Bahnschrift ships with Windows 10 and 11.
FONTS = ["Bahnschrift Bold", "Bahnschrift SemiBold", "Bahnschrift",
         "Arial Black", "Arial Bold", "Arial"]

LINE_GLOW = c4d.Vector(0.86, 0.92, 1.0)
ACCENT_GLOW = c4d.Vector(1.0, 0.78, 0.46)
ACCENT_EVERY = 3                     # every third line takes the warm colour


# ── SAFE SETTERS ───────────────────────────────────────────────────────────
# Parameter names change between Cinema 4D versions. put() tries each known
# name, then the parameter's label in the Attribute Manager, and if nothing
# fits it notes it and keeps going rather than leaving a half-built scene.

SKIPPED = []
NOTES = []                           # heads-ups for the Console, not refused settings


def deg(d):
    return utils.DegToRad(d)


def const(*names):
    """The first of these c4d constants this build has, or None."""
    for name in names:
        value = getattr(c4d, name, None)
        if value is not None:
            return value
    return None


def _who(node):
    name = node.GetName()
    if not name and hasattr(node, "GetTypeName"):
        name = node.GetTypeName()
    return name or "?"


def _find_by_label(node, label):
    try:
        for bc, param_id, _group in node.GetDescription(c4d.DESCFLAGS_DESC_0):
            if bc[c4d.DESC_NAME] == label:
                return param_id
    except Exception:
        pass
    return None


def _try(node, names, value):
    for name in names:
        param = getattr(c4d, name, None)
        if param is None:
            continue
        try:
            node[param] = value
            return True
        except Exception:
            continue
    return False


def put(node, names, value, label=None):
    """Set one parameter by any of its known names, or its UI label."""
    if isinstance(names, str):
        names = (names,)
    what = names[0] if names else label
    if value is None:
        SKIPPED.append("{}: {} (not in this version)".format(_who(node), what))
        return False
    if _try(node, names, value):
        return True
    if label:
        param = _find_by_label(node, label)
        if param is not None:
            try:
                node[param] = value
                return True
            except Exception:
                pass
    SKIPPED.append("{}: {}".format(_who(node), what))
    return False


def put_either(node, options, what):
    """Versions that name a setting differently AND take a different value."""
    for names, value in options:
        if value is not None and _try(node, (names,) if isinstance(names, str) else names, value):
            return True
    SKIPPED.append("{}: {}".format(_who(node), what))
    return False


# ── ANIMATION ──────────────────────────────────────────────────────────────

def vec_id(param, axis):
    sub = {"x": c4d.VECTOR_X, "y": c4d.VECTOR_Y, "z": c4d.VECTOR_Z}[axis]
    return c4d.DescID(c4d.DescLevel(param, c4d.DTYPE_VECTOR, 0),
                      c4d.DescLevel(sub, c4d.DTYPE_REAL, 0))


def pos_id(axis):
    return vec_id(c4d.ID_BASEOBJECT_REL_POSITION, axis)


def rot_id(axis):
    """h = heading (turns about Y), p = pitch (about X), b = bank (about Z)."""
    return vec_id(c4d.ID_BASEOBJECT_REL_ROTATION, {"h": "x", "p": "y", "b": "z"}[axis])


def scale_id(axis):
    return vec_id(c4d.ID_BASEOBJECT_REL_SCALE, axis)


def set_keys(obj, desc_id, pairs):
    """Linear keys. Curves are baked as many small linear steps, which plays
    the same in every version and never overshoots by surprise."""
    track = obj.FindCTrack(desc_id)
    if track is None:
        track = c4d.CTrack(obj, desc_id)
        obj.InsertTrackSorted(track)
    curve = track.GetCurve()
    for frame, value in sorted(dict(pairs).items()):
        added = curve.AddKey(c4d.BaseTime(frame, FPS))
        if added is None:
            continue
        key = added["key"]
        key.SetValue(curve, value)
        key.SetInterpolation(curve, c4d.CINTERPOLATION_LINEAR)


def cycle(mid, amp, cycles, phase=0.0, step=STEP):
    """(frame, value) pairs for a sine with a whole number of cycles per loop,
    so the key at FRAMES equals the key at 0 and the loop has no seam."""
    out = []
    for frame in range(0, FRAMES + 1, step):
        angle = 2.0 * math.pi * cycles * frame / float(FRAMES) + phase
        out.append((frame, mid + amp * math.sin(angle)))
    return out


def passes(doc):
    """Build the scene's caches without playing the animation."""
    try:
        doc.ExecutePasses(None, False, False, True, c4d.BUILDFLAGS_NONE)
    except Exception:
        try:
            doc.ExecutePasses(None, False, False, True, 0)
        except Exception:
            pass


# ── THE FALL ───────────────────────────────────────────────────────────────
# Pure arithmetic, no Cinema 4D: where a word is, which way it points and how
# long it has stretched, at any moment of the loop. Axes: the disc lies in XZ,
# the camera is on -Z, and a word at the front of the hole moves toward +X, the
# way it reads. Cinema 4D heading H turns +Z toward +X, so a word whose reading
# direction is (tx, tz) has H = atan2(-tz, tx).

def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / float(b - a)))
    return t * t * (3.0 - 2.0 * t)


def swirl(p):
    """Radians turned round the hole since the rim, at progress p."""
    return 2.0 * math.pi * TURNS * (p + SWIRL * p * p) / (1.0 + SWIRL)


def pose(shot, angle0, height0, p):
    """(position, heading, stretch) at progress p of a fall that enters the rim
    at angle0, height0. Position is a tuple; heading is unwrapped radians."""
    r_out = shot["r_out"]
    r_end = END_RADIUS * HORIZON_RADIUS
    r = r_out - (r_out - r_end) * p ** FALL
    a = angle0 + swirl(p)
    dr = -(r_out - r_end) * FALL * p ** (FALL - 1.0)
    da = 2.0 * math.pi * TURNS * (1.0 + 2.0 * SWIRL * p) / (1.0 + SWIRL)
    pos = (r * math.sin(a), height0 * (1.0 - p), -r * math.cos(a))
    heading = -a + math.atan2(dr, r * da)
    return pos, heading, 1.0 + STRETCH * p * p


def life(u):
    """(progress p, fade) for a word a share u of the way round its loop. The
    fade is 0 while out of sight and 1 while fully grown."""
    p = min(1.0, u / U_END)
    fade = smoothstep(FADE_IN[0], FADE_IN[1], u) * (1.0 - smoothstep(FADE_OUT[0], FADE_OUT[1], p))
    return p, fade


def word_state(shot, line, word, frame):
    """Everything about one word at one frame: position, heading, the three
    scales, how grown it is (fade) and where it is in its loop (u). Words
    whose back is to the lens are scaled away, so nothing shows mirrored."""
    u = ((frame + (line["phase"] - word["lag"]) * FRAMES) / float(FRAMES)) % 1.0
    p, fade = life(u)
    pos, heading, stretch = pose(shot, line["angle"], line["height"], p)
    shown = fade * smoothstep(FACE[0], FACE[1], math.cos(heading))
    sx = max(HIDDEN, shown * stretch)
    sy = max(HIDDEN, shown / math.sqrt(stretch))
    return dict(pos=pos, heading=heading, scale=(sx, sy, sy), fade=fade, u=u)


def make_plan(shot):
    """The lines of LYRICS as arms: where each starts, when, and the words in
    train order. A word's lag is how long after the front word it enters, so
    that the words sit end to end along the arm as they come in."""
    lines = [text.split() for text in LYRICS if text.split()]
    h = shot["text_h"]
    v0 = shot["r_out"] * 2.0 * math.pi * TURNS / (1.0 + SWIRL)     # speed at the rim, per unit p
    count = len(lines)
    plan = []
    for i, words in enumerate(lines):
        widths = [text_size(w, h)[0] for w in words]
        mids, cursor = [], 0.0
        for w in widths:
            mids.append(cursor + w / 2.0)
            cursor += w + WORD_GAP * h
        entries = [dict(text=w, width=widths[k], lag=(mids[-1] - mids[k]) / v0 * U_END)
                   for k, w in enumerate(words)]
        plan.append(dict(index=i,
                         angle=2.0 * math.pi * i / count,
                         height=shot["spread"] * (2.0 * ((i * GOLDEN) % 1.0) - 1.0),
                         phase=i / float(count),
                         words=entries,
                         train=entries[0]["lag"]))
    return plan


def bake_word(shot, line, word):
    """Key lists for one word over the loop: one key every STEP frames, and the
    key at FRAMES is the key at 0, so the loop closes exactly."""
    out = dict(px=[], py=[], pz=[], h=[], sx=[], sy=[], sz=[])
    for frame in range(0, FRAMES, STEP):
        st = word_state(shot, line, word, frame)
        for key, value in zip(("px", "py", "pz"), st["pos"]):
            out[key].append((frame, value))
        out["h"].append((frame, st["heading"]))
        for key, value in zip(("sx", "sy", "sz"), st["scale"]):
            out[key].append((frame, value))
    for key in out:
        out[key].append((FRAMES, out[key][0][1]))
    return out


# ── MATERIALS ─────────────────────────────────────────────────

def new_material(doc, name):
    mat = c4d.BaseMaterial(c4d.Mmaterial)
    mat.SetName(name)
    doc.InsertMaterial(mat)
    return mat


def black_material(doc):
    mat = new_material(doc, "LYR_Horizon")
    put(mat, "MATERIAL_USE_COLOR", True)
    put(mat, "MATERIAL_COLOR_COLOR", c4d.Vector(0, 0, 0))
    put(mat, "MATERIAL_USE_REFLECTION", False)
    put(mat, "MATERIAL_USE_LUMINANCE", False)
    mat.Update(True, True)
    return mat


def lit_material(doc, name, colour):
    """One flat colour that lights itself: no image, no lights needed."""
    mat = new_material(doc, name)
    put(mat, "MATERIAL_USE_COLOR", False)
    put(mat, "MATERIAL_USE_REFLECTION", False)
    put(mat, "MATERIAL_USE_LUMINANCE", True)
    put(mat, "MATERIAL_LUMINANCE_COLOR", colour)
    put(mat, "MATERIAL_LUMINANCE_BRIGHTNESS", 1.0)
    mat.Update(True, True)
    return mat


def tag(obj, mat, projection=None):
    t = c4d.TextureTag()
    t.SetMaterial(mat)
    put(t, "TEXTURETAG_PROJECTION",
        projection if projection is not None else const("TEXTURETAG_PROJECTION_UVW"))
    obj.InsertTag(t)


def smooth(obj, angle=40.0):
    """Phong tag: script-made objects don't get one, and letters show facets."""
    try:
        t = obj.MakeTag(c4d.Tphong)
        put(t, "PHONGTAG_PHONG_ANGLELIMIT", True)
        put(t, "PHONGTAG_PHONG_ANGLE", deg(angle))
    except Exception:
        SKIPPED.append("{}: Phong tag".format(_who(obj)))


# ── SHAPES ─────────────────────────────────────────────────────────────────

def null(name, parent):
    obj = c4d.BaseObject(c4d.Onull)
    obj.SetName(name)
    obj.InsertUnder(parent)
    return obj


def torus(name, radius, pipe, parent, facing=False):
    """A ring. Flat in XZ by default; facing=True stands it in its own XY so its
    parent alone aims it."""
    ring = c4d.BaseObject(c4d.Otorus)
    ring.SetName(name)
    put(ring, ("PRIM_TORUS_OUTERRAD", "PRIM_TORUS_OUTRAD"), radius, "Ring Radius")
    put(ring, "PRIM_TORUS_INNERRAD", pipe, "Pipe Radius")
    put(ring, ("PRIM_TORUS_CSUB", "PRIM_TORUS_SEG"), 128, "Ring Segments")
    put(ring, ("PRIM_TORUS_SUB", "PRIM_TORUS_PSUB"), 16, "Pipe Segments")
    put(ring, "PRIM_AXIS", const("PRIM_AXIS_ZP") if facing else const("PRIM_AXIS_YP"), "Orientation")
    ring.InsertUnder(parent)
    return ring


def blob(name, radius, parent):
    spot = c4d.BaseObject(c4d.Osphere)
    spot.SetName(name)
    spot[c4d.PRIM_SPHERE_RAD] = radius
    put(spot, "PRIM_SPHERE_SUB", 24, "Segments")
    spot.InsertUnder(parent)
    return spot


def mix(a, b, t):
    return c4d.Vector(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t)


_FONT = []


def bold_font():
    """FontData for the first font in FONTS this machine has, or None."""
    if _FONT:
        return _FONT[0]
    found = None
    try:
        clip = bitmaps.GeClipMap
        kind = const("GE_FONT_NAME_DISPLAY")
        for name in FONTS:
            bc = clip.GetFontDescription(name, kind)
            if bc is not None:
                found = c4d.FontData()
                found.SetFont(bc)
                print("Lyrics font: " + name)
                break
    except Exception:
        found = None
    if found is None:
        SKIPPED.append("Text: bold font (using the default font)")
    _FONT.append(found)
    return found


def _bounds(op, parent_m, box):
    """Grow box [lo, hi] by every point in op, its siblings and children."""
    while op:
        m = parent_m * op.GetMl()
        cache = op.GetDeformCache() or op.GetCache()
        if cache:
            _bounds(cache, m, box)
        elif op.CheckType(c4d.Opoint):
            for p in op.GetAllPoints():
                q = m * p
                box[0] = c4d.Vector(min(box[0].x, q.x), min(box[0].y, q.y), min(box[0].z, q.z))
                box[1] = c4d.Vector(max(box[1].x, q.x), max(box[1].y, q.y), max(box[1].z, q.z))
        _bounds(op.GetDown(), m, box)
        op = op.GetNext()


def centre(doc, objs):
    """Move each text so its middle sits on its parent's origin. Measured from
    the built letters, so it holds whatever the font and version."""
    passes(doc)
    big = 1e9
    for obj in objs:
        box = [c4d.Vector(big, big, big), c4d.Vector(-big, -big, -big)]
        try:
            _bounds(obj.GetCache(), c4d.Matrix(), box)
        except Exception:
            pass
        if box[0].x > box[1].x:
            SKIPPED.append("{}: centring".format(_who(obj)))
            continue
        mid = (box[0] + box[1]) * 0.5
        obj.SetRelPos(c4d.Vector(-mid.x, -mid.y, -mid.z))


def text_object(name, text, height, depth, parent, mat):
    """Extruded text, built from a spline and tagged with its material."""
    extrude = c4d.BaseObject(c4d.Oextrude)
    extrude.SetName(name)
    # 2023+ names it Offset (and its Auto direction already follows the
    # text); older versions take a Movement vector.
    put_either(extrude, [("EXTRUDEOBJECT_EXTRUSIONOFFSET", depth),
                         ("EXTRUDEOBJECT_MOVE", c4d.Vector(0, 0, depth))], "extrusion depth")

    spline = c4d.BaseObject(c4d.Osplinetext)
    spline.SetName(name + " Text")
    put(spline, "PRIM_TEXT_TEXT", text, "Text")
    put(spline, "PRIM_TEXT_HEIGHT", height, "Height")
    put(spline, "PRIM_TEXT_ALIGN", const("PRIM_TEXT_ALIGN_MIDDLE"), "Align")
    font = bold_font()
    if font is not None:
        put(spline, "PRIM_TEXT_FONT", font)
    put(spline, "PRIM_PLANE", const("PRIM_PLANE_XY"), "Plane")

    spline.InsertUnder(extrude)
    extrude.InsertUnder(parent)
    tag(extrude, mat)
    smooth(extrude)
    return extrude


# ── LAYOUT AND FRAMING ─────────────────────────────────────────────────────

def text_size(text, height):
    """Rough width and height of a one line text."""
    return CHAR_W * height * len(text), height * 1.15


def _sub(a, b):
    return tuple(a[k] - b[k] for k in range(3))


def _dot(a, b):
    return sum(a[k] * b[k] for k in range(3))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _unit(a):
    length = math.sqrt(_dot(a, a))
    return tuple(x / length for x in a)


def camera_at(shot, sway, push):
    """Camera position for a sway (degrees) and push (units), as build() keys it."""
    view = math.radians(shot["view"])
    a = math.radians(sway)
    z0 = -shot["dist"] * math.cos(view) + push
    return (z0 * math.sin(a), shot["dist"] * math.sin(view), z0 * math.cos(a))


def _corners(centre_, heading, size):
    """The eight corners of a box of half sizes (along, up, depth) turned by heading."""
    along = (math.cos(heading), 0.0, -math.sin(heading))
    depth = (math.sin(heading), 0.0, math.cos(heading))
    for sa in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            for sd in (-1.0, 1.0):
                yield tuple(centre_[k] + sa * size[0] * along[k] + sd * size[2] * depth[k]
                            + (sy * size[1] if k == 1 else 0.0) for k in range(3))


def fit_report(shot, plan=None):
    """The largest share of the frame's half width or height that any word,
    the disc or the halo reaches over the whole loop, camera drift included.
    Under 0.95 leaves a margin; 9.99 means something passes behind the lens."""
    plan = plan if plan is not None else make_plan(shot)
    aspect = shot["res"][0] / float(shot["res"][1])
    tan_h = FOCAL_FILM / 2.0 / shot["focal"]
    look = (0.0, 0.0, 0.0)
    h = shot["text_h"]
    points = []
    for line in plan:
        for word in line["words"]:
            half = (text_size(word["text"], h)[0] / 2.0, h * 1.15 / 2.0, h * DEPTH / 2.0)
            for frame in range(0, FRAMES, 10):
                st = word_state(shot, line, word, frame)
                if st["fade"] < 0.5:
                    continue
                size = (half[0] * st["scale"][0] * REACH, half[1] * st["scale"][1] * REACH,
                        half[2] * st["scale"][2] * REACH)
                points.extend(_corners(st["pos"], st["heading"], size))
    disc = [(DISC_OUTER * math.sin(math.radians(k * 15)), 0.0, DISC_OUTER * math.cos(math.radians(k * 15)))
            for k in range(24)]
    worst = 0.0
    for sway in (-shot["sway"], 0.0, shot["sway"]):
        for push in (-shot["push"], 0.0, shot["push"]):
            cam = camera_at(shot, sway, push)
            fwd = _unit(_sub(look, cam))
            right = _unit(_cross((0.0, 1.0, 0.0), fwd))
            up = _cross(fwd, right)
            halo = [tuple(HALO_OUTER * (math.cos(math.radians(k * 22.5)) * right[j]
                                        + math.sin(math.radians(k * 22.5)) * up[j])
                          for j in range(3)) for k in range(16)]
            for p in points + disc + halo:
                rel = _sub(p, cam)
                z = _dot(rel, fwd)
                if z < 50.0:
                    return 9.99
                x = _dot(rel, right) / z / tan_h
                y = _dot(rel, up) / z / (tan_h / aspect)
                worst = max(worst, abs(x), abs(y))
    return worst


# ── THE SCENE ──────────────────────────────────────────────────────────────

def animate_word(unit, baked):
    for axis in "xyz":
        set_keys(unit, pos_id(axis), baked["p" + axis])
        set_keys(unit, scale_id(axis), baked["s" + axis])
    set_keys(unit, rot_id("h"), baked["h"])


def build(doc):
    shot = SHOTS[MODE]
    root = c4d.BaseObject(c4d.Onull)
    root.SetName(GROUP_NAME)
    doc.InsertObject(root)

    view = math.radians(shot["view"])

    # Camera: just above the disc plane, aimed at the hole, one slow arc and
    # one slow push per loop.
    orbit = null("Camera Orbit", root)
    cam = c4d.BaseObject(c4d.Ocamera)
    cam.SetName("Lyrics Camera")
    put(cam, "CAMERA_FOCUS", shot["focal"], "Focal Length")
    cam.SetRelPos(c4d.Vector(0, shot["dist"] * math.sin(view), -shot["dist"] * math.cos(view)))
    cam.InsertUnder(orbit)

    horizon = c4d.BaseObject(c4d.Osphere)
    horizon.SetName("Event Horizon")
    horizon[c4d.PRIM_SPHERE_RAD] = HORIZON_RADIUS
    put(horizon, "PRIM_SPHERE_SUB", 64, "Segments")
    horizon.InsertUnder(root)
    tag(horizon, black_material(doc), const("TEXTURETAG_PROJECTION_SPHERICAL"))

    aim = c4d.BaseTag(c4d.Ttargetexpression)
    aim[c4d.TARGETEXPRESSIONTAG_LINK] = horizon
    cam.InsertTag(aim)

    if shot["sway"]:
        set_keys(orbit, rot_id("h"), cycle(0.0, deg(shot["sway"]), 1))
    if shot["push"]:
        set_keys(cam, pos_id("z"), cycle(-shot["dist"] * math.cos(view), shot["push"], 1, math.pi / 2.0))

    # Disc: flat rings, white-hot inside to deep orange outside. Each ring has
    # two hot spots on a null that turns in place; whole turns per loop, inner
    # rings fastest, in the direction the words fall (they cross the front of
    # the hole toward +X, which is a negative heading).
    disc = null("Accretion Disc", root)
    spot_mat = lit_material(doc, "LYR_Spot", SPOT)
    width = (DISC_OUTER - DISC_INNER) / float(DISC_RINGS)
    for k in range(DISC_RINGS):
        t = k / float(DISC_RINGS - 1)
        colour = mix(DISC_HOT, DISC_WARM, t * 2.0) if t < 0.5 else mix(DISC_WARM, DISC_DEEP, (t - 0.5) * 2.0)
        radius = DISC_INNER + width * (k + 0.5)
        pipe = width * 0.6
        spin = null("Ring {} Spin".format(k + 1), disc)
        ring = torus("Ring {}".format(k + 1), radius, pipe, spin)
        ring.SetRelScale(c4d.Vector(1.0, DISC_FLAT, 1.0))
        tag(ring, lit_material(doc, "LYR_Ring{}".format(k + 1), colour))
        for j in range(2):
            angle = math.radians(k * 47.0 + j * 180.0)
            spot = blob("Hot Spot {}.{}".format(k + 1, j + 1), pipe * 0.8, spin)
            spot.SetRelPos(c4d.Vector(radius * math.cos(angle), 0.0, radius * math.sin(angle)))
            spot.SetRelScale(c4d.Vector(1.4, DISC_FLAT * 3.0, 1.0))
            spot.SetRelRot(c4d.Vector(-angle - math.pi / 2.0, 0.0, 0.0))
            tag(spot, spot_mat)
        turns = max(1, int(round(4.0 - 3.0 * t)))
        set_keys(spin, rot_id("h"), [(0, 0.0), (FRAMES, -deg(360.0 * turns))])

    # Rim: rings that stand square-on to the camera, whatever the angle. The
    # first is the photon ring, hugging the horizon; the others fade outward.
    facing = null("Faces Camera", root)
    face = c4d.BaseTag(c4d.Ttargetexpression)
    face[c4d.TARGETEXPRESSIONTAG_LINK] = cam
    facing.InsertTag(face)
    for k, (scale, pipe, colour) in enumerate(RIM):
        rim = torus("Rim {}".format(k + 1), HORIZON_RADIUS * scale, pipe, facing, facing=True)
        tag(rim, lit_material(doc, "LYR_Rim{}".format(k + 1), colour))

    # The words.
    plan = make_plan(shot)
    mats = (lit_material(doc, "LYR_Line", LINE_GLOW), lit_material(doc, "LYR_Accent", ACCENT_GLOW))
    stage = null("Words", root)
    texts = []
    for line in plan:
        mat = mats[1 if line["index"] % ACCENT_EVERY == ACCENT_EVERY - 1 else 0]
        arm = null("Line {}".format(line["index"] + 1), stage)
        for k, word in enumerate(line["words"]):
            unit = null("L{}W{}".format(line["index"] + 1, k + 1), arm)
            texts.append(text_object(word["text"], word["text"], shot["text_h"],
                                     shot["text_h"] * DEPTH, unit, mat))
            animate_word(unit, bake_word(shot, line, word))
        if line["train"] > LONG_LINE:
            NOTES.append("Line {} (\"{}\") is too long for this shot: its words will "
                         "overlap. Shorten it.".format(line["index"] + 1, LYRICS[line["index"]]))
    centre(doc, texts)
    return root, cam


def configure_document(doc, cam):
    shot = SHOTS[MODE]
    res_x, res_y = shot["res"]
    header = MODE == "header"
    doc.SetFps(FPS)
    doc.SetMinTime(c4d.BaseTime(0, FPS))
    doc.SetMaxTime(c4d.BaseTime(FRAMES, FPS))
    doc.SetLoopMinTime(c4d.BaseTime(0, FPS))
    doc.SetLoopMaxTime(c4d.BaseTime(FRAMES, FPS))
    doc.SetTime(c4d.BaseTime(FRAMES // 2, FPS))      # open on a frame worth looking at

    rd = doc.GetActiveRenderData()
    if rd is not None:
        put(rd, "RDATA_RENDERENGINE", const("RDATA_RENDERENGINE_STANDARD"))
        put(rd, "RDATA_XRES", float(res_x))
        put(rd, "RDATA_YRES", float(res_y))
        put(rd, "RDATA_FILMASPECT", res_x / float(res_y), "Film Aspect")
        put(rd, "RDATA_FRAMERATE", float(FPS))
        put(rd, "RDATA_FRAMESEQUENCE", const("RDATA_FRAMESEQUENCE_MANUAL"))
        put(rd, "RDATA_FRAMEFROM", c4d.BaseTime(max(0, min(START_FRAME, FRAMES - 1)), FPS))
        # Stop one short: frame FRAMES is frame 0 again, and rendering both
        # puts a held frame at the loop point.
        put(rd, "RDATA_FRAMETO", c4d.BaseTime(FRAMES - 1, FPS))
        put(rd, "RDATA_SAVEIMAGE", True)
        put(rd, "RDATA_PATH", OUTPUT_PATH)
        put(rd, "RDATA_FORMAT", const("FILTER_PNG"))
        put(rd, "RDATA_ALPHACHANNEL", header)
        if header:
            put(rd, "RDATA_STRAIGHTALPHA", True)   # no dark fringe on the app's graphite
        put(rd, "RDATA_ANTIALIASING", const("RDATA_ANTIALIASING_BEST"), "Antialiasing")

    bd = doc.GetActiveBaseDraw()
    if bd is not None:
        bd.SetSceneCamera(cam)


def clear_previous(doc):
    obj = doc.GetFirstObject()
    while obj:
        nxt = obj.GetNext()
        if obj.GetName() == GROUP_NAME:
            obj.Remove()
        obj = nxt
    mat = doc.GetFirstMaterial()
    while mat:
        nxt = mat.GetNext()
        if mat.GetName().startswith("LYR_"):
            mat.Remove()
        mat = nxt


def main():
    del SKIPPED[:]
    del NOTES[:]
    del _FONT[:]
    if MODE not in SHOTS:
        gui.MessageDialog("MODE must be one of: {}.".format(", ".join(sorted(SHOTS))))
        return
    if not [text for text in LYRICS if text.split()]:
        gui.MessageDialog("LYRICS is empty. Put at least one line in it and run again.")
        return
    if FRAMES % STEP:
        gui.MessageDialog("FRAMES must be a multiple of STEP ({}).".format(STEP))
        return
    doc = c4d.documents.GetActiveDocument()

    doc.StartUndo()
    try:
        clear_previous(doc)
        root, cam = build(doc)
        configure_document(doc, cam)
        undo_new = const("UNDOTYPE_NEWOBJ", "UNDOTYPE_NEW")
        if undo_new is not None:
            doc.AddUndo(undo_new, root)
    finally:
        doc.EndUndo()
        c4d.EventAdd()

    fit = fit_report(SHOTS[MODE])
    if fit >= 0.95:
        NOTES.append("The shot is tight: the scene reaches {:.0f}% of the frame. Lower r_out "
                     "or text_h in SHOTS.".format(fit * 100))
    print("Lyrics hole built ({} shot, {} lines)".format(MODE, len(LYRICS)))
    print("  fit - the scene reaches {:.0f}% of the frame".format(fit * 100))
    for line in NOTES:
        print("  note - " + line)
    for line in SKIPPED:
        print("  skipped - " + line)
    gui.MessageDialog(
        "Lyrics hole built. {} note(s), {} setting(s) skipped{}.\n\n"
        "Save the file, then Shift+R to render.".format(
            len(NOTES), len(SKIPPED), " (see Console, Shift+F10)" if SKIPPED or NOTES else ""))


if __name__ == "__main__":
    main()
