"""
BLACK HOLE STUDIOS — the logo intro that runs before the splash.

The Lyricist Pro badge arrives first: the painted black hole lights up, the
badge lands with a small overshoot, a bar of light crosses it, and then it
pushes past the lens. splash_c4d.py picks up from there, so the two cut
together with no gap.

WHAT YOU NEED: this script and the logo_tex folder (lyricist_logo.png,
logo_glow.png), made by scripts/logo_textures.py. Keep the folder next to this
script or next to your saved .c4d; if the script cannot find it, it asks you to
pick lyricist_logo.png.

RUN
  1. File -> New (start from an empty scene).
  2. Extensions -> Script Manager -> File -> Load Script -> this file -> Execute.
  3. Save the .c4d.
  4. Shift+R (Render to Picture Viewer). Frames go to logo/ next to the .c4d.

CUTTING IT TOGETHER
  This is 90 frames, splash_c4d.py is 150. Render both, then play logo/ first
  and splash/ straight after: 8 seconds in total at 30 fps. The last frame here
  is the badge gone and the frame black, which is where the splash opens.

IF IT CRASHES PART WAY: set START_FRAME below to the first missing frame, run
the script again, and Shift+R. Finished frames are kept.

AFTER RE-RUNNING logo_textures.py: just run this script again. It hands the
material a fresh copy of the image, so the new one shows up without restarting
Cinema 4D (C4D holds a texture in memory by file path for the whole session).

HOW IT'S BUILT
  badge     one plane wearing the logo. The material is Luminance only, so the
            art renders exactly as drawn, and the image's own alpha cuts the
            badge out of its square. No lights touch it.
  glow      a soft disc behind the badge, lined up with the painted black hole,
            that flares as the badge lands.
  sweep     the same disc squeezed into a bar, crossing the badge once.
  loop      this one does NOT loop: it is an intro and ends on black.
Standard renderer and Standard materials only (the renderer is set here).

Anything this version of Cinema 4D refuses is skipped and listed in the
Console (Extensions -> Console, Shift+F10) instead of stopping the script.
"""

import glob
import math
import os
import shutil
import tempfile

import c4d
from c4d import gui, storage, utils

# ── CONFIG ─────────────────────────────────────────────────────────────────

GROUP_NAME = "LYRICIST_LOGO_RIG"     # re-running the script replaces this group
TEX_FOLDER = "logo_tex"
LOGO_IMAGE = "lyricist_logo.png"
GLOW_IMAGE = "logo_glow.png"
OUTPUT_PATH = "logo/logo_"           # relative to the saved .c4d

RES_X, RES_Y = 1920, 1080
FPS = 30
FRAMES = 90                          # 3 s, then splash_c4d.py's 150
START_FRAME = 0                      # raise this to resume after a crash

# The badge. Height in scene units; the width follows the art's own shape so
# nothing is stretched. lyricist_logo.png is 605 x 660.
BADGE_H = 900.0
BADGE_ASPECT = 605.0 / 660.0

# Where the painted black hole sits inside the art, as a share of the badge
# from its middle: a little right of centre and a little low.
HOLE_X = 0.02
HOLE_Y = -0.06
GLOW_SIZE = 1.15                     # glow width, as a multiple of badge height

LAND = 34                            # frame the badge settles
SWEEP_FROM, SWEEP_TO = 52, 74        # the bar of light crosses
PUSH_FROM = 74                       # badge starts past the lens
OVERSHOOT = 1.6                      # how far the landing overshoots

CAM_DISTANCE = 1500.0
CAM_START = 1680.0                   # slow push-in from here
FOCAL = 50.0

BACKDROP = c4d.Vector(0.0, 0.0, 0.0)


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
    name = node.GetName() if hasattr(node, "GetName") else ""
    return name or node.__class__.__name__


