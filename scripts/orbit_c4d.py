"""
BLACK HOLE STUDIOS — the 18 tools orbit the studio, built by script, in Cinema 4D.

The studio name stands in the middle and pulses, inside a black hole ringed
with glowing orange-white light. The other 18 tab names ride a staggered helix
round it: neighbours sit several rows apart, so no two crowd each other. A
MoGraph Cloner places them, a Plain effector with a spherical Field sends a lift
travelling through them, and a Sound Effector is ready for music. Every name
turns against the spin, so each one keeps facing the camera the whole way round.

WHAT YOU NEED: this script. No images, no extra folders.

RUN
  1. File -> New (start from an empty scene).
  2. Extensions -> Script Manager -> File -> Load Script -> this file -> Execute.
  3. Save the .c4d.
  4. Shift+R (Render to Picture Viewer). Frames go to orbit/ next to the .c4d.

SHOTS  (MODE below)
  "hero"    1920x1080, the wide shot.
  "phone"   1080x1920, held upright, the ring stretched tall.
  "header"  720x720, for the tab header.
All three loop: the last frame leads straight back into the first. The Console
(Extensions -> Console, Shift+F10) prints how close the names come to the edge
of each shot and whether any two names overlap; keep the first under 95% and the
second at 0 if you change SHOTS.

SOUND  The Sound Effector does nothing until it has audio. Select it in the
Object Manager, load a sound in the Attribute Manager, and trim the sound to
FRAMES / FPS seconds (8 s at the defaults) or the loop pops.

IF IT CRASHES PART WAY: set START_FRAME below to the first missing frame, run
the script again, and Shift+R. Finished frames are kept.

HOW IT'S BUILT
Shapes, flat glowing colours and motion only: no image files anywhere.
  ring      one null per name, set on a staggered helix and holding the
            extruded text. The Cloner takes the nulls as its children and
            spreads them round a circle. Each null counter-rotates (0 to -360
            degrees while the ring turns 0 to +360), which keeps the text upright.
  motion    Plain effector + spherical Field ("Orbit Field", sweeping up and
            down the helix) and a Sound Effector, both on the Cloner.
  core      the studio name, centred, with a slow pulse and bob.
  hole      a black disc behind the core, always square to the camera, ringed
            by glowing orange-white rims. A flat disc of glowing rings turns
            round it, with bright spots riding each ring.
  rails     two thin rings marking the top and bottom of the helix.
  look      black space, names that light themselves so they never go dark,
            and fog that fades the far side.
Substance: drag any .sbsar from the Content Browser onto a name for extra
surface detail. None ship with this script.
Standard renderer and Standard materials only (the renderer is set here).

MoGraph setting names change between versions. The script builds the ring,
measures where the Cloner really put each name, and only keeps it if the ring
is right. Otherwise it builds the same ring by hand with the same motion minus
the effectors. Either way the Console says which.

Anything this version of Cinema 4D refuses is skipped and listed in the
Console instead of stopping the script.
"""

import math

import c4d
from c4d import bitmaps, gui, utils

# ── CONFIG ─────────────────────────────────────────────────────────────────

# The 18 tools that orbit. Black Hole Studios itself is the centre.
LABELS = [
    "Songwriter", "Ghost Rider", "Song Forge", "The Matrix", "Collaboration",
    "RC-Funk 5000", "Cloud Stem Extraction", "Recording Booth", "Voice Lab",
    "MIDI Studio", "Mastering Studio", "Chopped & Screwed", "Rhyme Helper",
    "Thesaurus", "Dictionary", "AI Tools Hub", "Scratchpad", "Settings",
]
CORE = "BLACK HOLE\nSTUDIOS"

GROUP_NAME = "ORBIT_RIG"             # re-running the script replaces this group
FOG_NAME = "ORBIT_FOG"
OUTPUT_PATH = "orbit/orbit_"         # relative to the saved .c4d

MODE = "hero"                        # "hero", "phone" or "header"

FPS = 30
FRAMES = 240                         # 8 s loop; keep it a multiple of 4
START_FRAME = 0                      # raise this to resume after a crash

