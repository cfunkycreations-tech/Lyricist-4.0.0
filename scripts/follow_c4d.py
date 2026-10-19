"""
LYRICIST PRO — Follow Spline, dressed by script, in Cinema 4D 2026.

Cinema 4D's Follow Spline simulation scene (Asset Browser -> "Follow Spline")
pulls a stream of particles along a spline until they spell it out. This
script takes that scene as you loaded it and makes it ours:

    LYRICIST PRO   built from particles, on a slow camera push-in

WHAT YOU NEED: the Follow Spline scene open (Simulation Scene, Geo, Particles,
the Text Spline). If it isn't there, the script tells you where to get it.

RUN
  1. Asset Browser -> search "Follow Spline" -> load it. Leave the scene as is.
  2. Extensions -> Script Manager -> File -> Load Script -> this file -> Execute.
     A popup says what was set and what was skipped.
  3. Save the .c4d.
  4. Render ONE frame first (frame 150, Shift+R) to check the look.
  5. Shift+R for the full run. Frames go to follow/ next to the .c4d.

IF IT CRASHES PART WAY: set START_FRAME below to the first missing frame, run
the script again, and Shift+R. Finished frames are kept. The simulation is
cached first and saved with the .c4d, so resumed frames match the ones
already rendered.

HOW IT'S BUILT
Nothing is rebuilt. The script finds the scene's own objects by name and
changes their settings:
  text      the Text Spline reads TEXT, in the first bold font this machine has.
  particles size of the Sphere (Particle Object).
  motion    Field Force Spline strength, Flock separation, Turbulence.
  look      Standard renderer and Standard materials only. The script sets the
            renderer, adds one Standard material (FOL_Particle) on the particle
            geometry, and two Standard lights.
  camera    a Standard camera copied from the scene's camera, slow push-in.
  document  30 fps, frame range, output folder, PNG.
  cache     presses the Simulation Scene's own Cache button (if it finds one).

Anything this version of Cinema 4D refuses is skipped and listed in the
Console (Extensions -> Console, Shift+F10) instead of stopping the script.
The script also writes follow_dump.txt (every object's type and setting
names) next to the .c4d, so a skipped setting can be fixed by name.
"""

import os

import c4d
from c4d import bitmaps, gui

# ── CONFIG ─────────────────────────────────────────────────────────────────

TEXT = "LYRICIST PRO"
FONTS = ["Bahnschrift Bold", "Bahnschrift SemiBold", "Bahnschrift",
         "Arial Black", "Arial Bold", "Arial"]

PARTICLE_RADIUS = 2.0          # cm
FORCE_STRENGTH = 15.0          # Field Force Spline.Strength (scene default 10)
SEPARATION = 4.0               # Flock.Separation Radius, cm (scene default 5)
TURBULENCE_STRENGTH = 4.0      # lower = cleaner letters

CAMERA_NAME = "camera"         # the scene's own camera is the first object with this in its name
GROUP_NAME = "LYRICIST_FOLLOW_RIG"
MATERIAL_NAME = "FOL_Particle"
PARTICLE_COLOR = (1.0, 0.78, 0.32)   # warm gold
GLOW = 0.35                          # Luminance brightness on the particles
CAMERA_PUSH = 0.12             # start 12% farther out, glide in. 0 = leave the camera alone

OUTPUT_PATH = "follow/follow_"       # relative to the saved .c4d
RES_X, RES_Y = 1920, 1080
FPS = 30
LAST_FRAME = 270                     # the scene's own length
START_FRAME = 0                      # raise this to resume after a crash

CACHE_FIRST = True

# Never in anything we put on screen.
BANNED = ["neon", "midnight", "rain", "heartbreak", "cold coffee", "shadows",
          "whispers", "echoes", "sparks", "cage", "gravity", "chains", "storm"]

# (object name contains, setting names to try, value)
TUNING = [
    ("particle object", ("Radius", "Size"), PARTICLE_RADIUS),
    ("field force spline", ("Strength",), FORCE_STRENGTH),
    ("flock", ("Separation Radius",), SEPARATION),
    ("turbulence", ("Strength", "Amount"), TURBULENCE_STRENGTH),
]


# ── SAFE SETTERS ───────────────────────────────────────────────────────────
# Parameter names change between Cinema 4D versions, and this scene's nodes
# are new. set_by_label() tries each setting name as it reads in the
# Attribute Manager; if nothing fits it notes it and keeps going.

SKIPPED = []
DUMP = []


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


