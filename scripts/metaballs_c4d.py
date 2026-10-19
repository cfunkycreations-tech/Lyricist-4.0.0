"""
LYRICIST PRO — liquid metaballs, built by script, in Cinema 4D.

Twelve blue chrome droplets circle the middle, pull together into one liquid
mass at the halfway mark, then pour apart again. The camera orbits the whole
time. It loops cleanly, so it works as a background under the app clips.

WHAT YOU NEED: this script. If the splash_tex folder (splash_env.jpg) is next
to the script or your saved .c4d, the droplets get the chrome reflection from
it. If not, they get a plain glossy blue and nothing stops.

RUN
  1. File -> New (start from an empty scene).
  2. Extensions -> Script Manager -> File -> Load Script -> this file -> Execute.
     A popup says "Metaballs built" with a count of skipped settings.
  3. Scrub to frame 90. One merged blob means it worked.
  4. Save the .c4d.
  5. Shift+R (Render to Picture Viewer). Frames go to metaballs/ next to the .c4d.

IF IT CRASHES PART WAY: set START_FRAME below to the first missing frame, run
the script again, and Shift+R. Finished frames are kept.

IF THE BLOB LOOKS TOO SMALL OR TOO LUMPY: change HULL (bigger = fatter, merges
sooner) or BLOB_RADIUS and run it again. It replaces its own group.

HOW IT'S BUILT
  Metaball object   the liquid. It fuses whatever sits under it into one skin.
  droplets          twelve children on looped orbits. Their distance from the
                    middle swings far -> near -> far, so they fuse and split.
  camera pivot      a null that turns one full circle; the camera rides on it.
  metal             dark blue body with the reflection image in Environment.
Standard renderer and Standard materials only (the renderer is set here).

The Metaball object builds its skin from child objects, and the way it reads
them differs between versions. The script tries three ways in order (nulls with
a Metaball tag, spheres with a tag, plain spheres), keeps the first that
produces a surface, and prints which one in the Console (Shift+F10).

Anything this version of Cinema 4D refuses is skipped and listed in the
Console instead of stopping the script.
"""

import math
import os

import c4d
from c4d import gui, storage, utils

# ── CONFIG ─────────────────────────────────────────────────────────────────

GROUP_NAME = "LYRICIST_METABALLS_RIG"   # re-running the script replaces this group
TEX_FOLDER = "splash_tex"
OUTPUT_PATH = "metaballs/metaballs_"    # relative to the saved .c4d

RES_X, RES_Y = 1920, 1080
FPS = 30
FRAMES = 180                            # 6 seconds, loops
START_FRAME = 0                         # raise this to resume after a crash

BLOBS = 12
BLOB_RADIUS = 70.0                      # average droplet radius
RING_FAR = 380.0                        # how far apart they swing
RING_NEAR = 18.0                        # how tight they pull together
HEIGHT_SWING = 110.0                    # up-and-down wobble
HULL = 1.0                              # Metaball hull value (fatter above 1)
EDITOR_SUB = 6.0                        # skin detail in the viewport
RENDER_SUB = 3.0                        # skin detail in the render (smaller = finer)

CAM_DISTANCE = 1500.0
CAM_HEIGHT = 220.0
FOCAL = 50.0

BODY = c4d.Vector(0.02, 0.07, 0.20)
RIM_BLUE = c4d.Vector(0.30, 0.60, 1.00)


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
    """Linear keys, baked in small steps so every version plays them the same."""
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


def orbit_keys(obj, index):
    """Looped orbit for one droplet. Whole-number turns and a squared sine for
    the pull-in make the last frame meet the first, so the clip loops."""
    turns = (1, -1, 2, -2, 3, -3)[index % 6]
    phase = 2.0 * math.pi * index / BLOBS
    lift = 1 + (index % 3)                       # 1, 2 or 3 bobs per loop
    last = FRAMES
    xs, ys, zs = [], [], []
    for frame in range(0, last + 1, 3):
        t = frame / float(last)
        pull = math.sin(math.pi * t) ** 2        # 0 at the ends, 1 at the middle
        ring = RING_FAR + (RING_NEAR - RING_FAR) * pull
        angle = phase + 2.0 * math.pi * turns * t
        xs.append((frame, ring * math.cos(angle)))
        zs.append((frame, ring * math.sin(angle)))
        ys.append((frame, HEIGHT_SWING * (1.0 - pull)
                   * math.sin(2.0 * math.pi * lift * t + phase)))
    for axis, pairs in (("x", xs), ("y", ys), ("z", zs)):
        set_keys(obj, pos_id(axis), pairs)


# ── MATERIAL ───────────────────────────────────────────────────────────────