# res; ring_r the circle the names ride; label_h their letter height; rise the
# height of the helix; stagger how many rows apart neighbours sit (coprime to 18:
# 1, 5, 7, 11, 13 or 17); lift and sound how far the effectors push a name up;
# dist, cam_y, look_y the camera; core_h the letter height of the centre.
SHOTS = {
    "hero":   dict(res=(1920, 1080), ring_r=1000.0, label_h=60.0, rise=1100.0,
                   stagger=11, lift=80.0, sound=60.0, dist=3994.0, cam_y=2694.0,
                   look_y=0.0, core_h=110.0),
    "phone":  dict(res=(1080, 1920), ring_r=600.0, label_h=36.0, rise=960.0,
                   stagger=7, lift=40.0, sound=30.0, dist=1429.0, cam_y=1703.0,
                   look_y=0.0, core_h=90.0),
    "header": dict(res=(720, 720), ring_r=700.0, label_h=42.0, rise=1120.0,
                   stagger=7, lift=50.0, sound=30.0, dist=1659.0, cam_y=1977.0,
                   look_y=0.0, core_h=80.0),
}
FOCAL = 36.0
LABEL_DEPTH = 0.22                   # extrusion, as a share of letter height
CORE_DEPTH = 0.30
RAIL_TUBE = 0.08                     # rail thickness, as a share of label height
CHAR_W = 0.62                        # label width per letter, as a share of its height
RAIL_OUT = 1.05                      # rail radius, as a multiple of the ring radius
REACH = 1.35                         # room kept round a label for font width and depth
OVERLAP_PAD = 1.08                   # names closer than this much extra count as touching

FOG_COLOUR = c4d.Vector(0.004, 0.003, 0.012)
FOG_PER_DIST = 3.5                   # fog distance, as a multiple of the camera distance

# Bold fonts to try, in order. Bahnschrift ships with Windows 10 and 11.
FONTS = ["Bahnschrift Bold", "Bahnschrift SemiBold", "Bahnschrift",
         "Arial Black", "Arial Bold", "Arial"]

CORE_BASE = c4d.Vector(0.25, 0.17, 0.05)
CORE_GLOW = c4d.Vector(1.0, 0.62, 0.18)
LABEL_BASE = c4d.Vector(0.86, 0.88, 1.0)
LABEL_GLOW = c4d.Vector(0.80, 0.84, 1.0)
RAIL_BASE = c4d.Vector(0.14, 0.08, 0.3)
RAIL_GLOW = c4d.Vector(0.46, 0.28, 1.0)

HOLE_K = 0.44                        # black hole radius, as a share of the ring radius.
                                     # Under 0.42 the title's ends sit on the white-hot
                                     # inner edge; over 0.46 the disc swallows the names.
DISC_INNER = 1.3                     # inner edge of the glowing disc, as a multiple of the hole radius
DISC_OUTER = 0.85                    # outer edge, as a share of the ring radius
DISC_RINGS = 8
DISC_FLAT = 0.07                     # ring thickness, as a share of its width
DISC_HOT = c4d.Vector(1.0, 0.95, 0.82)       # white-hot at the inner edge
DISC_WARM = c4d.Vector(1.0, 0.52, 0.12)
DISC_DEEP = c4d.Vector(0.42, 0.10, 0.03)     # dim at the outer edge
SPOT = c4d.Vector(1.0, 0.98, 0.92)
# The rims stand square to the camera: (radius as a multiple of the hole's,
# tube as a share of the hole's radius, colour). The first hugs the hole's edge.
RIM = [
    (1.07, 0.045, c4d.Vector(1.0, 0.96, 0.86)),
    (1.30, 0.09, c4d.Vector(1.0, 0.62, 0.20)),
    (1.65, 0.14, c4d.Vector(0.55, 0.16, 0.05)),
]


# ── SAFE SETTERS ───────────────────────────────────────────────────────────
# Parameter names change between Cinema 4D versions. put() tries each known
# name, then the parameter's label in the Attribute Manager, and if nothing
# fits it notes it and keeps going rather than leaving a half-built scene.

SKIPPED = []


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


def cycle(mid, amp, cycles, phase=0.0, step=4):
    """(frame, value) pairs for a sine with a whole number of cycles per loop,
    so the key at FRAMES equals the key at 0 and the loop has no seam."""
    out = []
    for frame in range(0, FRAMES + 1, step):
        angle = 2.0 * math.pi * cycles * frame / float(FRAMES) + phase
        out.append((frame, mid + amp * math.sin(angle)))
    return out


# ── MATERIALS ──────────────────────────────────────────────────────────────


def new_material(doc, name):
    mat = c4d.BaseMaterial(c4d.Mmaterial)
    mat.SetName(name)
    doc.InsertMaterial(mat)
    return mat


def tag(obj, mat, projection=None):
    t = c4d.TextureTag()
    t.SetMaterial(mat)
    put(t, "TEXTURETAG_PROJECTION",
        projection if projection is not None else const("TEXTURETAG_PROJECTION_UVW"))
    obj.InsertTag(t)


def smooth(obj, angle=40.0):
    """Phong tag: script-made objects don't get one, and metal shows facets."""
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
                print("Orbit font: " + name)
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


def light(name, pos, colour, brightness, parent):
    obj = c4d.BaseObject(c4d.Olight)
    obj.SetName(name)
    put(obj, "LIGHT_COLOR", colour, "Color")
    put(obj, "LIGHT_BRIGHTNESS", brightness, "Intensity")
    obj.SetRelPos(pos)
    obj.InsertUnder(parent)
    return obj


