"""
BLACK HOLE STUDIOS — a pool of molten metal, built by script, in Cinema 4D.

A Python Generator pours a flowing molten surface (sharp-crested waves that
loop), Metaball blobs rise out of it and melt back in, the title stands half
sunk in the pool, fog swallows the far end, and a gold reflection image makes
every surface read as liquid metal.

WHAT YOU NEED: this script and the molten_tex folder (molten_env_gold.jpg,
molten_env_ice.jpg). Keep the folder next to this script or next to your saved
.c4d; if the script can't find it, it asks you to pick molten_env_gold.jpg.

SUBSTANCE (.sbsar)
  Drop any .sbsar into the molten_tex folder (or next to this script or your
  saved .c4d) and run the script. The pool wears it, with the gold reflection
  on top, so you see it on the metal. Or set SBSAR below to a file path.
  Change its sliders: click MLT_Substance in the Material Manager, then the
  Attribute Manager. Swap the file, run again.
  If Cinema 4D crashes on it, restart Cinema 4D and run the script again: it
  remembers the call that crashed (molten_substance_trace.txt in your temp
  folder) and walks round it. Each run gets one step further.

RUN
  1. File -> New (start from an empty scene).
  2. Extensions -> Script Manager -> File -> Load Script -> this file -> Execute.
  3. Save the .c4d.
  4. Shift+R (Render to Picture Viewer). Frames go to molten/ next to the .c4d.

SHOTS  (MODE below)
  "hero"    1920x1080, the wide shot.
  "phone"   1080x1920, held upright, title on two lines.
  "header"  720x720, for the tab header.
All three loop: the last frame leads straight back into the first.

IF IT CRASHES PART WAY: set START_FRAME below to the first missing frame, run
the script again, and Shift+R. Finished frames are kept.

AFTER RE-RUNNING molten_textures.py: just run this script again. It hands the
material a fresh copy of the image, so the new one shows up without restarting
Cinema 4D (C4D holds a texture in memory by file path for the whole session).

HOW IT'S BUILT
Same rules as the other rigs: the look is in an image made by
scripts/molten_textures.py, and this script only builds shapes and moves them.
  surface   a Python Generator (select "Molten Surface" -> Attribute Manager
            -> Code to read or change the waves). It rebuilds the mesh every
            frame from a handful of waves, each with a whole number of cycles
            per loop, so frame 0 and frame FRAMES match exactly.
  blobs     a Metaball object with spheres that rise, merge and sink.
  title     extruded text, chrome, half under the surface.
  fog       an Environment object; far ground fades to dark ember.
  metal     near-black body with the gold image in the Environment channel.
Set PALETTE = "ice" for the blue-white version.
Substance: none ship with this script; see SUBSTANCE above.
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
from c4d import bitmaps, gui, storage, utils

# ── CONFIG ─────────────────────────────────────────────────────────────────

GROUP_NAME = "MOLTEN_POOL_RIG"       # re-running the script replaces this group
FOG_NAME = "MOLTEN_FOG"
TEX_FOLDER = "molten_tex"
OUTPUT_PATH = "molten/molten_"       # relative to the saved .c4d

MODE = "hero"                        # "hero", "phone" or "header"
PALETTE = "gold"                     # "gold" or "ice"

SBSAR = ""                           # a .sbsar path; "" = first one found in molten_tex
SBSAR_GRAPH = 0                      # which graph inside the file
SBSAR_TILES = 8                      # repeats across the pool
SBSAR_SHINE = 0.25                   # gold reflection laid over it (0 = off, 0.8 = mostly gold)
SBSAR_DISPLACE = False               # True also pushes the surface; far slower to render
FORGET_CRASHES = False               # True once, to retry Substance calls that crashed Cinema 4D

FPS = 30
FRAMES = 240                         # 8 s loop; keep it a multiple of 4
START_FRAME = 0                      # raise this to resume after a crash

# res, title, letter height, camera distance and height, point the camera
# looks at, how far out the blobs sit
SHOTS = {
    "hero":   dict(res=(1920, 1080), title="BLACK HOLE STUDIOS", title_h=150.0,
                   dist=1900.0, cam_y=380.0, look_y=110.0, spread=1.0),
    "phone":  dict(res=(1080, 1920), title="BLACK HOLE\nSTUDIOS", title_h=150.0,
                   dist=1500.0, cam_y=480.0, look_y=120.0, spread=0.5),
    "header": dict(res=(720, 720), title="BLACK HOLE\nSTUDIOS", title_h=150.0,
                   dist=1750.0, cam_y=400.0, look_y=110.0, spread=0.7),
}
FOCAL = 36.0
TITLE_DEPTH = 36.0
TITLE_SINK = 1.45                     # title centre, this x its height above the surface. Low
                                     # enough to straddle the waterline and the letters have no
                                     # background to read against: dark sky above, bright gold
                                     # below, and the title lost in the join.
TITLE_BODY = c4d.Vector(0.80, 0.82, 0.86)     # pale chrome: the only value that reads over the pool
TITLE_SHINE = 0.55                   # gold caught along the letters
                                     # a full mirror of the same image, so anything
                                     # near it (0.8 did this) makes the letters wear
                                     # the pool and the title disappears into it.

FOG_COLOUR = c4d.Vector(0.05, 0.012, 0.0)
FOG_DISTANCE = 6500.0

# Bold fonts to try, in order. Bahnschrift ships with Windows 10 and 11.
FONTS = ["Bahnschrift Bold", "Bahnschrift SemiBold", "Bahnschrift",
         "Arial Black", "Arial Bold", "Arial"]

# The molten surface. One row per wave:
#   heading in degrees, wavelength, height, sharpness (1 = rounded, 1.6 = pointed
#   crests), whole cycles per loop.
WAVES = [
    (0.0, 1100.0, 50.0, 1.4, 1),
    (38.0, 640.0, 34.0, 1.5, 1),
    (-52.0, 420.0, 26.0, 1.5, 2),
    (75.0, 280.0, 17.0, 1.6, 2),
    (-17.0, 170.0, 9.0, 1.4, 3),
]
# Grid: tight near the camera, stretching toward the horizon. calm is how much
# of the wave height is left at the title (1 = none removed), so the letters
# sit in a quieter basin and the pool gets rougher toward the edges.
GRID = dict(x_half=5200.0, z_lo=-2600.0, z_hi=9000.0, z_focus=-300.0,
            step=34.0, grow=3.0, reach=1800.0,
            calm=0.12, calm_rx=1500.0, calm_rz=1100.0)

# Blobs: radius, x, z, rise height, rise cycles, drift, drift cycles, phase.
# They sit to the sides and behind the title so it stays readable.
BLOBS = [
    (95.0, -1000.0, 80.0, 170.0, 1, 90.0, 1, 0.0),
    (70.0, 980.0, 150.0, 150.0, 2, 70.0, 1, 1.7),
    (120.0, -330.0, 520.0, 190.0, 1, 120.0, 2, 3.1),
    (62.0, 330.0, 440.0, 140.0, 3, 130.0, 1, 4.4),
    (85.0, 760.0, 760.0, 160.0, 2, 80.0, 2, 5.2),
    (55.0, -820.0, 420.0, 130.0, 3, 60.0, 2, 0.9),
]

METAL_BASE = c4d.Vector(0.02, 0.025, 0.035)


# ── SAFE SETTERS ───────────────────────────────────────────────────────────
# Parameter names change between Cinema 4D versions. put() tries each known
# name, then the parameter's label in the Attribute Manager, and if nothing
# fits it notes it and keeps going rather than leaving a half-built scene.

SKIPPED = []
SUBSTANCE = []                       # the .sbsar in use, if any
WHY = []                             # why the last Substance step failed
FACTS = []                           # the Substance constants this build has
CRASHED = set()                      # Substance calls that took Cinema 4D down before
_OPEN = []                           # Substance step still open (see _open_run)
TRACE = os.path.join(tempfile.gettempdir(), "molten_substance_trace.txt")


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

def env_name():
    return "molten_env_{}.jpg".format(PALETTE)


def find_textures(doc):
    """The folder holding the env image: beside the script, beside the .c4d, or ask."""
    places = []
    script = globals().get("__file__")
    if script:
        places.append(os.path.join(os.path.dirname(script), TEX_FOLDER))
    doc_dir = doc.GetDocumentPath()
    if doc_dir:
        places.append(os.path.join(doc_dir, TEX_FOLDER))
        places.append(doc_dir)
    for place in places:
        if os.path.isfile(os.path.join(place, env_name())):
            return place
    picked = storage.LoadDialog(type=c4d.FILESELECTTYPE_IMAGES,
                                title="Where is {}?".format(env_name()))
    if picked and os.path.isfile(picked):
        return os.path.dirname(picked)
    return None


FRESH_DIR = os.path.join(tempfile.gettempdir(), "lyricist_c4d_tex")


def fresh_copy(path):
    """Hand the shader a path Cinema 4D has not read before.

    Cinema 4D keeps a texture in memory keyed on its file path for the whole
    session. Re-run molten_textures.py and then this script and the render comes
    back with the OLD picture, because nothing about the path changed. The copy
    below is named after the source's timestamp and size: an unchanged image
    keeps the same name and costs nothing, a regenerated one gets a name C4D has
    never seen and is read fresh.
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
        return path                      # read-only temp: fall back, stale but working
    for old in glob.glob(os.path.join(FRESH_DIR, stem + "~*" + ext)):
        if old != copy:
            try:
                os.remove(old)
            except OSError:
                pass
    return copy


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