def find_env():
    """splash_env.jpg beside the script or the .c4d, or None. Never asks."""
    places = []
    script = globals().get("__file__")
    if script:
        places.append(os.path.join(os.path.dirname(script), TEX_FOLDER))
    doc_dir = c4d.documents.GetActiveDocument().GetDocumentPath()
    if doc_dir:
        places.append(os.path.join(doc_dir, TEX_FOLDER))
        places.append(doc_dir)
    for place in places:
        path = os.path.join(place, "splash_env.jpg")
        if os.path.isfile(path):
            return path
    return None


def new_material(doc, name):
    mat = c4d.BaseMaterial(c4d.Mmaterial)
    mat.SetName(name)
    doc.InsertMaterial(mat)
    return mat


def metal_material(doc, env_path):
    """Dark blue liquid metal. With the image it reflects the molten bands;
    without it, the material's own gloss still reads as wet."""
    mat = new_material(doc, "MET_Liquid")
    put(mat, "MATERIAL_USE_COLOR", True)
    put(mat, "MATERIAL_COLOR_COLOR", BODY)
    put(mat, "MATERIAL_USE_LUMINANCE", False)
    if env_path:
        sh = c4d.BaseShader(c4d.Xbitmap)
        put(sh, "BITMAPSHADER_FILENAME", env_path)
        mat.InsertShader(sh)
        put(mat, "MATERIAL_USE_ENVIRONMENT", True, "Environment")
        put(mat, "MATERIAL_ENVIRONMENT_SHADER", sh)
        put(mat, "MATERIAL_ENVIRONMENT_BRIGHTNESS", 1.0)
    else:
        put(mat, "MATERIAL_USE_SPECULAR", True, quiet=True)
    mat.Update(True, True)
    return mat


def texture_tag(obj, mat):
    t = c4d.TextureTag()
    t.SetMaterial(mat)
    put(t, "TEXTURETAG_PROJECTION", const("TEXTURETAG_PROJECTION_SPHERICAL",
                                          "TEXTURETAG_PROJECTION_UVW"))
    obj.InsertTag(t)


# ── SHAPES ─────────────────────────────────────────────────────────────────

def null(name, parent=None):
    obj = c4d.BaseObject(c4d.Onull)
    obj.SetName(name)
    if parent is not None:
        obj.InsertUnder(parent)
    return obj


def light(name, pos, colour, brightness, parent):
    obj = c4d.BaseObject(c4d.Olight)
    obj.SetName(name)
    put(obj, "LIGHT_COLOR", colour, "Color")
    put(obj, "LIGHT_BRIGHTNESS", brightness, "Intensity")
    obj.SetRelPos(pos)
    obj.InsertUnder(parent)
    return obj


def metaball_object():
    """The Metaball generator, or None when this build has no such object."""
    kind = const("Ometaball")
    if kind is None:
        return None
    obj = c4d.BaseObject(kind)
    if obj is None:
        return None
    obj.SetName("Liquid")
    put(obj, "METABALLOBJECT_HULL", HULL, "Hull Value")
    put(obj, "METABALLOBJECT_SUBEDITOR", EDITOR_SUB, "Editor Subdivision")
    put(obj, "METABALLOBJECT_SUBRAY", RENDER_SUB, "Render Subdivision")
    return obj


def droplet(index, mode):
    """One child of the Metaball. mode = (shape, tagged)."""
    shape, tagged = mode
    radius = BLOB_RADIUS * (0.75 + 0.5 * ((index * 7) % 5) / 4.0)
    if shape == "sphere":
        obj = c4d.BaseObject(c4d.Osphere)
        put(obj, "PRIM_SPHERE_RAD", radius, "Radius", quiet=True)
        put(obj, "PRIM_SPHERE_SUB", 6, "Segments", quiet=True)
    else:
        obj = c4d.BaseObject(c4d.Onull)
    obj.SetName("Droplet {:02d}".format(index + 1))
    if tagged:
        kind = const("Tmetaball", "Tmetaballtag", "Tmetaball_tag")
        t = obj.MakeTag(kind) if kind is not None else None
        if t is not None:
            put(t, "METABALLTAG_RADIUS", radius, "Radius", quiet=True)
            put(t, "METABALLTAG_STRENGTH", 1.0, "Strength", quiet=True)
        else:
            return None
    orbit_keys(obj, index)
    return obj


# ── THE SCENE ──────────────────────────────────────────────────────────────

def skin_points(meta):
    """How many points the Metaball's built surface has (0 = empty)."""
    cache = meta.GetCache() or meta.GetDeformCache()
    if cache is None:
        return 0
    try:
        return cache.GetPointCount()
    except Exception:
        pass
    sub = cache.GetDown()
    total = 0
    while sub:
        try:
            total += sub.GetPointCount()
        except Exception:
            pass
        sub = sub.GetNext()
    return total