# ── LAYOUT AND FRAMING ─────────────────────────────────────────────────────

def wrap(text):
    """Long names go on two lines, split at the space nearest the middle."""
    if len(text) <= 12 or " " not in text:
        return text
    best = None
    for i, ch in enumerate(text):
        if ch == " ":
            gap = abs(i - len(text) / 2.0)
            if best is None or gap < best[0]:
                best = (gap, i)
    return text[:best[1]] + "\n" + text[best[1] + 1:]


def text_size(text, height):
    """Rough width and height of a (possibly two line) text."""
    lines = text.split("\n")
    return CHAR_W * height * max(len(line) for line in lines), height * 1.15 * len(lines)


def helix_y(i, shot):
    """Height of name i. The helix has one row per name, but neighbours are
    `stagger` rows apart, so names that sit side by side never share a height."""
    row = (i * shot["stagger"]) % len(LABELS)
    return -shot["rise"] / 2.0 + shot["rise"] * row / float(len(LABELS) - 1)


def _fit_boxes(shot):
    """(centre, half width, half height) of everything that must stay in frame."""
    n = len(LABELS)
    ring = shot["ring_r"]
    lift = shot["lift"] + shot["sound"]
    for spin in range(0, 360, 10):
        for i, name in enumerate(LABELS):
            ang = math.radians(spin) + 2.0 * math.pi * i / n
            w, h = text_size(wrap(name), shot["label_h"])
            for y in (helix_y(i, shot), helix_y(i, shot) + lift):
                yield (ring * math.sin(ang), y, ring * math.cos(ang)), w * REACH / 2.0, h * REACH / 2.0
    w, h = text_size(CORE, shot["core_h"])
    for y in (-shot["core_h"] * 0.12, shot["core_h"] * 0.12):
        yield (0.0, y, 0.0), w * REACH / 2.0 * 1.06, h * REACH / 2.0 * 1.06
    tube = shot["label_h"] * RAIL_TUBE
    for y in rail_heights(shot):
        for k in range(0, 360, 10):
            ang = math.radians(k)
            yield (ring * RAIL_OUT * math.sin(ang), y, ring * RAIL_OUT * math.cos(ang)), tube, tube


def fit_report(shot):
    """The largest share of the frame's half width or height that any name,
    rail or the centre reaches over the whole loop, camera sway included.
    Under 0.95 leaves a margin; 9.99 means something passes behind the lens."""
    aspect = shot["res"][0] / float(shot["res"][1])
    look = (0.0, shot["look_y"], 0.0)
    boxes = list(_fit_boxes(shot))
    worst = 0.0
    for sway in (-6.0, 0.0, 6.0):
        for push in (-60.0, 0.0, 60.0):
            a = math.radians(sway)
            d = shot["dist"] + push
            cam = (-d * math.sin(a), shot["cam_y"], -d * math.cos(a))
            fwd = _unit(_sub(look, cam))
            right = _unit(_cross((0.0, 1.0, 0.0), fwd))
            up = _cross(fwd, right)
            for c, hw, hh in boxes:
                for sx in (-1.0, 1.0):
                    for sy in (-1.0, 1.0):
                        p = tuple(c[k] + sx * hw * right[k] + sy * hh * up[k] for k in range(3))
                        rel = _sub(p, cam)
                        z = _dot(rel, fwd)
                        if z < 50.0:
                            return 9.99
                        x = _dot(rel, right) / z / 0.5
                        y = _dot(rel, up) / z / (0.5 / aspect)
                        worst = max(worst, abs(x), abs(y))
    return worst


def _sub(a, b):
    return tuple(a[k] - b[k] for k in range(3))


def _dot(a, b):
    return sum(a[k] * b[k] for k in range(3))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _unit(a):
    length = math.sqrt(_dot(a, a))
    return tuple(x / length for x in a)


def rail_heights(shot):
    """The two rails sit just beyond the top and bottom names."""
    edge = shot["rise"] / 2.0 + shot["label_h"] * 0.9
    return (-edge, edge)


# ── ANIMATION, CONTINUED ───────────────────────────────────────────────────

def real_id(param):
    return c4d.DescID(c4d.DescLevel(param, c4d.DTYPE_REAL, 0))


def scale_id(axis):
    return vec_id(c4d.ID_BASEOBJECT_REL_SCALE, axis)


def key_real(obj, name, pairs):
    """Animate a plain number parameter; a missing name is noted, not fatal."""
    param = getattr(c4d, name, None)
    if param is not None:
        try:
            set_keys(obj, real_id(param), pairs)
            return
        except Exception:
            pass
    SKIPPED.append("{}: animating {}".format(_who(obj), name))