def metal_material(doc, env_path):
    """Molten metal: a dark body that shows the reflection image."""
    mat = new_material(doc, "MLT_Metal")
    put(mat, "MATERIAL_USE_COLOR", True)
    put(mat, "MATERIAL_COLOR_COLOR", METAL_BASE)
    put(mat, "MATERIAL_USE_LUMINANCE", False)
    put(mat, "MATERIAL_USE_ENVIRONMENT", True, "Environment")
    put(mat, "MATERIAL_ENVIRONMENT_SHADER", bitmap(mat, env_path))
    put(mat, "MATERIAL_ENVIRONMENT_BRIGHTNESS", 1.0)
    mat.Update(True, True)
    return mat


def title_material(doc, env_path):
    """Near-black polished letters: dark against the bright gold pool, with the
    gold reflection image catching along the edges."""
    mat = new_material(doc, "MLT_Title")
    put(mat, "MATERIAL_USE_COLOR", True)
    put(mat, "MATERIAL_COLOR_COLOR", TITLE_BODY)
    put(mat, "MATERIAL_USE_LUMINANCE", False)
    put(mat, "MATERIAL_USE_ENVIRONMENT", True, "Environment")
    put(mat, "MATERIAL_ENVIRONMENT_SHADER", bitmap(mat, env_path))
    put(mat, "MATERIAL_ENVIRONMENT_BRIGHTNESS", TITLE_SHINE)
    mat.Update(True, True)
    return mat