def _find_by_label(node, label):
    """The parameter whose Attribute Manager label matches, or None."""
    try:
        desc = node.GetDescription(c4d.DESCFLAGS_DESC_NONE)
    except Exception:
        return None
    if desc is None:
        return None
    wanted = label.strip().lower()
    for bc, param, _ in desc:
        try:
            if str(bc[c4d.DESC_NAME]).strip().lower() == wanted:
                return param
        except Exception:
            continue
    return None


def _try(node, names, value):
    for name in names:
        pid = getattr(c4d, name, None)
        if pid is None:
            continue
        try:
            node[pid] = value
            return True
        except Exception:
            continue
    return False


def put(node, names, value, label=None, quiet=False):
    """Set one parameter by any of its known names, or its UI label."""
    if isinstance(names, str):
        names = (names,)
    what = names[0] if names else label
    if value is None:
        if not quiet:
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
    if not quiet:
        SKIPPED.append("{}: {}".format(_who(node), what))
    return False


def vec_id(param, axis):
    base = getattr(c4d, param, None)
    sub = {"x": c4d.VECTOR_X, "y": c4d.VECTOR_Y, "z": c4d.VECTOR_Z}[axis]
    if base is None:
        return None
    return c4d.DescID(c4d.DescLevel(base, c4d.DTYPE_VECTOR, 0),
                      c4d.DescLevel(sub, c4d.DTYPE_REAL, 0))


def pos_id(axis):
    return vec_id("ID_BASEOBJECT_REL_POSITION", axis)


def scale_id(axis):
    return vec_id("ID_BASEOBJECT_REL_SCALE", axis)


def rot_id(axis):
    return vec_id("ID_BASEOBJECT_REL_ROTATION",
                  {"h": "x", "p": "y", "b": "z"}[axis])


def set_keys(obj, desc_id, pairs):
    """Key a parameter at (frame, value) pairs. Skips rather than raising if
    this version has no such parameter."""
    if desc_id is None:
        SKIPPED.append("{}: a parameter this version does not have".format(_who(obj)))
        return
    track = obj.FindCTrack(desc_id)
    if track is None:
        track = c4d.CTrack(obj, desc_id)
        obj.InsertTrackSorted(track)
    curve = track.GetCurve()
    for frame, value in pairs:
        key = curve.AddKey(c4d.BaseTime(int(frame), FPS))
        if key is None or key.get("key") is None:
            continue
        key["key"].SetValue(curve, float(value))


def out_cubic(t):
    return 1.0 - (1.0 - t) ** 3


def out_back(t, s=1.5):
    t -= 1.0
    return t * t * ((s + 1.0) * t + s) + 1.0


def in_out_sine(t):
    return 0.5 - 0.5 * math.cos(math.pi * t)


def ease(f0, f1, v0, v1, curve, step=1):
    """(frame, value) pairs from v0 to v1, shaped by curve."""
    out = []
    span = max(1, int(f1 - f0))
    for i in range(0, span + 1, step):
        t = i / float(span)
        out.append((f0 + i, v0 + (v1 - v0) * curve(t)))
    if out[-1][0] != f1:
        out.append((f1, v1))
    return out


# ── TEXTURES ───────────────────────────────────────────────────────────────

FRESH_DIR = os.path.join(tempfile.gettempdir(), "lyricist_c4d_tex")


def fresh_copy(path):
    """Hand the shader a path Cinema 4D has not read before.

    Cinema 4D keeps a texture in memory keyed on its file path for the whole
    session, so regenerating the image and running this script again renders
    the OLD picture. The copy below is named after the source's timestamp and
    size: an unchanged image keeps the same name and costs nothing, a
    regenerated one gets a name C4D has never seen and is read fresh.
    """
    try:
        info = os.stat(path)
    except OSError:
        return path
    stem, ext = os.path.splitext(os.path.basename(path))
    copy = os.path.join(FRESH_DIR, "{}~{}-{}{}".format(
        stem, int(info.st_mtime), info.st_size, ext))
    if os.path.isfile(copy):
        return copy
    try:
        if not os.path.isdir(FRESH_DIR):
            os.makedirs(FRESH_DIR)
        shutil.copyfile(path, copy)
    except OSError:
        return path                  # read-only temp: fall back, stale but working
    for old in glob.glob(os.path.join(FRESH_DIR, stem + "~*" + ext)):
        if old != copy:
            try:
                os.remove(old)
            except OSError:
                pass
    return copy