def _params(node):
    """(label, DescID) for every setting the Attribute Manager shows."""
    out = []
    try:
        for bc, param_id, _group in node.GetDescription(c4d.DESCFLAGS_DESC_0):
            label = bc[c4d.DESC_NAME]
            if label:
                out.append((label, param_id, bc))
    except Exception:
        pass
    return out


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
    """Set one parameter by any of its known c4d names, or its label."""
    if isinstance(names, str):
        names = (names,)
    what = names[0] if names else label
    if value is None:
        SKIPPED.append("{}: {} (not in this version)".format(_who(node), what))
        return False
    if _try(node, names, value):
        return True
    if label and set_by_label(node, (label,), value, quiet=True):
        return True
    SKIPPED.append("{}: {}".format(_who(node), what))
    return False


def set_by_label(node, labels, value, quiet=False):
    """Set the first setting whose label matches (ignoring case)."""
    wanted = [l.lower() for l in labels]
    found = _params(node)
    for want in wanted:
        for label, param_id, _bc in found:
            if label.lower() != want:
                continue
            for attempt in (value, int(round(value)) if isinstance(value, float) else value):
                try:
                    node[param_id] = attempt
                    return True
                except Exception:
                    continue
    if not quiet:
        SKIPPED.append("{}: {}".format(_who(node), labels[0]))
    return False


# ── FINDING THINGS ─────────────────────────────────────────────────────────

def walk(obj):
    while obj:
        yield obj
        child = obj.GetDown()
        if child:
            for sub in walk(child):
                yield sub
        obj = obj.GetNext()


def find_obj(doc, *needles):
    """First object whose name contains every needle (ignoring case)."""
    for obj in walk(doc.GetFirstObject()):
        name = obj.GetName().lower()
        if all(n.lower() in name for n in needles):
            return obj
    return None


# ── CONSOLE / FILE DUMP ────────────────────────────────────────────────────

def _short(value):
    text = str(value).replace("\n", " ")
    return text if len(text) <= 60 else text[:57] + "..."


def dump_tree(doc):
    DUMP.append("OBJECTS (name | type id | type name)")
    for obj in walk(doc.GetFirstObject()):
        depth = 0
        up = obj.GetUp()
        while up:
            depth += 1
            up = up.GetUp()
        DUMP.append("{}{} | {} | {}".format("  " * depth, obj.GetName(), obj.GetType(),
                                            obj.GetTypeName()))
    DUMP.append("")


def dump_settings(node):
    DUMP.append("SETTINGS of {} (label = value | id)".format(_who(node)))
    for label, param_id, _bc in _params(node):
        try:
            value = _short(node[param_id])
        except Exception:
            value = "?"
        try:
            pid = param_id[0].id
        except Exception:
            pid = "?"
        DUMP.append("  {} = {} | {}".format(label, value, pid))
    DUMP.append("")


def write_dump(doc):
    folder = doc.GetDocumentPath()
    script = globals().get("__file__")
    if not folder and script:
        folder = os.path.dirname(script)
    if not folder:
        return None
    path = os.path.join(folder, "follow_dump.txt")
    try:
        with open(path, "w") as f:
            f.write("\n".join(DUMP))
        return path
    except Exception:
        return None


# ── SCENE EDITS ────────────────────────────────────────────────────────────

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
                print("Follow Spline font: " + name)
                break
    except Exception:
        found = None
    if found is None:
        SKIPPED.append("Text Spline: bold font (using the default font)")
    _FONT.append(found)
    return found


def banned_in(text):
    low = text.lower()
    return [w for w in BANNED if w in low]


def touch(doc, node):
    change = const("UNDOTYPE_CHANGE", "UNDOTYPE_CHANGE_SMALL")
    if change is not None:
        doc.AddUndo(change, node)


def set_text(doc, spline):
    touch(doc, spline)
    put(spline, "PRIM_TEXT_TEXT", TEXT, "Text")
    font = bold_font()
    if font is not None:
        put(spline, "PRIM_TEXT_FONT", font, "Font")


def apply_tuning(doc):
    for needle, labels, value in TUNING:
        node = find_obj(doc, needle)
        if node is None:
            SKIPPED.append("{}: not in this scene".format(needle))
            continue
        touch(doc, node)
        set_by_label(node, labels, float(value))


def _pos_id(axis):
    sub = {"x": c4d.VECTOR_X, "y": c4d.VECTOR_Y, "z": c4d.VECTOR_Z}[axis]
    return c4d.DescID(c4d.DescLevel(c4d.ID_BASEOBJECT_REL_POSITION, c4d.DTYPE_VECTOR, 0),
                      c4d.DescLevel(sub, c4d.DTYPE_REAL, 0))