def tag(obj, mat, projection=None, tiles=None):
    t = c4d.TextureTag()
    t.SetMaterial(mat)
    put(t, "TEXTURETAG_PROJECTION",
        projection if projection is not None else const("TEXTURETAG_PROJECTION_UVW"))
    if tiles:
        put(t, "TEXTURETAG_TILE", True, "Tile")
        put(t, "TEXTURETAG_TILESX", tiles, "Tiles U")
        put(t, "TEXTURETAG_TILESY", tiles, "Tiles V")
    obj.InsertTag(t)


def smooth(obj, angle=40.0):
    """Phong tag: script-made objects don't get one, and metal shows facets."""
    try:
        t = obj.MakeTag(c4d.Tphong)
        put(t, "PHONGTAG_PHONG_ANGLELIMIT", True)
        put(t, "PHONGTAG_PHONG_ANGLE", deg(angle))
    except Exception:
        SKIPPED.append("{}: Phong tag".format(_who(obj)))


# ── SUBSTANCE ──────────────────────────────────────────────────────────────

def _sbsar_nearby(root, depth=3, limit=400):
    """First .sbsar in root or up to depth folders below it (an unzip often
    nests molten_pack inside molten_pack)."""
    seen = 0
    for here, dirs, files in os.walk(root):
        seen += 1
        found = sorted(n for n in files if n.lower().endswith(".sbsar"))
        if found:
            return os.path.join(here, found[0])
        if seen >= limit or here[len(root):].count(os.sep) >= depth:
            dirs[:] = []
    return None


def substance_file(tex):
    """The .sbsar to use: SBSAR if set, else the first one beside the textures,
    the script or the saved .c4d, else one in a folder near the textures."""
    if SBSAR:
        if os.path.isfile(SBSAR):
            return SBSAR
        SKIPPED.append("Substance: SBSAR file not found ({})".format(SBSAR))
        return None
    places = [tex]
    script = globals().get("__file__")
    if script:
        places.append(os.path.dirname(script))
    doc_dir = c4d.documents.GetActiveDocument().GetDocumentPath()
    if doc_dir:
        places.append(doc_dir)
    for place in places:
        try:
            found = sorted(n for n in os.listdir(place) if n.lower().endswith(".sbsar"))
        except (OSError, TypeError):
            continue
        if found:
            return os.path.join(place, found[0])
    near = _sbsar_nearby(os.path.dirname(os.path.abspath(tex)))
    return near


def _why(err):
    return "{}: {}".format(type(err).__name__, str(err).strip().splitlines()[0] if str(err).strip() else "")[:90]


