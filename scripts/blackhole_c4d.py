"""
BLACK HOLE STUDIOS — a black hole, built by script, in Cinema 4D.

WHAT YOU NEED: this script and the blackhole_tex folder (bh_disc.png,
bh_halo.png). Keep the folder next to this script or next to your saved .c4d;
if the script can't find it, it asks you to point at bh_disc.png.

RUN: Extensions → Script Manager → open or paste this → Execute.
RENDER: save the .c4d, then Shift+R (Render to Picture Viewer). The frames are
written to bh_header/ next to the .c4d.

HOW IT'S BUILT, AND WHY THIS WAY
The first version drew the disc with Cinema 4D's procedural shaders (gradient,
noise, fusion). Those map differently from version to version, and it rendered
a solid orange planet, then crashed. Now the look lives in two images made by
scripts/blackhole_textures.py and previewed before they ever reach C4D, and
this script only does the 3D: a black sphere, two flat planes with those
images on them, a camera, and the spin. No lights, no sky, no volumetrics, no
procedural shaders — nothing that can render differently or fall over.

  horizon   a pure black sphere. The hole is the absence of light.
  disc      a flat plane lying in the disc's orbit, carrying bh_disc.png:
            white-hot inner edge, amber, ember, dying red, streaks running
            around the orbit so the spin reads.
  halo      a plane that always faces the camera, carrying bh_halo.png: the
            lensed far side of the disc arcing round the shadow, and the thin
            white-hot photon ring right at its edge.

It renders with the Standard engine (set here): Cinema 4D 2025+ starts new
scenes in Redshift, which ignores Standard materials and renders nothing.

Anything this version of Cinema 4D refuses is skipped and listed in the
Console (Extensions → Console, Shift+F10) instead of stopping the script.
"""

import math
import os

import c4d
from c4d import gui, storage, utils

# ── CONFIG ─────────────────────────────────────────────────────────────────

GROUP_NAME = "BLACK_HOLE_RIG"      # re-running the script replaces this group

# "header": the art for the Black Hole Studios tab. Square, transparent
#           background, a seamless loop, PNG sequence with alpha.
# "hero":   1920x1080 with a slow camera drift (does not loop).
MODE = "header"
HEADER_RES = 720
OUTPUT_PATH = "bh_header/bh_"      # relative to the saved .c4d
TEX_FOLDER = "blackhole_tex"

# Sizes match the textures: bh_disc.png's inner edge sits at 0.33 of its
# half-width and bh_halo.png's shadow edge at 0.5 of its. Change one, change
# the other (scripts/blackhole_textures.py takes both as arguments).
HORIZON_RADIUS = 100.0
DISC_OUTER = 460.0                 # half-width of the disc plane
HALO_OUTER = 200.0                 # half-width of the halo plane = 2 x horizon

VIEW_ANGLE = 12.0                  # camera height above the disc, degrees
CAM_DISTANCE = 1400.0
FOCAL = 58.0                       # mm; 58 frames the whole disc at 720x720

FRAMES = 300                       # 10 s at 30 fps
FPS = 30
DISC_TURNS = 1.0                   # disc rotations per loop
CAM_ORBIT_DEG = 24.0               # hero mode only

RES_X, RES_Y = 1920, 1080          # hero mode


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


def put(node, names, value, label=None):
    """Set one parameter by any of its known names, or its UI label."""
    if isinstance(names, str):
        names = (names,)
    what = names[0] if names else label
    if value is None:
        SKIPPED.append("{}: {} (not in this version)".format(_who(node), what))
        return False
    for name in names:
        param = getattr(c4d, name, None)
        if param is None:
            continue
        try:
            node[param] = value
            return True
        except Exception:
            continue
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


def set_keys(obj, desc_id, pairs):
    """Key one value, linear, so the loop has no ease-in/ease-out hitch."""
    track = obj.FindCTrack(desc_id)
    if track is None:
        track = c4d.CTrack(obj, desc_id)
        obj.InsertTrackSorted(track)
    curve = track.GetCurve()
    for frame, value in pairs:
        added = curve.AddKey(c4d.BaseTime(frame, FPS))
        if added is None:
            continue
        key = added["key"]
        key.SetValue(curve, value)
        key.SetInterpolation(curve, c4d.CINTERPOLATION_LINEAR)


def rotation_id(axis):
    sub = {"h": c4d.VECTOR_X, "p": c4d.VECTOR_Y, "b": c4d.VECTOR_Z}[axis]
    return c4d.DescID(
        c4d.DescLevel(c4d.ID_BASEOBJECT_REL_ROTATION, c4d.DTYPE_VECTOR, 0),
        c4d.DescLevel(sub, c4d.DTYPE_REAL, 0),
    )