def passes(doc):
    """Build the scene's caches without playing the animation."""
    try:
        doc.ExecutePasses(None, False, False, True, c4d.BUILDFLAGS_NONE)
    except Exception:
        try:
            doc.ExecutePasses(None, False, False, True, 0)
        except Exception:
            pass


# ── MATERIALS, CONTINUED ───────────────────────────────────────────────────

def glow_material(doc, name, base, glow, level):
    """A dark body that lights itself, so names never go dark."""
    mat = new_material(doc, name)
    put(mat, "MATERIAL_USE_COLOR", True)
    put(mat, "MATERIAL_COLOR_COLOR", base)
    put(mat, "MATERIAL_USE_LUMINANCE", True)
    put(mat, "MATERIAL_LUMINANCE_COLOR", glow)
    put(mat, "MATERIAL_LUMINANCE_BRIGHTNESS", level)
    mat.Update(True, True)
    return mat


# ── SHAPES, CONTINUED ──────────────────────────────────────────────────────

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


def rail(name, y, shot, mat, parent):
    """A thin flat ring just outside the names, marking one end of the helix."""
    kind = const("Otorus")
    ring = c4d.BaseObject(kind) if kind is not None else None
    if ring is None:
        SKIPPED.append("Rails: torus (not in this version)")
        return None
    ring.SetName(name)
    put(ring, "PRIM_TORUS_OUTERRAD", shot["ring_r"] * RAIL_OUT, "Ring Radius")
    put(ring, "PRIM_TORUS_INNERRAD", shot["label_h"] * RAIL_TUBE, "Pipe Radius")
    put(ring, ("PRIM_TORUS_CSUB", "PRIM_TORUS_SEG"), 180, "Ring Segments")
    ring.SetRelPos(c4d.Vector(0, y, 0))
    ring.InsertUnder(parent)
    tag(ring, mat)
    smooth(ring, 60.0)
    return ring


def black_material(doc):
    mat = new_material(doc, "ORB_Horizon")
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


def hole(doc, root, cam, shot):
    """The black hole behind the name: a flat glowing disc round the middle, a
    black sphere that hides the far half of it, and glowing rings round the
    sphere. No images anywhere, so it renders the same in every version."""
    hole_r = shot["ring_r"] * HOLE_K
    inner = hole_r * DISC_INNER
    outer = shot["ring_r"] * DISC_OUTER
    width = (outer - inner) / float(DISC_RINGS)

    # Disc: flat rings, white-hot inside to deep orange outside. Each ring has
    # two hot spots on a null that turns in place; whole turns per loop, inner
    # rings fastest, the way the names go round (a positive heading).
    disc = null("Accretion Disc", root)
    spot_mat = lit_material(doc, "ORB_Spot", SPOT)
    for k in range(DISC_RINGS):
        t = k / float(DISC_RINGS - 1)
        colour = mix(DISC_HOT, DISC_WARM, t * 2.0) if t < 0.5 else mix(DISC_WARM, DISC_DEEP, (t - 0.5) * 2.0)
        radius = inner + width * (k + 0.5)
        pipe = width * 0.6
        spin = null("Ring {} Spin".format(k + 1), disc)
        ring = torus("Ring {}".format(k + 1), radius, pipe, spin)
        ring.SetRelScale(c4d.Vector(1.0, DISC_FLAT, 1.0))
        tag(ring, lit_material(doc, "ORB_Ring{}".format(k + 1), colour))
        for j in range(2):
            angle = math.radians(k * 47.0 + j * 180.0)
            spot = blob("Hot Spot {}.{}".format(k + 1, j + 1), pipe * 0.8, spin)
            spot.SetRelPos(c4d.Vector(radius * math.cos(angle), 0.0, radius * math.sin(angle)))
            spot.SetRelScale(c4d.Vector(1.4, DISC_FLAT * 3.0, 1.0))
            spot.SetRelRot(c4d.Vector(-angle - math.pi / 2.0, 0.0, 0.0))
            tag(spot, spot_mat)
        turns = max(1, int(round(4.0 - 3.0 * t)))
        set_keys(spin, rot_id("h"), [(0, 0.0), (FRAMES, deg(360.0 * turns))])

    # The horizon and the rim rings stand square-on to the camera, whatever the
    # angle, and sit just behind the core's letters so the name stays in front.
    # Looking down the line of sight the sphere still lands in the middle of
    # the frame, and it hides the far half of the disc.
    facing = null("Faces Camera", root)
    face = c4d.BaseTag(c4d.Ttargetexpression)
    face[c4d.TARGETEXPRESSIONTAG_LINK] = cam
    facing.InsertTag(face)
    behind = hole_r + shot["core_h"] * CORE_DEPTH * 1.2
    horizon = c4d.BaseObject(c4d.Osphere)
    horizon.SetName("Event Horizon")
    horizon[c4d.PRIM_SPHERE_RAD] = hole_r
    put(horizon, "PRIM_SPHERE_SUB", 64, "Segments")
    horizon.SetRelPos(c4d.Vector(0, 0, -behind))
    horizon.InsertUnder(facing)
    tag(horizon, black_material(doc), const("TEXTURETAG_PROJECTION_SPHERICAL"))
    for k, (scale, share, colour) in enumerate(RIM):
        rim = torus("Rim {}".format(k + 1), hole_r * scale, hole_r * share, facing, facing=True)
        rim.SetRelPos(c4d.Vector(0, 0, -behind))
        tag(rim, lit_material(doc, "ORB_Rim{}".format(k + 1), colour))


