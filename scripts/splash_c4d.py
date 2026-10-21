"""
LYRICIST PRO — the opening splash, built by script, in Cinema 4D.

Molten blue, silver and black chrome. "LYRICIST PRO" spins in from deep space,
chrome gyroscope rings and a blue instrument ring turn behind it, the credit
lines flip in one by one, and a bar of light crosses the title at the end.

    LYRICIST PRO
    CHRISTOPHER FUNK
    FUNK AUDIO FLOW OPSEC
    AUSTIN, TEXAS

WHAT YOU NEED: this script and the splash_tex folder (splash_env.jpg,
splash_hud.png, splash_sweep.png). Keep the folder next to this script or next
to your saved .c4d; if the script can't find it, it asks you to pick
splash_env.jpg.

RUN
  1. File -> New (start from an empty scene).
  2. Extensions -> Script Manager -> File -> Load Script -> this file -> Execute.
     A popup says "Splash built" with a count of skipped settings.
  3. Save the .c4d.
  4. Shift+R (Render to Picture Viewer). Frames go to splash/ next to the .c4d.

IF IT CRASHES PART WAY: set START_FRAME below to the first missing frame, run
the script again, and Shift+R. Finished frames are kept.

HOW IT'S BUILT
Same rules that made the black hole work: the look is in images made by
scripts/splash_textures.py, and this script only builds shapes and moves them.
  metal     every letter and ring: near-black, with splash_env.jpg in the
            Environment channel, so the chrome reflection is the image itself
            and needs no sky or ray tracing. As the letters turn, the molten
            bands slide across them.
  rings     two chrome rings and one blue glowing ring, turning on different
            axes like a gyroscope.
  hud       a flat blue instrument dial behind everything, turning slowly.
  sweep     a soft vertical bar of light that crosses the title at the end.
Standard renderer (set here): Cinema 4D 2025+ starts in its other renderer,
which ignores these materials.

Anything this version of Cinema 4D refuses is skipped and listed in the
Console (Extensions -> Console, Shift+F10) instead of stopping the script.
"""

import math
import os

import c4d
from c4d import bitmaps, gui, storage, utils

# ── CONFIG ─────────────────────────────────────────────────────────────────

GROUP_NAME = "LYRICIST_SPLASH_RIG"   # re-running the script replaces this group
TEX_FOLDER = "splash_tex"
OUTPUT_PATH = "splash/splash_"       # relative to the saved .c4d

RES_X, RES_Y = 1920, 1080
FPS = 30
FRAMES = 150                         # 5 seconds
START_FRAME = 0                      # raise this to resume after a crash

TITLE = "LYRICIST PRO"
TITLE_HEIGHT = 150.0
TITLE_DEPTH = 40.0
TITLE_Y = 110.0

# text, letter height, y, depth, first frame of its flip
CREDITS = [
    ("CHRISTOPHER FUNK", 50.0, -60.0, 14.0, 70),
    ("FUNK AUDIO FLOW OPSEC", 36.0, -140.0, 10.0, 85),
    ("AUSTIN, TEXAS", 30.0, -205.0, 8.0, 100),
]
FLIP_FRAMES = 18

# Bold fonts to try, in order. Bahnschrift ships with Windows 10 and 11.
FONTS = ["Bahnschrift Bold", "Bahnschrift SemiBold", "Bahnschrift",
         "Arial Black", "Arial Bold", "Arial"]

TITLE_IN = 60                        # frame the title lands
TITLE_TURNS = 2.0                    # full spins on the way in
SWEEP_FROM, SWEEP_TO = 118, 140      # the bar of light crosses the title

CAM_DISTANCE = 2400.0
CAM_START = 2700.0                   # slow push-in from here
FOCAL = 50.0

METAL_BASE = c4d.Vector(0.02, 0.025, 0.035)
GLOW_BLUE = c4d.Vector(0.20, 0.60, 1.00)


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


def scale_id(axis):
    return vec_id(c4d.ID_BASEOBJECT_REL_SCALE, axis)


def rot_id(axis):
    """h = heading (turns about Y), p = pitch (about X), b = bank (about Z)."""
    return vec_id(c4d.ID_BASEOBJECT_REL_ROTATION, {"h": "x", "p": "y", "b": "z"}[axis])


def set_keys(obj, desc_id, pairs):
    """Linear keys. Eased moves are baked as many small linear steps, which
    plays the same in every version and never overshoots by surprise."""
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


def out_cubic(t):
    return 1.0 - (1.0 - t) ** 3


def out_back(t, s=1.5):
    t -= 1.0
    return 1.0 + (s + 1.0) * t ** 3 + s * t ** 2