def find_textures(doc):
    """The folder holding the logo: beside the script, beside the .c4d, or ask."""
    places = []
    script = globals().get("__file__")
    if script:
        places.append(os.path.join(os.path.dirname(os.path.abspath(script)), TEX_FOLDER))
    doc_dir = doc.GetDocumentPath()
    if doc_dir:
        places.append(os.path.join(doc_dir, TEX_FOLDER))
        places.append(doc_dir)
    for place in places:
        if os.path.isfile(os.path.join(place, LOGO_IMAGE)):
            return place
    picked = storage.LoadDialog(type=c4d.FILESELECTTYPE_IMAGES,
                                title="Where is {}?".format(LOGO_IMAGE))
    if picked and os.path.isfile(picked):
        return os.path.dirname(picked)
    return None


# ── MATERIALS ──────────────────────────────────────────────────────────────

def bitmap(mat, path):
    sh = c4d.BaseShader(c4d.Xbitmap)
    put(sh, "BITMAPSHADER_FILENAME", fresh_copy(path))
    mat.InsertShader(sh)
    return sh


def new_material(doc, name):
    mat = c4d.BaseMaterial(c4d.Mmaterial)
    mat.SetName(name)
    doc.InsertMaterial(mat)
    return mat


def image_material(doc, name, path):
    """Emits the image's colour; the image's own alpha cuts the shape out.
    Luminance only, so the art renders exactly as it was drawn."""
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


def tag(obj, mat):
    t = c4d.TextureTag()
    t.SetMaterial(mat)
    put(t, "TEXTURETAG_PROJECTION", const("TEXTURETAG_PROJECTION_UVW"))
    obj.InsertTag(t)


# ── OBJECTS ────────────────────────────────────────────────────────────────

def null(name, parent):
    obj = c4d.BaseObject(c4d.Onull)
    obj.SetName(name)
    if parent is not None:
        obj.InsertUnder(parent)
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


# ── THE SCENE ──────────────────────────────────────────────────────────────