# ── TEXTURES ───────────────────────────────────────────────────────────────

def find_textures(doc):
    """The folder holding bh_disc.png: beside the script, beside the .c4d, or ask."""
    places = []
    script = globals().get("__file__")
    if script:
        places.append(os.path.join(os.path.dirname(script), TEX_FOLDER))
    doc_dir = doc.GetDocumentPath()
    if doc_dir:
        places.append(os.path.join(doc_dir, TEX_FOLDER))
        places.append(doc_dir)
    for place in places:
        if os.path.isfile(os.path.join(place, "bh_disc.png")):
            return place
    picked = storage.LoadDialog(type=c4d.FILESELECTTYPE_IMAGES,
                                title="Where is bh_disc.png?")
    if picked and os.path.isfile(picked):
        return os.path.dirname(picked)
    return None


def image_material(doc, name, path):
    """Emits the image's colour; the image's own alpha cuts the shape out."""
    mat = c4d.BaseMaterial(c4d.Mmaterial)
    mat.SetName(name)
    doc.InsertMaterial(mat)
    put(mat, "MATERIAL_USE_COLOR", False)
    put(mat, "MATERIAL_USE_REFLECTION", False)
    put(mat, "MATERIAL_USE_LUMINANCE", True)

    lum = c4d.BaseShader(c4d.Xbitmap)
    put(lum, "BITMAPSHADER_FILENAME", path)
    mat.InsertShader(lum)
    put(mat, "MATERIAL_LUMINANCE_SHADER", lum)

    alpha = c4d.BaseShader(c4d.Xbitmap)
    put(alpha, "BITMAPSHADER_FILENAME", path)
    mat.InsertShader(alpha)
    put(mat, "MATERIAL_USE_ALPHA", True)
    put(mat, "MATERIAL_ALPHA_SHADER", alpha)
    put(mat, "MATERIAL_ALPHA_IMAGEALPHA", True, "Image Alpha")
    put(mat, "MATERIAL_ALPHA_SOFT", True, "Soft")

    mat.Update(True, True)
    return mat


def black_material(doc):
    mat = c4d.BaseMaterial(c4d.Mmaterial)
    mat.SetName("BH_Horizon")
    doc.InsertMaterial(mat)
    put(mat, "MATERIAL_USE_COLOR", True)
    put(mat, "MATERIAL_COLOR_COLOR", c4d.Vector(0, 0, 0))
    put(mat, "MATERIAL_USE_REFLECTION", False)
    put(mat, "MATERIAL_USE_LUMINANCE", False)
    mat.Update(True, True)
    return mat


def tag(obj, mat, projection):
    t = c4d.TextureTag()
    t.SetMaterial(mat)
    put(t, "TEXTURETAG_PROJECTION", projection)
    obj.InsertTag(t)


# ── THE RIG ────────────────────────────────────────────────────────────────

def null(name, parent):
    obj = c4d.BaseObject(c4d.Onull)
    obj.SetName(name)
    obj.InsertUnder(parent)
    return obj


def image_plane(name, half, parent):
    """A square plane lying in its own XY, so its parent alone aims it."""
    plane = c4d.BaseObject(c4d.Oplane)
    plane.SetName(name)
    put(plane, "PRIM_PLANE_WIDTH", half * 2.0, "Width")
    put(plane, "PRIM_PLANE_HEIGHT", half * 2.0, "Height")
    put(plane, "PRIM_PLANE_SUBW", 1, "Width Segments")
    put(plane, "PRIM_PLANE_SUBH", 1, "Height Segments")
    put(plane, "PRIM_AXIS", const("PRIM_AXIS_ZP"), "Orientation")
    plane.InsertUnder(parent)
    return plane