# Breadcrumbs. A bad native call can take Cinema 4D down with no Python error,
# so every Substance call is logged to a file first (B) and ticked off after
# (E). The next run finds a B with no E, remembers that call as a crasher (X)
# and walks round it, so each run gets one step further.

class Crashed(Exception):
    """A call that took Cinema 4D down on an earlier run; not tried again."""


def _mark(tag, key):
    try:
        with open(TRACE, "a") as f:
            f.write("{} {}\n".format(tag, key))
            f.flush()
            os.fsync(f.fileno())
    except (OSError, IOError):
        pass


def _trace_load():
    """Read last run's breadcrumbs into CRASHED and tidy the file."""
    CRASHED.clear()
    del _OPEN[:]
    lines = []
    if not FORGET_CRASHES:
        try:
            with open(TRACE) as f:
                lines = f.read().splitlines()
        except (OSError, IOError):
            pass
    stack = []
    for line in lines:
        tag, _, key = line.partition(" ")
        if tag == "X":
            CRASHED.add(key)
        elif tag == "B":
            stack.append(key)
        elif tag == "E":
            i = len(stack) - 1
            while i >= 0 and stack[i] != key:
                i -= 1
            if i >= 0:
                del stack[i]
    if stack:
        CRASHED.add(stack[-1])
    try:
        with open(TRACE, "w") as f:
            for key in sorted(CRASHED):
                f.write("X {}\n".format(key))
    except (OSError, IOError):
        pass


def _native(key, fn, *args):
    """fn(*args) between breadcrumbs. No finally: after a hard crash nothing
    runs, and a Python error means the call came back."""
    if key in CRASHED:
        raise Crashed(key)
    _mark("B", key)
    try:
        result = fn(*args)
    except Exception:
        _mark("E", key)
        raise
    _mark("E", key)
    return result


def _open_run(route):
    """Held open until the pop-up is dismissed, so a crash while the viewport
    first draws the Substance material is caught too."""
    key = "run:" + route
    _mark("B", key)
    _OPEN.append(key)


def _close_run():
    for key in _OPEN:
        _mark("E", key)
    del _OPEN[:]


def _shapes(tag, fn, shapes):
    """Call fn with each argument shape in turn. Only a TypeError (wrong
    shape) or a skipped crasher moves on to the next; anything else is the
    real answer. Returns (answered, result)."""
    for args in shapes:
        try:
            return True, _native("{}:{}".format(tag, len(args)), fn, *args)
        except Crashed as err:
            WHY.append("skipped {} (crashed Cinema 4D before)".format(err))
        except TypeError as err:
            WHY.append(_why(err))
        except Exception as err:
            WHY.append(_why(err))
            return True, None
    return False, None


def _consts(sub, *words):
    """(name, value) of every Substance constant whose name has all of words."""
    seen, out = set(), []
    for mod in (sub, c4d):
        for name in dir(mod):
            if name in seen or not name.isupper() or "SUBSTANCE" not in name:
                continue
            if all(w in name for w in words):
                seen.add(name)
                try:
                    out.append((name, getattr(mod, name)))
                except Exception:
                    pass
    return out


def _facts(sub):
    """The Substance constants this build really has, for the Console and,
    when nothing worked, the pop-up."""
    seen = ["{}={}".format(n.replace("SUBSTANCE_", "", 1), v)
            for n, v in _consts(sub, "IMPORT") + _consts(sub, "MODE")]
    FACTS[:] = [", ".join(seen)[:300]] if seen else []
    print("Substance constants: " + (FACTS[0] if FACTS else "none found"))


def _assets(sub, doc):
    """Every Substance asset in the document, whichever getter this version has."""
    for name, args in (("GetSubstances", (doc,)), ("GetSubstances", (doc, False)),
                       ("GetAllSubstances", (doc,))):
        fn = getattr(sub, name, None)
        if fn is None:
            continue
        try:
            got = _native("assets:{}:{}".format(name, len(args)), fn, *args)
        except Exception:
            continue
        if got is not None:
            try:
                return list(got)
            except TypeError:
                pass
    first = getattr(sub, "GetFirstSubstance", None)
    if first is None:
        return []

    def walk():
        found, node = [], first(doc)
        while node is not None and len(found) < 500:
            found.append(node)
            node = node.GetNext()
        return found
    try:
        return _native("assets:walk", walk)
    except Exception:
        return []