def build(doc, tex):
    root = c4d.BaseObject(c4d.Onull)
    root.SetName(GROUP_NAME)
    doc.InsertObject(root)

    logo_path = os.path.join(tex, LOGO_IMAGE)
    glow_path = os.path.join(tex, GLOW_IMAGE)
    badge_w = BADGE_H * BADGE_ASPECT

    stage = null("Stage", root)

    # Glow, behind the badge, lined up with the painted black hole. It flares
    # as the badge lands and stays as a bed of light under it.
    has_glow = os.path.isfile(glow_path)
    glow = None
    if has_glow:
        glow_mat = image_material(doc, "LOGO_Glow", glow_path)
        size = BADGE_H * GLOW_SIZE
        glow = image_plane("Hole Glow", size, size, stage)
        glow.SetRelPos(c4d.Vector(badge_w * HOLE_X, BADGE_H * HOLE_Y, 40.0))
        tag(glow, glow_mat)
        set_keys(glow, scale_id("x"), ease(0, LAND, 0.15, 1.0, out_cubic))
        set_keys(glow, scale_id("y"), ease(0, LAND, 0.15, 1.0, out_cubic))
        # one slow breath after it lands, then a bloom as the badge leaves
        set_keys(glow, scale_id("z"), [(0, 1.0)])
        set_keys(glow, rot_id("b"), ease(0, FRAMES - 1, 0.0, deg(26.0), in_out_sine, step=3))

    # Badge: the logo itself, landing with a small overshoot.
    badge_mat = image_material(doc, "LOGO_Badge", logo_path)
    badge = image_plane("Lyricist Badge", badge_w, BADGE_H, stage)
    tag(badge, badge_mat)
    for axis in ("x", "y"):
        set_keys(badge, scale_id(axis),
                 ease(0, LAND, 0.0, 1.0, lambda t: out_back(t, OVERSHOOT), step=1))
    set_keys(badge, rot_id("b"),
             ease(0, LAND, deg(-9.0), 0.0, lambda t: out_back(t, 1.1), step=1))

    # Sweep: the glow squeezed into a bar of light, crossing the badge once.
    if has_glow:
        sweep_mat = image_material(doc, "LOGO_Sweep", glow_path)
        sweep = image_plane("Light Sweep", BADGE_H * 0.30, BADGE_H * 1.5, stage)
        sweep.SetRelPos(c4d.Vector(-badge_w, 0.0, -30.0))
        sweep.SetRelRot(c4d.Vector(0, 0, deg(-14.0)))
        tag(sweep, sweep_mat)
        set_keys(sweep, pos_id("x"),
                 [(0, -badge_w * 1.4), (SWEEP_FROM, -badge_w * 1.4),
                  (SWEEP_TO, badge_w * 1.4), (FRAMES - 1, badge_w * 1.4)])
        # flat until it is needed, so it never sits on the badge as a smear
        set_keys(sweep, scale_id("y"),
                 [(0, 0.0), (SWEEP_FROM - 1, 0.0), (SWEEP_FROM, 1.0),
                  (SWEEP_TO, 1.0), (SWEEP_TO + 1, 0.0)])

    # The hand-off: the whole stage pushes past the lens and the frame clears,
    # which is where splash_c4d.py opens.
    set_keys(stage, pos_id("z"),
             [(0, 0.0), (PUSH_FROM, 0.0)] +
             ease(PUSH_FROM, FRAMES - 1, 0.0, -CAM_DISTANCE * 1.15, out_cubic)[1:])
    for axis in ("x", "y"):
        set_keys(stage, scale_id(axis),
                 [(0, 1.0), (PUSH_FROM, 1.0)] +
                 ease(PUSH_FROM, FRAMES - 1, 1.0, 1.9, out_cubic)[1:])

    # Camera: a slow push in, so the badge is never still.
    cam = c4d.BaseObject(c4d.Ocamera)
    cam.SetName("Logo Camera")
    put(cam, "CAMERA_FOCUS", FOCAL, "Focal Length")
    cam.SetRelPos(c4d.Vector(0, 0, -CAM_START))
    cam.InsertUnder(root)
    set_keys(cam, pos_id("z"), ease(0, FRAMES - 1, -CAM_START, -CAM_DISTANCE,
                                    out_cubic, step=3))
    return root, cam


def configure_document(doc, cam):
    doc.SetFps(FPS)
    doc.SetMinTime(c4d.BaseTime(0, FPS))
    doc.SetMaxTime(c4d.BaseTime(FRAMES - 1, FPS))
    doc.SetLoopMinTime(c4d.BaseTime(0, FPS))
    doc.SetLoopMaxTime(c4d.BaseTime(FRAMES - 1, FPS))
    doc.SetTime(c4d.BaseTime(LAND, FPS))        # open on the badge, landed

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
        if mat.GetName().startswith("LOGO_"):
            mat.Remove()
        mat = nxt


def main():
    del SKIPPED[:]
    doc = c4d.documents.GetActiveDocument()
    tex = find_textures(doc)
    if not tex:
        gui.MessageDialog("Couldn't find {}. Run scripts/logo_textures.py, keep the "
                          "{} folder next to this script or your saved .c4d, and run "
                          "it again.".format(LOGO_IMAGE, TEX_FOLDER))
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

    print("Logo intro built, textures from {}".format(tex))
    for note in SKIPPED:
        print("  skipped - {}".format(note))
    gui.MessageDialog(
        "Logo intro built. {} setting(s) skipped.\n\n"
        "Save the .c4d, then Shift+R. Render splash_c4d.py too and play "
        "logo/ before splash/.".format(len(SKIPPED)))


if __name__ == "__main__":
    main()