def overlap_report(shot):
    """How many names cover each other on screen: (average, worst) over the
    loop, camera sway and push included. 0 is clean. (99.0, 99) means a name
    passes behind the lens."""
    n = len(LABELS)
    aspect = shot["res"][0] / float(shot["res"][1])
    look = (0.0, shot["look_y"], 0.0)
    ring = shot["ring_r"]
    sizes = [text_size(wrap(name), shot["label_h"]) for name in LABELS]
    total, worst, count = 0, 0, 0
    for sway in (-6.0, 0.0, 6.0):
        for push in (-60.0, 0.0, 60.0):
            a = math.radians(sway)
            d = shot["dist"] + push
            cam = (-d * math.sin(a), shot["cam_y"], -d * math.cos(a))
            fwd = _unit(_sub(look, cam))
            right = _unit(_cross((0.0, 1.0, 0.0), fwd))
            up = _cross(fwd, right)
            for spin in range(0, 360, 15):
                rects = []
                for i in range(n):
                    ang = math.radians(spin) + 2.0 * math.pi * i / n
                    c = (ring * math.sin(ang), helix_y(i, shot), ring * math.cos(ang))
                    xs, ys = [], []
                    for sx in (-1.0, 1.0):
                        for sy in (-1.0, 1.0):
                            # the names stay square to the camera, so their
                            # corners run along the world's X and Y
                            p = (c[0] + sx * sizes[i][0] * OVERLAP_PAD / 2.0,
                                 c[1] + sy * sizes[i][1] * OVERLAP_PAD / 2.0, c[2])
                            rel = _sub(p, cam)
                            z = _dot(rel, fwd)
                            if z < 50.0:
                                return 99.0, 99
                            xs.append(_dot(rel, right) / z / 0.5)
                            ys.append(_dot(rel, up) / z / (0.5 / aspect))
                    rects.append((min(xs), max(xs), min(ys), max(ys)))
                hits = 0
                for i in range(n):
                    for j in range(i + 1, n):
                        p, q = rects[i], rects[j]
                        if p[0] < q[1] and q[0] < p[1] and p[2] < q[3] and q[2] < p[3]:
                            hits += 1
                total += hits
                worst = max(worst, hits)
                count += 1
    return total / float(count), worst


def fog(doc, distance):
    env = c4d.BaseObject(const("Oenvironment") or 5116)
    if env is None:
        SKIPPED.append("Fog: Environment object")
        return
    env.SetName(FOG_NAME)
    put(env, "ENVIRONMENT_FOG", True, "Enable Fog")
    put(env, "ENVIRONMENT_FOGCOLOR", FOG_COLOUR, "Fog Color")
    put(env, "ENVIRONMENT_FOGSTRENGTH", 1.0, "Fog Strength")
    put(env, "ENVIRONMENT_FOGDISTANCE", distance, "Fog Distance")
    doc.InsertObject(env)


# ── THE RING ───────────────────────────────────────────────────────────────
# The names are built once as "units" (a null at the name's height holding the
# extruded text), then handed either to a MoGraph Cloner or to a hand-built
# ring. Cloner settings are not the same in every version, so the Cloner is
# tried first on empty stand-ins and only used if it lands the names exactly
# where they belong.

RING = []                  # one line saying how the ring was made, for the Console


def new_cloner(shot):
    """A radial Cloner set up for the ring, or None if this version has none."""
    kind = const("Omgcloner")
    cloner = c4d.BaseObject(kind) if kind is not None else None
    if cloner is None:
        return None
    cloner.SetName("Orbit Cloner")
    put(cloner, "ID_MG_MOTIONGENERATOR_MODE", 2)          # Radial
    put(cloner, ("MG_RADIAL_COUNT", "MG_POLY_COUNT"), len(LABELS))
    put(cloner, ("MG_RADIAL_RADIUS", "MG_POLY_RADIUS"), shot["ring_r"])
    # The floor plane. 2026 calls it MG_RADIAL_AXIS and takes a named constant;
    # older builds call it MG_RADIAL_PLANE and take a plain 2.
    put_either(cloner,
               [("MG_RADIAL_AXIS", const("MG_RADIAL_AXIS_XZ")),
                (("MG_RADIAL_PLANE", "MG_POLY_PLANE"), 2)],
               "radial plane (XZ)")
    return cloner