def _copy_values(sub):
    """ImportSubstance's copy-file setting: the 'don't copy' constant, found by
    name (a new scene has no project folder to copy into). A bare 0 only if
    this build names none."""
    named = [(n, v) for n, v in _consts(sub, "IMPORT", "COPY") if not n.endswith("ASK")]
    keep = [v for n, v in named if n.split("_")[-1] in ("NO", "NOT", "DONT")]
    if keep:
        return keep[:1]
    return [v for n, v in named][:1] or [0]


def _import(sub, doc, path):
    """Import the .sbsar; returns the asset or None. 2024+ wants
    (doc, file, copyFile, errPopup, addUndo, createMaterial) and answers with
    (result, asset, n); older builds take fewer arguments and answer nothing.
    One real call: once it ran, the answer stands."""
    ok = [v for n, v in _consts(sub, "IMPORT", "SUCCESS")]
    before = len(_assets(sub, doc))
    for copy in _copy_values(sub):
        answered, res = _shapes(
            "import:{}".format(copy), sub.ImportSubstance,
            [(doc, path, copy, False, False, False),
             (doc, path, copy, False, False),
             (doc, path, copy)])
        if not answered:
            continue
        if isinstance(res, (tuple, list)) and len(res) > 1:
            code, asset = res[0], res[1]
            if asset is not None and (not ok or code in ok):
                return asset
            WHY.append("Import answered {!r}".format(code))
        have = _assets(sub, doc)
        return have[-1] if len(have) > before else None
    return None


def _kind(mat):
    """None for a plain Standard-renderer material, else what it is."""
    try:
        kind = mat.GetType()
    except Exception:
        return None
    if kind != c4d.Mmaterial:
        return "material type {}".format(kind)
    node = getattr(c4d, "NodeMaterial", None)
    if isinstance(node, type) and isinstance(mat, node):
        return "a node material"
    return None


def _discard(mat):
    try:
        if mat.GetDocument() is not None:
            mat.Remove()
    except Exception:
        pass


def _create(sub, asset):
    """A Standard-renderer material from the asset: mode STANDARD, then AUTO
    (never NONE), one real call each. Returns (material, what-else-it-was)."""
    named = _consts(sub, "MATERIAL", "MODE")
    modes = [(w, v) for w in ("STANDARD", "AUTO") for n, v in named if n.endswith("_" + w)]
    if not modes:
        modes = [(n, v) for n, v in named if not n.endswith("_NONE")][:2] or [("0", 0)]
    graph, odd = SBSAR_GRAPH, None
    for label, mode in modes:
        answered, got = _shapes("create:{}:g{}".format(label, graph), sub.CreateMaterial,
                                [(asset, graph, mode), (asset, graph), (asset,)])
        if isinstance(got, (tuple, list)):
            got = next((g for g in got if g is not None and hasattr(g, "SetName")), None)
        if got is None:
            continue
        odd = _kind(got)
        if odd is None:
            return got, None
        _discard(got)
    return None, odd


def substance_material(doc, path, env_path):
    """Import the .sbsar, build a material from it, add the gold reflection."""
    sub = getattr(getattr(c4d, "modules", None), "substance", None)
    if sub is None:
        SKIPPED.append("Substance: this Cinema 4D has no Substance module")
        return None
    if "run:shader" in CRASHED:
        SKIPPED.append("Substance: crashed Cinema 4D on both routes last time, skipped")
        return None
    del WHY[:]
    _facts(sub)
    stem = os.path.splitext(os.path.basename(path))[0]
    asset = None
    for have in _assets(sub, doc):
        try:
            if have.GetName() == stem:
                asset = have
        except Exception:
            pass
    if asset is None:
        asset = _import(sub, doc, path)
    if asset is None:
        SKIPPED.append("Substance: couldn't load {} [{}]".format(
            os.path.basename(path), "; ".join(dict.fromkeys(WHY[-3:])) or "no answer"))
        return None

    mat, odd = (None, None) if "run:material" in CRASHED else _create(sub, asset)
    route = "material"
    if mat is None:
        route = "shader"
        shader = _shapes("shader", sub.CreateSubstanceShader, [(asset,)])[1]
        if shader is None:
            SKIPPED.append("Substance: couldn't make a material from {} [{}]".format(
                stem, "; ".join(dict.fromkeys(WHY[-3:])) or
                ("got {}, Standard can't draw it".format(odd) if odd else "no answer")))
            return None
        mat = c4d.BaseMaterial(c4d.Mmaterial)
        mat.InsertShader(shader)
        put(mat, "MATERIAL_COLOR_SHADER", shader, "Texture")
    _open_run(route)
    mat.SetName("MLT_Substance")
    try:
        if mat.GetDocument() is None:
            doc.InsertMaterial(mat)
    except Exception:
        doc.InsertMaterial(mat)
    if not SBSAR_DISPLACE:
        put(mat, "MATERIAL_USE_DISPLACEMENT", False)
    if SBSAR_SHINE > 0:
        put(mat, "MATERIAL_USE_ENVIRONMENT", True, "Environment")
        put(mat, "MATERIAL_ENVIRONMENT_SHADER", bitmap(mat, env_path))
        put(mat, "MATERIAL_ENVIRONMENT_BRIGHTNESS", SBSAR_SHINE)
    mat.Update(True, True)
    return mat


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
                print("Molten font: " + name)
                break
    except Exception:
        found = None
    if found is None:
        SKIPPED.append("Text: bold font (using the default font)")
    _FONT.append(found)
    return found