def in_out_sine(t):
    return 0.5 - 0.5 * math.cos(math.pi * t)


def ease(f0, f1, v0, v1, curve, step=1):
    """(frame, value) pairs from f0 to f1 along an easing curve."""
    out = []
    span = max(1, f1 - f0)
    frame = f0
    while frame < f1:
        out.append((frame, v0 + (v1 - v0) * curve((frame - f0) / float(span))))
        frame += step
    out.append((f1, v1))
    return out


def pop_in(obj, at, grow=1):
    """Hidden (scale ~0) until `at`, full size from `at + grow`."""
    for axis in "xyz":
        set_keys(obj, scale_id(axis), [(0, 0.001), (max(0, at - 1), 0.001), (at + grow, 1.0)])


# ── MATERIALS ──────────────────────────────────────────────────────────────

def find_textures(doc):
    """The folder holding splash_env.jpg: beside the script, beside the .c4d, or ask."""
    places = []
    script = globals().get("__file__")
    if script:
        places.append(os.path.join(os.path.dirname(script), TEX_FOLDER))
    doc_dir = doc.GetDocumentPath()
    if doc_dir:
        places.append(os.path.join(doc_dir, TEX_FOLDER))
        places.append(doc_dir)
    for place in places:
        if os.path.isfile(os.path.join(place, "splash_env.jpg")):
            return place
    picked = storage.LoadDialog(type=c4d.FILESELECTTYPE_IMAGES,
                                title="Where is splash_env.jpg?")
    if picked and os.path.isfile(picked):
        return os.path.dirname(picked)
    return None


def bitmap(mat, path):
    sh = c4d.BaseShader(c4d.Xbitmap)
    put(sh, "BITMAPSHADER_FILENAME", path)
    mat.InsertShader(sh)
    return sh


def new_material(doc, name):
    mat = c4d.BaseMaterial(c4d.Mmaterial)
    mat.SetName(name)
    doc.InsertMaterial(mat)
    return mat


def metal_material(doc, env_path):
    """Molten chrome: a dark body that shows the reflection image."""
    mat = new_material(doc, "SPL_Metal")
    put(mat, "MATERIAL_USE_COLOR", True)
    put(mat, "MATERIAL_COLOR_COLOR", METAL_BASE)
    put(mat, "MATERIAL_USE_LUMINANCE", False)
    put(mat, "MATERIAL_USE_ENVIRONMENT", True, "Environment")
    put(mat, "MATERIAL_ENVIRONMENT_SHADER", bitmap(mat, env_path))
    put(mat, "MATERIAL_ENVIRONMENT_BRIGHTNESS", 1.0)
    mat.Update(True, True)
    return mat


def glow_material(doc):
    mat = new_material(doc, "SPL_Glow")
    put(mat, "MATERIAL_USE_COLOR", False)
    put(mat, "MATERIAL_USE_REFLECTION", False)
    put(mat, "MATERIAL_USE_LUMINANCE", True)
    put(mat, "MATERIAL_LUMINANCE_COLOR", GLOW_BLUE)
    mat.Update(True, True)
    return mat


def image_material(doc, name, path):
    """Emits the image's colour; the image's own alpha cuts the shape out."""
    mat = new_material(doc, name)
    put(mat, "MATERIAL_USE_COLOR", False)
    put(mat, "MATERIAL_USE_REFLECTION", False)
    put(mat, "MATERIAL_USE_LUMINANCE", True)
    put(mat, "MATERIAL_LUMINANCE_SHADER", bitmap(mat, path))
    put(mat, "MATERIAL_USE_ALPHA", True)
    put(mat, "MATERIAL_ALPHA_SHADER", bitmap(mat, path))
    put(mat, "MATERIAL_ALPHA_IMAGEALPHA", True, "Image Alpha")
    put(mat, "MATERIAL_ALPHA_SOFT", True, "Soft")
    mat.Update(True, True)
    return mat


def tag(obj, mat, projection=None):
    t = c4d.TextureTag()
    t.SetMaterial(mat)
    put(t, "TEXTURETAG_PROJECTION",
        projection if projection is not None else const("TEXTURETAG_PROJECTION_UVW"))
    obj.InsertTag(t)


def smooth(obj, angle=40.0):
    """Phong tag: script-made objects don't get one, and chrome shows facets."""
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
                print("Splash font: " + name)
                break
    except Exception:
        found = None
    if found is None:
        SKIPPED.append("Text: bold font (using the default font)")
    _FONT.append(found)
    return found


def metal_text(doc, name, text, height, depth, parent, mat):
    """Extruded text, centred on its parent so it spins about its middle."""
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
    try:
        doc.ExecutePasses(None, False, False, True, c4d.BUILDFLAGS_NONE)
    except Exception:
        try:
            doc.ExecutePasses(None, False, False, True, 0)
        except Exception:
            pass
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