def _wrap_pi(a):
    return (a + math.pi) % (2.0 * math.pi) - math.pi


def _clones(cache, count):
    """The cloned objects in a Cloner's cache: its children, or its only child's."""
    kids = []
    child = cache.GetDown()
    while child:
        kids.append(child)
        child = child.GetNext()
    if len(kids) == 1:
        inner = []
        child = kids[0].GetDown()
        while child:
            inner.append(child)
            child = child.GetNext()
        if len(inner) == count:
            return inner
    return kids


def measure_ring(cloner, shot):
    """Where the Cloner really put each name. Returns (headings, "") when the
    ring is the one asked for, otherwise (None, why). A heading is the way
    clone i's Z axis points, which the names must turn against to face front."""
    n = len(LABELS)
    try:
        cache = cloner.GetCache()
        if cache is None:
            return None, "the Cloner built nothing"
        kids = _clones(cache, n)
        if len(kids) != n:
            return None, "it made {} clones, not {}".format(len(kids), n)
        headings = []
        angles = []
        for i, kid in enumerate(kids):
            m = kid.GetMl()
            p = m.off
            radius = math.hypot(p.x, p.z)
            if abs(radius - shot["ring_r"]) > shot["ring_r"] * 0.05:
                return None, "clone {} sits {:.0f} out, not {:.0f}".format(i, radius, shot["ring_r"])
            if abs(p.y - helix_y(i, shot)) > max(5.0, shot["rise"] * 0.02):
                return None, "clone {} sits at height {:.0f}, not {:.0f}".format(i, p.y, helix_y(i, shot))
            if m.v2.y < 0.95 or abs(m.v3.y) > 0.1:
                return None, "clone {} is tilted".format(i)
            headings.append(math.atan2(m.v3.x, m.v3.z))
            angles.append(math.atan2(p.x, p.z))
    except Exception as err:
        return None, "couldn't read the Cloner ({})".format(err)
    step = 2.0 * math.pi / n
    for way in (1.0, -1.0):
        if all(abs(_wrap_pi(way * (a - angles[0]) - step * i)) < math.radians(4.0)
               for i, a in enumerate(angles)):
            return headings, ""
    return None, "the clones aren't spread evenly round the ring"


def probe_cloner(doc, root, shot):
    """Build the Cloner over empty stand-ins and measure it. (headings, why)."""
    cloner = new_cloner(shot)
    if cloner is None:
        return None, "this version has no Cloner object"
    try:
        for i in reversed(range(len(LABELS))):
            stand_in = null("probe {}".format(i), cloner)
            stand_in.SetRelPos(c4d.Vector(0, helix_y(i, shot), 0))
        cloner.InsertUnder(root)
        doc.SetTime(c4d.BaseTime(0, FPS))
        passes(doc)
        return measure_ring(cloner, shot)
    finally:
        cloner.Remove()


def effector_into(cloner, effectors):
    """Hand the Cloner its effector list."""
    inex = c4d.InExcludeData()
    for eff in effectors:
        inex.InsertObject(eff, 1)
    put(cloner, "ID_MG_MOTIONGENERATOR_EFFECTORLIST", inex)