def metal_text(name, text, height, depth, parent, mat):
    """Extruded text, centred on its parent so it bobs about its middle."""
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


def light(name, pos, colour, brightness, parent):
    obj = c4d.BaseObject(c4d.Olight)
    obj.SetName(name)
    put(obj, "LIGHT_COLOR", colour, "Color")
    put(obj, "LIGHT_BRIGHTNESS", brightness, "Intensity")
    obj.SetRelPos(pos)
    obj.InsertUnder(parent)
    return obj


# ── THE MOLTEN SURFACE ─────────────────────────────────────────────────────
# Python Generator code. It runs inside Cinema 4D on every frame, so it is
# plain Python (numpy isn't bundled) and has to be self-contained. __NAME__
# tokens are filled in below. Every wave moves a whole number of cycles per
# loop, so the surface at frame FRAMES is the surface at frame 0.
#
# Waves are summed with sin(A+B) = sin A cos B + cos A sin B, so each wave
# costs a few multiplies per point. The grid is tight near the camera and
# stretches toward the horizon; a wave fades out where the grid is too coarse
# to draw it, which keeps the far water from shimmering.

GENERATOR_CODE = '''
import math

import c4d

FRAMES = __FRAMES__
WAVES = __WAVES__
GRID = __GRID__


def axis(lo, hi, focus):
    out = [focus]
    for sign, bound in ((-1.0, lo), (1.0, hi)):
        pos = focus
        while True:
            reach = abs(pos - focus) / GRID["reach"]
            pos += sign * GRID["step"] * (1.0 + GRID["grow"] * reach * reach)
            if sign * (pos - bound) >= 0.0:
                out.append(bound)
                break
            out.append(pos)
    out.sort()
    return out


def gaps(a):
    n = len(a)
    return [max(a[min(i + 1, n - 1)] - a[i], a[i] - a[max(i - 1, 0)]) for i in range(n)]


def fade(wavelength, gap):
    r = wavelength / gap
    if r <= 2.0:
        return 0.0
    if r >= 4.0:
        return 1.0
    return (r - 2.0) / 2.0


def main():
    tau = 2.0 * math.pi
    t = doc.GetTime().Get() * doc.GetFps() / float(FRAMES)

    xs = axis(-GRID["x_half"], GRID["x_half"], 0.0)
    zs = axis(GRID["z_lo"], GRID["z_hi"], GRID["z_focus"])
    nx, nz = len(xs), len(zs)
    gx, gz = gaps(xs), gaps(zs)
    count = nx * nz

    # Sideways travel of the crests, scaled so no wave folds over itself.
    total = sum(h * s * tau / lam for _a, lam, h, s, _c in WAVES)
    shrink = min(1.0, 0.85 / total)

    hy = [0.0] * count
    ox = [0.0] * count
    oz = [0.0] * count
    for ang, lam, hgt, sharp, cyc in WAVES:
        k = tau / lam
        dx = math.sin(math.radians(ang))
        dz = math.cos(math.radians(ang))
        fx = sharp * shrink * dx
        fz = sharp * shrink * dz
        cols = []
        for i in range(nx):
            a = k * dx * xs[i]
            w = fade(lam, gx[i]) * hgt
            cols.append((math.sin(a) * w, math.cos(a) * w))
        for j in range(nz):
            b = k * dz * zs[j] - tau * cyc * t
            w = fade(lam, gz[j])
            sb = math.sin(b) * w
            cb = math.cos(b) * w
            base = j * nx
            for i, (sa, ca) in enumerate(cols):
                c = ca * cb - sa * sb
                idx = base + i
                hy[idx] += sa * cb + ca * sb
                ox[idx] += c * fx
                oz[idx] += c * fz

    calm = GRID["calm"]
    ex = [(x / GRID["calm_rx"]) ** 2 for x in xs]
    pts = []
    for j in range(nz):
        z = zs[j]
        ez = (z / GRID["calm_rz"]) ** 2
        base = j * nx
        for i in range(nx):
            idx = base + i
            u = min(1.0, math.sqrt(ex[i] + ez) / 1.4)
            c = calm + (1.0 - calm) * u * u * (3.0 - 2.0 * u)
            pts.append(c4d.Vector(xs[i] + ox[idx] * c, hy[idx] * c, z + oz[idx] * c))

    # Quads, wound so the normals point up whichever way this version counts.
    flip = False
    try:
        probe = c4d.CPolygon(0, 1, nx + 1, nx)
        flip = c4d.utils.CalcFaceNormal(pts, probe).y < 0.0
    except Exception:
        pass

    poly = c4d.PolygonObject(count, (nx - 1) * (nz - 1))
    poly.SetAllPoints(pts)
    n = 0
    for j in range(nz - 1):
        for i in range(nx - 1):
            a = j * nx + i
            b = a + 1
            c = a + nx + 1
            d = a + nx
            poly.SetPolygon(n, c4d.CPolygon(a, d, c, b) if flip else c4d.CPolygon(a, b, c, d))
            n += 1

    try:
        poly.SetPhong(True, False, 0.0)
    except Exception:
        try:
            poly.MakeTag(c4d.Tphong)
        except Exception:
            pass
    poly.Message(c4d.MSG_UPDATE)
    return poly
'''