def _key(obj, desc_id, pairs):
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


def clear_previous(doc):
    old = doc.SearchObject(GROUP_NAME)
    while old is not None:
        old.Remove()
        old = doc.SearchObject(GROUP_NAME)
    mat = doc.SearchMaterial(MATERIAL_NAME)
    while mat is not None:
        mat.Remove()
        mat = doc.SearchMaterial(MATERIAL_NAME)


def standard_material(doc):
    mat = c4d.BaseMaterial(c4d.Mmaterial)
    mat.SetName(MATERIAL_NAME)
    color = c4d.Vector(*PARTICLE_COLOR)
    put(mat, "MATERIAL_COLOR_COLOR", color)
    put(mat, "MATERIAL_USE_LUMINANCE", True)
    put(mat, "MATERIAL_LUMINANCE_COLOR", color)
    put(mat, "MATERIAL_LUMINANCE_BRIGHTNESS", GLOW)
    doc.InsertMaterial(mat)
    return mat


def dress_particles(doc, mat):
    """Our Standard material on the particle geometry, in place of the scene's own."""
    tex = const("Ttexture")
    if tex is None:
        SKIPPED.append("Particles: Standard material (no texture tag in this version)")
        return
    done = []
    for needle in ("particle object", "geo"):
        node = find_obj(doc, needle)
        if node is None or any(node is d for d in done):
            continue
        done.append(node)
        tag = node.GetFirstTag()
        while tag is not None:
            nxt = tag.GetNext()
            if tag.GetType() == tex:
                tag.Remove()
            tag = nxt
        new = node.MakeTag(tex)
        put(new, "TEXTURETAG_MATERIAL", mat)
    if not done:
        SKIPPED.append("Particles: not found (no material applied)")


def standard_camera(doc, rig, src):
    """A Standard camera on src's position and aim, with the push-in on it."""
    cam = c4d.BaseObject(c4d.Ocamera)
    cam.SetName("Follow Camera")
    cam.InsertUnder(rig)
    # Re-running: read the source on the last frame, where it sits at its real spot.
    doc.SetTime(c4d.BaseTime(LAST_FRAME, FPS))
    doc.ExecutePasses(None, True, True, True, c4d.BUILDFLAGS_0)
    cam.SetMg(src.GetMg())
    focus = const("CAMERA_FOCUS")
    try:
        cam[focus] = src[focus]
    except Exception:
        SKIPPED.append("Follow Camera: focal length (left at default)")
    if CAMERA_PUSH > 0:
        base = cam.GetRelPos()
        far = base * (1.0 + CAMERA_PUSH)
        for axis, a, b in (("x", far.x, base.x), ("y", far.y, base.y), ("z", far.z, base.z)):
            _key(cam, _pos_id(axis), [(0, a), (LAST_FRAME, b)])
    return cam


def add_lights(rig, cam):
    reach = max(cam.GetRelPos().GetLength(), 100.0)
    for name, where, level in (("Follow Key", c4d.Vector(0.4, 0.7, 0.6), 1.0),
                               ("Follow Fill", c4d.Vector(-0.8, 0.1, 0.5), 0.5)):
        light = c4d.BaseObject(c4d.Olight)
        light.SetName(name)
        light.InsertUnder(rig)
        light.SetRelPos(where * reach)
        put(light, "LIGHT_TYPE", const("LIGHT_TYPE_OMNI"))
        put(light, "LIGHT_BRIGHTNESS", level)
        put(light, "LIGHT_SHADOWTYPE", const("LIGHT_SHADOW_NONE", "LIGHT_SHADOWTYPE_NONE"))