def add_effectors(doc, root, cloner, shot):
    """Plain effector + spherical field (a lift that travels round and up the
    helix) and a Sound Effector (waits for audio). Each missing piece is noted."""
    made = []
    ring = shot["ring_r"]
    lift = c4d.Vector(0, shot["lift"], 0)

    plain_t = const("Omgplain", "Mgplain")
    plain = c4d.BaseObject(plain_t) if plain_t is not None else None
    if plain is None:
        SKIPPED.append("Effectors: Plain effector (not in this version)")
    else:
        plain.SetName("Orbit Lift")
        put(plain, "ID_MG_BASEEFFECTOR_POSITION_ACTIVE", True, "Position")
        put(plain, "ID_MG_BASEEFFECTOR_POSITION", lift, "Position")
        put(plain, "ID_MG_BASEEFFECTOR_ROTATE_ACTIVE", False, "Rotation")
        put(plain, "ID_MG_BASEEFFECTOR_SCALE_ACTIVE", False, "Scale")
        plain.InsertUnder(root)
        key_real(plain, "ID_MG_BASEEFFECTOR_STRENGTH", cycle(0.75, 0.25, 4))
        made.append(plain)

        field_t = const("Fspherical", "Fsphere")
        field = c4d.BaseObject(field_t) if field_t is not None else None
        if field is None:
            SKIPPED.append("Effectors: spherical Field (not in this version)")
        else:
            field.SetName("Orbit Field")
            span = 2.0 * math.pi * ring / len(LABELS)
            put(field, ("FIELD_SIZE", "FIELDOBJECT_SIZE"), c4d.Vector(span, span, span), "Size")
            field.InsertUnder(root)
            set_keys(field, pos_id("x"), cycle(0.0, ring, 3))
            set_keys(field, pos_id("z"), cycle(0.0, ring, 3, math.pi / 2.0))
            set_keys(field, pos_id("y"), cycle(0.0, shot["rise"] * 0.45, 1))
            try:
                layer = c4d.modules.mograph.FieldLayer(c4d.FLfield)
                layer.SetLinkedObject(field)
                fields = c4d.FieldList()
                fields.InsertLayer(layer)
                put(plain, "FIELDS", fields, "Fields")
            except Exception:
                SKIPPED.append("Orbit Lift: linking the Field")

    sound_t = const("Omgsound", "Mgsoundeffector", "Mgsound")
    sound = c4d.BaseObject(sound_t) if sound_t is not None else None
    if sound is None:
        SKIPPED.append("Effectors: Sound Effector (not in this version)")
    else:
        sound.SetName("Orbit Sound")
        put(sound, "ID_MG_BASEEFFECTOR_POSITION_ACTIVE", True, "Position")
        put(sound, "ID_MG_BASEEFFECTOR_POSITION", c4d.Vector(0, shot["sound"], 0), "Position")
        sound.InsertUnder(root)
        made.append(sound)

    if made:
        try:
            effector_into(cloner, made)
        except Exception:
            SKIPPED.append("Orbit Cloner: effector list")


def cloner_ring(doc, root, units, headings, shot):
    """The units under a real Cloner, turned against its spin and its alignment."""
    cloner = new_cloner(shot)
    if cloner is None:
        raise RuntimeError("no Cloner object")
    for unit in reversed(units):
        unit.Remove()
        unit.InsertUnder(cloner)
    cloner.InsertUnder(root)
    for unit, heading in zip(units, headings):
        set_keys(unit, rot_id("h"), [(0, -heading), (FRAMES, -heading - 2.0 * math.pi)])
    set_keys(cloner, rot_id("h"), [(0, 0.0), (FRAMES, 2.0 * math.pi)])
    add_effectors(doc, root, cloner, shot)
    return cloner


def hand_ring(root, units, shot):
    """The same ring built by hand: no effectors, but each name bobs on its own."""
    spin = null("Ring Spin", root)
    n = len(units)
    for i in reversed(range(n)):
        units[i].Remove()
        units[i].InsertUnder(spin)
    for i, unit in enumerate(units):
        phi = 2.0 * math.pi * i / n
        y = helix_y(i, shot)
        unit.SetRelPos(c4d.Vector(shot["ring_r"] * math.sin(phi), y, shot["ring_r"] * math.cos(phi)))
        set_keys(unit, rot_id("h"), [(0, 0.0), (FRAMES, -2.0 * math.pi)])
        set_keys(unit, pos_id("y"), cycle(y, shot["lift"] * 0.5, 1, phi))
    set_keys(spin, rot_id("h"), [(0, 0.0), (FRAMES, 2.0 * math.pi)])
    return spin


# ── SCENE ──────────────────────────────────────────────────────────────────

def clear_track(obj, desc_id):
    track = obj.FindCTrack(desc_id)
    if track is not None:
        track.Remove()


def make_ring(doc, root, units, shot):
    """Cloner if it passes the measurement, otherwise the hand ring. Either way
    the same 18 names end up in the same places, spinning the same way."""
    holder = null("Ring", root)
    why = ""
    try:
        headings, why = probe_cloner(doc, holder, shot)
        if headings is not None:
            cloner_ring(doc, holder, units, headings, shot)
            RING.append("MoGraph Cloner with effectors")
            return
    except Exception as err:
        why = "Cloner setup failed ({})".format(err)
    for unit in units:
        clear_track(unit, rot_id("h"))
    hand_ring(root, units, shot)
    holder.Remove()
    RING.append("hand-built ring (no Cloner)")
    SKIPPED.append("Cloner ring: " + why)