def generator_code():
    code = GENERATOR_CODE
    for token, value in (("__FRAMES__", FRAMES), ("__WAVES__", WAVES), ("__GRID__", GRID)):
        code = code.replace(token, repr(value))
    return code


def molten_surface(parent, mat, tiles=None):
    gen = c4d.BaseObject(const("Opython") or 1023866)
    if gen is None:
        SKIPPED.append("Molten Surface: Python Generator (needs a Cinema 4D with Python Generator)")
        return None
    gen.SetName("Molten Surface")
    put(gen, "OPYTHON_CODE", generator_code(), "Code")
    put(gen, "OPYTHON_OPTIMIZE", False, "Optimize Cache")
    gen.InsertUnder(parent)
    if tiles:
        tag(gen, mat, const("TEXTURETAG_PROJECTION_CUBIC"), tiles)
    else:
        tag(gen, mat, const("TEXTURETAG_PROJECTION_FLAT"))
    return gen


# ── THE SCENE ──────────────────────────────────────────────────────────────

def blobs(parent, mat, spread):
    """Spheres inside a Metaball: where two come close they melt into one."""
    meta = c4d.BaseObject(const("Ometaball") or 5125)
    if meta is None:
        SKIPPED.append("Blobs: Metaball object")
        return None
    meta.SetName("Molten Blobs")
    put(meta, "METABALLOBJECT_SUBEDITOR", 30.0, "Editor Subdivision")
    put(meta, "METABALLOBJECT_SUBRAY", 10.0, "Render Subdivision")
    put(meta, "METABALLOBJECT_ACCURATENORMALS", True, "Accurate Normals")
    meta.InsertUnder(parent)

    for n, (radius, x, z, rise, rise_cycles, drift, drift_cycles, phase) in enumerate(BLOBS):
        ball = c4d.BaseObject(c4d.Osphere)
        ball.SetName("Blob {}".format(n + 1))
        ball[c4d.PRIM_SPHERE_RAD] = radius
        put(ball, "PRIM_SPHERE_SUB", 24, "Segments")
        ball.InsertUnder(meta)
        x *= spread
        # Rises out of the pool and sinks back below it, drifting as it goes.
        set_keys(ball, pos_id("y"), cycle(rise * 0.35, rise, rise_cycles, phase))
        set_keys(ball, pos_id("x"), cycle(x, drift, drift_cycles, phase + 1.3))
        set_keys(ball, pos_id("z"), cycle(z, drift, drift_cycles, phase + 2.6))

    tag(meta, mat, const("TEXTURETAG_PROJECTION_SPHERICAL"))
    smooth(meta, 80.0)
    return meta


def fog(doc):
    env = c4d.BaseObject(const("Oenvironment") or 5116)
    if env is None:
        SKIPPED.append("Fog: Environment object")
        return
    env.SetName(FOG_NAME)
    put(env, "ENVIRONMENT_FOG", True, "Enable Fog")
    put(env, "ENVIRONMENT_FOGCOLOR", FOG_COLOUR, "Fog Color")
    put(env, "ENVIRONMENT_FOGSTRENGTH", 1.0, "Fog Strength")
    put(env, "ENVIRONMENT_FOGDISTANCE", FOG_DISTANCE, "Fog Distance")
    doc.InsertObject(env)