def ring(name, radius, thickness, parent, mat):
    obj = c4d.BaseObject(c4d.Otorus)
    obj.SetName(name)
    put(obj, ("PRIM_TORUS_OUTRAD", "PRIM_TORUS_OUTERRAD"), radius, "Ring Radius")
    put(obj, "PRIM_TORUS_INNERRAD", thickness, "Pipe Radius")
    put(obj, "PRIM_TORUS_SEG", 128, "Ring Segments")
    put(obj, "PRIM_TORUS_CSUB", 16, "Pipe Segments")
    put(obj, "PRIM_AXIS", const("PRIM_AXIS_ZP"), "Orientation")   # faces the camera
    obj.InsertUnder(parent)
    tag(obj, mat)
    smooth(obj, 80.0)
    return obj


def image_plane(name, width, height, parent):
    plane = c4d.BaseObject(c4d.Oplane)
    plane.SetName(name)
    put(plane, "PRIM_PLANE_WIDTH", width, "Width")
    put(plane, "PRIM_PLANE_HEIGHT", height, "Height")
    put(plane, "PRIM_PLANE_SUBW", 1, "Width Segments")
    put(plane, "PRIM_PLANE_SUBH", 1, "Height Segments")
    put(plane, "PRIM_AXIS", const("PRIM_AXIS_ZN"), "Orientation")   # faces the camera
    plane.InsertUnder(parent)
    return plane


def light(name, pos, colour, brightness, parent):
    obj = c4d.BaseObject(c4d.Olight)
    obj.SetName(name)
    put(obj, "LIGHT_COLOR", colour, "Color")
    put(obj, "LIGHT_BRIGHTNESS", brightness, "Intensity")
    obj.SetRelPos(pos)
    obj.InsertUnder(parent)
    return obj


# ── THE SCENE ──────────────────────────────────────────────────────────────

def build(doc, tex):
    root = c4d.BaseObject(c4d.Onull)
    root.SetName(GROUP_NAME)
    doc.InsertObject(root)
    last = FRAMES - 1

    metal = metal_material(doc, os.path.join(tex, "splash_env.jpg"))
    glow = glow_material(doc)

    # Camera: straight on, a slow push-in for the whole shot.
    cam = c4d.BaseObject(c4d.Ocamera)
    cam.SetName("Splash Camera")
    put(cam, "CAMERA_FOCUS", FOCAL, "Focal Length")
    cam.SetRelPos(c4d.Vector(0, 0, -CAM_START))
    cam.InsertUnder(root)
    set_keys(cam, pos_id("z"), ease(0, last, -CAM_START, -CAM_DISTANCE, out_cubic, 3))

    # Lights only add highlights; the chrome look comes from the image.
    light("Key", c4d.Vector(-900, 900, -1600), c4d.Vector(1, 1, 1), 1.0, root)
    light("Blue Rim", c4d.Vector(1200, 400, 800), c4d.Vector(0.3, 0.6, 1.0), 1.4, root)

    # HUD dial, far back, turning slowly.
    hud_pivot = null("HUD", root)
    hud_pivot.SetRelPos(c4d.Vector(0, 40, 700))
    hud = image_plane("HUD Dial", 1100, 1100, hud_pivot)
    tag(hud, image_material(doc, "SPL_HUD", os.path.join(tex, "splash_hud.png")))
    set_keys(hud, rot_id("b"), [(0, 0.0), (last, deg(-40))])
    for axis in "xyz":
        set_keys(hud_pivot, scale_id(axis), ease(4, 34, 0.001, 1.0, out_back, 2))

    # Gyroscope: two chrome rings and a blue one, each on its own axis.
    gyro = null("Gyroscope", root)
    gyro.SetRelPos(c4d.Vector(0, 40, 250))
    outer = ring("Ring Outer", 440, 6, gyro, metal)
    inner = ring("Ring Inner", 400, 4, gyro, metal)
    halo = ring("Ring Glow", 470, 1.6, gyro, glow)
    outer.SetRelRot(c4d.Vector(deg(20), 0, 0))
    set_keys(outer, rot_id("p"), ease(0, last, deg(-160), deg(70), out_cubic, 3))
    set_keys(inner, rot_id("h"), ease(0, last, deg(200), deg(-35), out_cubic, 3))
    set_keys(halo, rot_id("p"), ease(0, last, deg(90), deg(64), out_cubic, 3))
    for axis in "xyz":
        set_keys(gyro, scale_id(axis), ease(0, 30, 0.001, 1.0, out_back, 2))

    # Title: from far back, spinning, lands with a small overshoot, then
    # drifts a few degrees so the molten bands keep moving across it.
    title_pivot = null("Title", root)
    title_pivot.SetRelPos(c4d.Vector(0, TITLE_Y, 0))
    title = metal_text(doc, "LYRICIST PRO", TITLE, TITLE_HEIGHT, TITLE_DEPTH, title_pivot, metal)
    set_keys(title_pivot, pos_id("z"), ease(0, TITLE_IN - 10, 4000.0, 0.0, out_cubic, 2))
    spin = ease(0, TITLE_IN, deg(360.0 * TITLE_TURNS), 0.0, lambda t: out_back(t, 0.6), 1)
    drift = ease(TITLE_IN, last, 0.0, deg(-12.0), in_out_sine, 3)
    set_keys(title_pivot, rot_id("h"), spin + drift)

    # Credits flip in on X one after another.
    texts = [title]
    for words, height, y, depth, start in CREDITS:
        pivot = null(words.title(), root)
        pivot.SetRelPos(c4d.Vector(0, y, 0))
        texts.append(metal_text(doc, words.title(), words, height, depth, pivot, metal))
        pop_in(pivot, start)
        set_keys(pivot, rot_id("p"), ease(start, start + FLIP_FRAMES, deg(-90), 0.0, out_back, 1))

    # Bar of light across the title near the end.
    sweep_pivot = null("Light Sweep", root)
    sweep_pivot.SetRelPos(c4d.Vector(-1400, TITLE_Y - 40, -150))
    sweep_pivot.SetRelRot(c4d.Vector(0, 0, deg(-12)))
    sweep = image_plane("Sweep", 260, 900, sweep_pivot)
    tag(sweep, image_material(doc, "SPL_Sweep", os.path.join(tex, "splash_sweep.png")))
    set_keys(sweep_pivot, pos_id("x"), ease(SWEEP_FROM, SWEEP_TO, -1400.0, 1400.0, in_out_sine, 1))

    centre(doc, texts)
    return root, cam