def build(doc):
    shot = SHOTS[MODE]
    root = c4d.BaseObject(c4d.Onull)
    root.SetName(GROUP_NAME)
    doc.InsertObject(root)

    label_mat = glow_material(doc, "ORB_Label", LABEL_BASE, LABEL_GLOW, 0.55)
    core_mat = glow_material(doc, "ORB_Core", CORE_BASE, CORE_GLOW, 1.2)
    rail_mat = glow_material(doc, "ORB_Rail", RAIL_BASE, RAIL_GLOW, 0.9)

    # Camera: a little above the ring, aimed at the centre, one slow arc and
    # one slow push per loop.
    orbit = null("Camera Orbit", root)
    cam = c4d.BaseObject(c4d.Ocamera)
    cam.SetName("Orbit Camera")
    put(cam, "CAMERA_FOCUS", FOCAL, "Focal Length")
    cam.SetRelPos(c4d.Vector(0, shot["cam_y"], -shot["dist"]))
    cam.InsertUnder(orbit)
    look = null("Look At", root)
    look.SetRelPos(c4d.Vector(0, shot["look_y"], 0))
    aim = c4d.BaseTag(c4d.Ttargetexpression)
    aim[c4d.TARGETEXPRESSIONTAG_LINK] = look
    cam.InsertTag(aim)
    set_keys(orbit, rot_id("h"), cycle(0.0, deg(6.0), 1))
    set_keys(cam, pos_id("z"), cycle(-shot["dist"], 60.0, 1, math.pi / 2.0))

    light("Key", c4d.Vector(-900, 1100, -1500), c4d.Vector(0.85, 0.88, 1.0), 1.0, root)
    light("Rim", c4d.Vector(1300, 500, 1200), c4d.Vector(0.7, 0.55, 1.0), 1.2, root)
    light("Core Glow", c4d.Vector(0, 0, 0), CORE_GLOW, 0.9, root)

    hole(doc, root, cam, shot)

    # The 18 names, one unit each: a null at the name's height holding its text.
    stage = null("Names", root)
    units, texts = [], []
    for i, name in enumerate(LABELS):
        unit = null("Name {}".format(i + 1), stage)
        unit.SetRelPos(c4d.Vector(0, helix_y(i, shot), 0))
        texts.append(text_object(name, wrap(name), shot["label_h"],
                                 shot["label_h"] * LABEL_DEPTH, unit, label_mat))
        units.append(unit)

    # The core, outside the ring: pulses and bobs once per loop.
    core = null("Core", root)
    core_text = text_object("Core Label", CORE, shot["core_h"],
                            shot["core_h"] * CORE_DEPTH, core, core_mat)
    for axis in "xyz":
        set_keys(core, scale_id(axis), cycle(1.0, 0.06, 1))
    set_keys(core, pos_id("y"), cycle(0.0, shot["core_h"] * 0.15, 1))

    centre(doc, texts + [core_text])
    make_ring(doc, stage, units, shot)

    for n, y in enumerate(rail_heights(shot)):
        rail("Rail {}".format("Top" if n else "Bottom"), y, shot, rail_mat, root)
    fog(doc, shot["dist"] * FOG_PER_DIST)
    return root, cam


def configure_document(doc, cam):
    shot = SHOTS[MODE]
    res_x, res_y = shot["res"]
    doc.SetFps(FPS)
    doc.SetMinTime(c4d.BaseTime(0, FPS))
    doc.SetMaxTime(c4d.BaseTime(FRAMES, FPS))
    doc.SetLoopMinTime(c4d.BaseTime(0, FPS))
    doc.SetLoopMaxTime(c4d.BaseTime(FRAMES, FPS))
    doc.SetTime(c4d.BaseTime(FRAMES // 3, FPS))      # open on a frame worth looking at

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
        put(rd, "RDATA_ALPHACHANNEL", False)
        put(rd, "RDATA_ANTIALIASING", const("RDATA_ANTIALIASING_BEST"), "Antialiasing")

    bd = doc.GetActiveBaseDraw()
    if bd is not None:
        bd.SetSceneCamera(cam)


def clear_previous(doc):
    obj = doc.GetFirstObject()
    while obj:
        nxt = obj.GetNext()
        if obj.GetName() in (GROUP_NAME, FOG_NAME):
            obj.Remove()
        obj = nxt
    mat = doc.GetFirstMaterial()
    while mat:
        nxt = mat.GetNext()
        if mat.GetName().startswith("ORB_"):
            mat.Remove()
        mat = nxt


def main():
    del SKIPPED[:]
    del RING[:]
    del _FONT[:]
    if MODE not in SHOTS:
        gui.MessageDialog("MODE must be one of: {}.".format(", ".join(sorted(SHOTS))))
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

    shot = SHOTS[MODE]
    over, worst = overlap_report(shot)
    print("Orbit built ({} shot, {})".format(MODE, RING[0]))
    print("  frame use {:.2f} (under 0.95 is clear)".format(fit_report(shot)))
    print("  names covering each other: {:.1f} on average, {} at worst (0 is clean)".format(over, worst))
    for line in SKIPPED:
        print("  skipped - " + line)
    gui.MessageDialog(
        "Orbit built: {}. {} setting(s) skipped{}.\n\n"
        "Save the file, then Shift+R to render.".format(
            RING[0], len(SKIPPED), " (see Console, Shift+F10)" if SKIPPED else ""))


if __name__ == "__main__":
    main()