def build(doc, tex):
    shot = SHOTS[MODE]
    root = c4d.BaseObject(c4d.Onull)
    root.SetName(GROUP_NAME)
    doc.InsertObject(root)

    env_path = os.path.join(tex, env_name())
    metal = metal_material(doc, env_path)
    gold = title_material(doc, env_path)
    skin, tiles = metal, None
    sbsar = substance_file(tex)
    if sbsar:
        worn = substance_material(doc, sbsar, env_path)
        if worn is not None:
            skin, tiles = worn, SBSAR_TILES
            SUBSTANCE.append(os.path.basename(sbsar))

    # Camera: low over the pool, aimed at the title, drifting one slow arc and
    # one slow push per loop.
    orbit = null("Camera Orbit", root)
    cam = c4d.BaseObject(c4d.Ocamera)
    cam.SetName("Molten Camera")
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

    light("Key", c4d.Vector(-900, 1100, -1500), c4d.Vector(1.0, 0.82, 0.55), 1.0, root)
    light("Rim", c4d.Vector(1300, 500, 1200), c4d.Vector(1.0, 0.6, 0.3), 1.2, root)

    molten_surface(root, skin, tiles)
    blobs(root, metal, shot["spread"])
    fog(doc)

    # Title: half under the surface, rocking a few degrees and bobbing once
    # per loop so the waves keep cutting across it.
    pivot = null("Title", root)
    pivot.SetRelPos(c4d.Vector(0, shot["title_h"] * TITLE_SINK, 0))
    title = metal_text("Title Letters", shot["title"], shot["title_h"], TITLE_DEPTH, pivot, gold)
    set_keys(pivot, pos_id("y"), cycle(shot["title_h"] * TITLE_SINK, 7.0, 1, math.pi))
    set_keys(pivot, rot_id("h"), cycle(0.0, deg(3.0), 1, 1.0))
    centre(doc, [title])
    return root, cam


def use_standard_engine(doc):
    """Before any Substance call: force the Standard renderer so imports stay
    Standard materials."""
    rd = doc.GetActiveRenderData()
    if rd is not None:
        put(rd, "RDATA_RENDERENGINE", const("RDATA_RENDERENGINE_STANDARD"))


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
        if mat.GetName().startswith("MLT_"):
            mat.Remove()
        mat = nxt


def main():
    del SKIPPED[:]
    del SUBSTANCE[:]
    del _FONT[:]
    del FACTS[:]
    _trace_load()
    if MODE not in SHOTS:
        gui.MessageDialog("MODE must be one of: {}.".format(", ".join(sorted(SHOTS))))
        return
    doc = c4d.documents.GetActiveDocument()
    tex = find_textures(doc)
    if not tex:
        gui.MessageDialog("Couldn't find {}. Put the {} folder next to this script "
                          "or your saved .c4d and run it again.".format(env_name(), TEX_FOLDER))
        return

    doc.StartUndo()
    try:
        clear_previous(doc)
        use_standard_engine(doc)
        root, cam = build(doc, tex)
        configure_document(doc, cam)
        undo_new = const("UNDOTYPE_NEWOBJ", "UNDOTYPE_NEW")
        if undo_new is not None:
            doc.AddUndo(undo_new, root)
    except Exception:
        _close_run()
        raise
    finally:
        doc.EndUndo()
        c4d.EventAdd()

    print("Molten pool built ({} shot, {}), textures from {}".format(MODE, PALETTE, tex))
    for line in SKIPPED:
        print("  skipped - " + line)
    extra = ""
    if CRASHED:
        extra += ("\nSkipped {} call(s) that crashed Cinema 4D last time: {}.\n"
                  "FORGET_CRASHES = True retries them.\n".format(
                      len(CRASHED), ", ".join(sorted(CRASHED))))
    if FACTS and not SUBSTANCE and any(l.startswith("Substance: ") for l in SKIPPED):
        extra += "\nThis build has: {}\n".format(FACTS[0])
    gui.MessageDialog(
        "Molten pool built (crash-safe build). {} setting(s) skipped{}.\n"
        "Substance: {}.\n{}\n"
        "Save the file, then Shift+R to render.".format(
            len(SKIPPED), " (see Console, Shift+F10)" if SKIPPED else "",
            SUBSTANCE[0] if SUBSTANCE else next(
                (l[11:] for l in SKIPPED if l.startswith("Substance: ")),
                "none found near {}".format(tex)), extra))
    _close_run()


if __name__ == "__main__":
    main()