def configure_document(doc, cam):
    doc.SetFps(FPS)
    doc.SetMinTime(c4d.BaseTime(0, FPS))
    doc.SetMaxTime(c4d.BaseTime(LAST_FRAME, FPS))
    doc.SetLoopMinTime(c4d.BaseTime(0, FPS))
    doc.SetLoopMaxTime(c4d.BaseTime(LAST_FRAME, FPS))
    doc.SetTime(c4d.BaseTime(0, FPS))

    rd = doc.GetActiveRenderData()
    if rd is not None:
        put(rd, "RDATA_RENDERENGINE", const("RDATA_RENDERENGINE_STANDARD"))
        put(rd, "RDATA_XRES", float(RES_X))
        put(rd, "RDATA_YRES", float(RES_Y))
        put(rd, "RDATA_FILMASPECT", RES_X / float(RES_Y), "Film Aspect")
        put(rd, "RDATA_FRAMERATE", float(FPS))
        put(rd, "RDATA_FRAMESEQUENCE", const("RDATA_FRAMESEQUENCE_MANUAL"))
        put(rd, "RDATA_FRAMEFROM", c4d.BaseTime(max(0, min(START_FRAME, LAST_FRAME)), FPS))
        put(rd, "RDATA_FRAMETO", c4d.BaseTime(LAST_FRAME, FPS))
        put(rd, "RDATA_SAVEIMAGE", True)
        put(rd, "RDATA_PATH", OUTPUT_PATH)
        put(rd, "RDATA_FORMAT", const("FILTER_PNG"))
        put(rd, "RDATA_ALPHACHANNEL", False)

    if cam is not None:
        bd = doc.GetActiveBaseDraw()
        if bd is not None:
            try:
                bd.SetSceneCamera(cam)
            except Exception:
                SKIPPED.append("{}: could not make it the render camera".format(_who(cam)))


def cache_simulation(sim):
    """Press the Simulation Scene's own Cache button, if it has one."""
    skip = ("clear", "delete", "reset", "free", "remove", "disable")
    button = const("CUSTOMGUI_BUTTON")
    for label, param_id, bc in _params(sim):
        low = label.lower()
        if "cache" not in low or any(s in low for s in skip):
            continue
        try:
            if button is not None and bc[c4d.DESC_CUSTOMGUI] != button:
                continue
            c4d.CallButton(sim, param_id[0].id)
            print("Follow Spline: pressed '{}' on {}".format(label, _who(sim)))
            return True
        except Exception:
            continue
    return False


# ── MAIN ───────────────────────────────────────────────────────────────────

def main():
    del SKIPPED[:]
    del DUMP[:]
    del _FONT[:]
    doc = c4d.documents.GetActiveDocument()

    hit = banned_in(TEXT)
    if hit:
        gui.MessageDialog("TEXT has a word we never use ({}). Change it at the top "
                          "of the script.".format(", ".join(hit)))
        return

    sim = find_obj(doc, "simulation scene")
    spline = find_obj(doc, "text spline")
    if sim is None or spline is None:
        gui.MessageDialog("Follow Spline scene isn't open.\n\nAsset Browser -> search "
                          "\"Follow Spline\" -> load it -> run this again.")
        return

    src = None
    for obj in walk(doc.GetFirstObject()):
        name = obj.GetName().lower()
        if CAMERA_NAME in name and "follow" not in name:
            src = obj
            break
    if src is None:
        SKIPPED.append("scene camera: not found (no camera added)")

    dump_tree(doc)
    for node in (sim, spline):
        dump_settings(node)
    for needle, _labels, _value in TUNING:
        node = find_obj(doc, needle)
        if node is not None:
            dump_settings(node)

    doc.StartUndo()
    cached = False
    try:
        clear_previous(doc)
        rig = c4d.BaseObject(c4d.Onull)
        rig.SetName(GROUP_NAME)
        doc.InsertObject(rig)
        set_text(doc, spline)
        apply_tuning(doc)
        dress_particles(doc, standard_material(doc))
        cam = None
        if src is not None:
            cam = standard_camera(doc, rig, src)
            add_lights(rig, cam)
        configure_document(doc, cam)
        doc.ExecutePasses(None, True, True, True, c4d.BUILDFLAGS_0)
        if CACHE_FIRST:
            cached = cache_simulation(sim)
            if not cached:
                SKIPPED.append("Simulation Scene: Cache button not found")
    finally:
        doc.EndUndo()
        c4d.EventAdd()

    dump_path = write_dump(doc)
    print("Lyricist Pro Follow Spline set up.")
    if dump_path:
        print("  settings dump: " + dump_path)
    for line in SKIPPED:
        print("  skipped - " + line)
    for line in DUMP:
        print(line)

    tail = ("Cached. Save the .c4d, render frame 150 first, then Shift+R."
            if cached else
            "Click Cache on the Simulation Scene (Attribute Manager) before "
            "rendering. Save the .c4d, render frame 150 first, then Shift+R.")
    gui.MessageDialog("Follow Spline set. {} setting(s) skipped{}.\n\n{}".format(
        len(SKIPPED), " (see Console, Shift+F10)" if SKIPPED else "", tail))


if __name__ == "__main__":
    main()