def configure_document(doc, cam):
    doc.SetFps(FPS)
    doc.SetMinTime(c4d.BaseTime(0, FPS))
    doc.SetMaxTime(c4d.BaseTime(FRAMES - 1, FPS))
    doc.SetLoopMinTime(c4d.BaseTime(0, FPS))
    doc.SetLoopMaxTime(c4d.BaseTime(FRAMES - 1, FPS))
    doc.SetTime(c4d.BaseTime(FRAMES - 1, FPS))       # open on the finished frame

    rd = doc.GetActiveRenderData()
    if rd is not None:
        put(rd, "RDATA_RENDERENGINE", const("RDATA_RENDERENGINE_STANDARD"))
        put(rd, "RDATA_XRES", float(RES_X))
        put(rd, "RDATA_YRES", float(RES_Y))
        put(rd, "RDATA_FILMASPECT", RES_X / float(RES_Y), "Film Aspect")
        put(rd, "RDATA_FRAMERATE", float(FPS))
        put(rd, "RDATA_FRAMESEQUENCE", const("RDATA_FRAMESEQUENCE_MANUAL"))
        put(rd, "RDATA_FRAMEFROM", c4d.BaseTime(max(0, min(START_FRAME, FRAMES - 1)), FPS))
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
        if obj.GetName() == GROUP_NAME:
            obj.Remove()
        obj = nxt
    mat = doc.GetFirstMaterial()
    while mat:
        nxt = mat.GetNext()
        if mat.GetName().startswith("SPL_"):
            mat.Remove()
        mat = nxt


def main():
    del SKIPPED[:]
    del _FONT[:]
    doc = c4d.documents.GetActiveDocument()
    tex = find_textures(doc)
    if not tex:
        gui.MessageDialog("Couldn't find splash_env.jpg. Put the {} folder next to "
                          "this script or your saved .c4d and run it again.".format(TEX_FOLDER))
        return

    doc.StartUndo()
    try:
        clear_previous(doc)
        root, cam = build(doc, tex)
        configure_document(doc, cam)
        undo_new = const("UNDOTYPE_NEWOBJ", "UNDOTYPE_NEW")
        if undo_new is not None:
            doc.AddUndo(undo_new, root)
    finally:
        doc.EndUndo()
        c4d.EventAdd()

    print("Lyricist Pro splash built, textures from {}".format(tex))
    for line in SKIPPED:
        print("  skipped - " + line)
    gui.MessageDialog(
        "Splash built. {} setting(s) skipped{}.\n\n"
        "Save the file, then Shift+R to render.".format(
            len(SKIPPED), " (see Console, Shift+F10)" if SKIPPED else ""))


if __name__ == "__main__":
    main()