def build(doc, tex_dir):
    root = c4d.BaseObject(c4d.Onull)
    root.SetName(GROUP_NAME)
    doc.InsertObject(root)

    uvw = const("TEXTURETAG_PROJECTION_UVW")

    # Camera: low, just above the disc plane, aimed at the hole.
    orbit = null("Camera Orbit", root)
    cam = c4d.BaseObject(c4d.Ocamera)
    cam.SetName("BH Camera")
    put(cam, "CAMERA_FOCUS", FOCAL, "Focal Length")
    cam.SetRelPos(c4d.Vector(0, CAM_DISTANCE * math.sin(deg(VIEW_ANGLE)),
                             -CAM_DISTANCE * math.cos(deg(VIEW_ANGLE))))
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

    # Disc: the plane is laid flat by its parent and only spins about its
    # own axis, so it turns in place instead of wobbling.
    plane = null("Disc Plane", root)
    plane.SetRelRot(c4d.Vector(0, deg(90), 0))
    disc = image_plane("Accretion Disc", DISC_OUTER, plane)
    tag(disc, image_material(doc, "BH_Disc", os.path.join(tex_dir, "bh_disc.png")), uvw)

    # Halo + photon ring: always square-on to the camera, whatever the angle.
    facing = null("Faces Camera", root)
    face = c4d.BaseTag(c4d.Ttargetexpression)
    face[c4d.TARGETEXPRESSIONTAG_LINK] = cam
    facing.InsertTag(face)
    halo = image_plane("Lensed Halo", HALO_OUTER, facing)
    tag(halo, image_material(doc, "BH_Halo", os.path.join(tex_dir, "bh_halo.png")), uvw)

    # One full turn per loop: frame FRAMES is frame 0 again. The halo runs the
    # other way — it is the far side of the same disc.
    turn = deg(360.0 * DISC_TURNS)
    set_keys(disc, rotation_id("b"), [(0, 0.0), (FRAMES, turn)])
    set_keys(halo, rotation_id("b"), [(0, 0.0), (FRAMES, -turn)])
    if MODE != "header":
        set_keys(orbit, rotation_id("h"), [(0, deg(-CAM_ORBIT_DEG / 2.0)),
                                           (FRAMES, deg(CAM_ORBIT_DEG / 2.0))])
    return root, cam


def configure_document(doc, cam):
    header = MODE == "header"
    doc.SetFps(FPS)
    doc.SetMinTime(c4d.BaseTime(0, FPS))
    doc.SetMaxTime(c4d.BaseTime(FRAMES, FPS))
    doc.SetLoopMinTime(c4d.BaseTime(0, FPS))
    doc.SetLoopMaxTime(c4d.BaseTime(FRAMES, FPS))

    rd = doc.GetActiveRenderData()
    if rd is not None:
        put(rd, "RDATA_RENDERENGINE", const("RDATA_RENDERENGINE_STANDARD"))
        put(rd, "RDATA_XRES", float(HEADER_RES if header else RES_X))
        put(rd, "RDATA_YRES", float(HEADER_RES if header else RES_Y))
        put(rd, "RDATA_FRAMERATE", float(FPS))
        put(rd, "RDATA_FRAMESEQUENCE", const("RDATA_FRAMESEQUENCE_MANUAL"))
        put(rd, "RDATA_FRAMEFROM", c4d.BaseTime(0, FPS))
        # Stop one short in header mode: frame FRAMES is frame 0 again, and
        # rendering both puts a held frame at the loop point.
        put(rd, "RDATA_FRAMETO", c4d.BaseTime(FRAMES - 1 if header else FRAMES, FPS))
        if header:
            put(rd, "RDATA_SAVEIMAGE", True)
            put(rd, "RDATA_PATH", OUTPUT_PATH)
            put(rd, "RDATA_FORMAT", const("FILTER_PNG"))
            put(rd, "RDATA_ALPHACHANNEL", True)
            put(rd, "RDATA_STRAIGHTALPHA", True)   # no dark fringe on the app's graphite

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
        if mat.GetName().startswith("BH_"):
            mat.Remove()
        mat = nxt


def main():
    del SKIPPED[:]
    doc = c4d.documents.GetActiveDocument()
    tex_dir = find_textures(doc)
    if not tex_dir:
        gui.MessageDialog("Couldn't find bh_disc.png. Put the {} folder next to "
                          "this script or your saved .c4d and run it again.".format(TEX_FOLDER))
        return

    doc.StartUndo()
    try:
        clear_previous(doc)
        root, cam = build(doc, tex_dir)
        configure_document(doc, cam)
        undo_new = const("UNDOTYPE_NEWOBJ", "UNDOTYPE_NEW")
        if undo_new is not None:
            doc.AddUndo(undo_new, root)
    finally:
        doc.EndUndo()
        c4d.EventAdd()

    print("Black hole rig built ({} mode), textures from {}".format(MODE, tex_dir))
    for line in SKIPPED:
        print("  skipped - " + line)
    gui.MessageDialog(
        "Black hole built. {} setting(s) skipped{}.\n\n"
        "Save the file, then Shift+R to render.".format(
            len(SKIPPED), " (see Console, Shift+F10)" if SKIPPED else ""))


if __name__ == "__main__":
    main()