def refresh(doc):
    try:
        doc.ExecutePasses(None, True, True, True, c4d.BUILDFLAGS_NONE)
    except Exception:
        try:
            doc.ExecutePasses(None, True, True, True, 0)
        except Exception:
            pass


MODES = [("null", True), ("sphere", True), ("sphere", False)]


def build_liquid(doc, root, mat):
    """Try each way of feeding the Metaball until one grows a surface."""
    for mode in MODES:
        meta = metaball_object()
        if meta is None:
            SKIPPED.append("Metaball object (not in this version)")
            return None
        kids = [droplet(i, mode) for i in range(BLOBS)]
        if any(k is None for k in kids):
            continue
        for kid in kids:
            kid.InsertUnder(meta)
        meta.InsertUnder(root)
        refresh(doc)
        points = skin_points(meta)
        if points > 0:
            print("Metaballs: {} on {} ({} points)".format(
                "tagged" if mode[1] else "plain", mode[0] + "s", points))
            texture_tag(meta, mat)
            return meta
        meta.Remove()
    SKIPPED.append("Liquid: the Metaball made no surface (see the Console)")
    return None


def build(doc, env_path):
    root = null(GROUP_NAME)
    doc.InsertObject(root)
    mat = metal_material(doc, env_path)

    build_liquid(doc, root, mat)

    # Camera on a pivot that turns once around the middle.
    pivot = null("Camera Pivot", root)
    cam = c4d.BaseObject(c4d.Ocamera)
    cam.SetName("Metaballs Camera")
    put(cam, "CAMERA_FOCUS", FOCAL, "Focal Length")
    cam.SetRelPos(c4d.Vector(0, CAM_HEIGHT, -CAM_DISTANCE))
    cam.SetRelRot(c4d.Vector(0, math.atan2(CAM_HEIGHT, CAM_DISTANCE), 0))
    cam.InsertUnder(pivot)
    set_keys(pivot, rot_id("h"), [(0, 0.0), (FRAMES, deg(360.0))])

    light("Key", c4d.Vector(-900, 900, -1200), c4d.Vector(1, 1, 1), 1.0, root)
    light("Blue Rim", c4d.Vector(1100, 300, 900), RIM_BLUE, 1.3, root)
    return root, cam


def configure_document(doc, cam):
    last = FRAMES - 1                    # frame FRAMES is frame 0 again
    doc.SetFps(FPS)
    doc.SetMinTime(c4d.BaseTime(0, FPS))
    doc.SetMaxTime(c4d.BaseTime(last, FPS))
    doc.SetLoopMinTime(c4d.BaseTime(0, FPS))
    doc.SetLoopMaxTime(c4d.BaseTime(last, FPS))
    doc.SetTime(c4d.BaseTime(FRAMES // 2, FPS))      # open on the merged blob

    rd = doc.GetActiveRenderData()
    if rd is not None:
        put(rd, "RDATA_RENDERENGINE", const("RDATA_RENDERENGINE_STANDARD"))
        put(rd, "RDATA_XRES", float(RES_X))
        put(rd, "RDATA_YRES", float(RES_Y))
        put(rd, "RDATA_FILMASPECT", RES_X / float(RES_Y), "Film Aspect")
        put(rd, "RDATA_FRAMERATE", float(FPS))
        put(rd, "RDATA_FRAMESEQUENCE", const("RDATA_FRAMESEQUENCE_MANUAL"))
        put(rd, "RDATA_FRAMEFROM", c4d.BaseTime(max(0, min(START_FRAME, last)), FPS))
        put(rd, "RDATA_FRAMETO", c4d.BaseTime(last, FPS))
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
        if mat.GetName().startswith("MET_"):
            mat.Remove()
        mat = nxt


def main():
    del SKIPPED[:]
    doc = c4d.documents.GetActiveDocument()
    env_path = find_env()

    doc.StartUndo()
    try:
        clear_previous(doc)
        root, cam = build(doc, env_path)
        configure_document(doc, cam)
        undo_new = const("UNDOTYPE_NEWOBJ", "UNDOTYPE_NEW")
        if undo_new is not None:
            doc.AddUndo(undo_new, root)
    finally:
        doc.EndUndo()
        c4d.EventAdd()

    print("Lyricist Pro metaballs built, reflection image: {}".format(env_path or "none"))
    for line in SKIPPED:
        print("  skipped - " + line)
    gui.MessageDialog(
        "Metaballs built. {} setting(s) skipped{}.\n\n"
        "Scrub to frame 90 for the merged blob. Save, then Shift+R to render.".format(
            len(SKIPPED), " (see Console, Shift+F10)" if SKIPPED else ""))


if __name__ == "__main__":
    main()
