"""
BLACK HOLE STUDIOS — a black hole, built by script, in Cinema 4D.

Paste into Cinema 4D's Script Manager (Extensions → Script Manager → New) and
press Execute. It builds the whole rig from nothing: event horizon, accretion
disc, photon ring, the lensed halo arcing over the top, lighting, camera, and a
looping animation of the disc turning. Nothing here needs a plugin — it is all
standard material channels, and the script switches the render engine to
Standard itself.

  Why it forces Standard: Cinema 4D 2025+ starts new scenes in Redshift, and
  Redshift does not render Standard materials. The first run of this script
  "rendered" in Redshift and came out empty. Switch to Redshift later if you
  convert the materials.

THEN RENDER IT: save the .c4d first (the frames are written next to it), then
Render → Render to Picture Viewer (Shift+R). The PNGs land in bh_header/.

IF SOMETHING LOOKS WRONG: open Extensions → Console (Shift+F10). The script
prints every setting your version of Cinema 4D did not accept. It no longer
stops on one; it skips it and carries on, so you always get a rig.

WHAT IT IS ACTUALLY DRAWING
  horizon   a pure black sphere. Not dark grey — black. The hole is the absence
            of light, and any luminance on it reads instantly as a ball.
  disc      the accretion matter, a flat ring seen at a lean. White-hot at the
            inner edge, falling through orange to deep red at the rim, with
            turbulence noise so it is gas and not a painted gradient.
  ring      the photon sphere: the thin, too-bright circle of light bent right
            around the hole. This is the detail that sells it.
  halo      the lensed far side of the disc, standing straight up and over the
            top. In reality gravity bends the light from behind the hole up and
            over toward you; faked here with a second disc facing the camera,
            the same trick the Interstellar shot uses for its silhouette.

TUNE IT FROM THE CONFIG BLOCK BELOW — every number that matters is up there.
Run it again after a change; it clears its own objects first, so you can iterate
without a pile of duplicates.
"""

import math

import c4d
from c4d import gui, utils

# ── CONFIG ─────────────────────────────────────────────────────────────────

GROUP_NAME = "BLACK_HOLE_RIG"      # re-running the script replaces this group

# "header": the art for the Black Hole Studios tab. Square, transparent
#           background, a seamless loop (last frame flows into the first), PNG
#           sequence with alpha. Hand the folder back and it goes in the app.
# "hero":   the 1920x1080 cinematic shot with the camera drift.
MODE = "header"
HEADER_RES = 720                   # square; the tab shows it at ~350px on retina
HEADER_FOCUS = 34.0                # wide enough that the whole disc is in frame
OUTPUT_PATH = "bh_header/bh_"      # relative to the saved .c4d file

HORIZON_RADIUS = 100.0             # the black sphere
RING_RADIUS = 118.0                # photon ring, just outside the horizon
RING_THICKNESS = 2.2
DISC_INNER = 150.0                 # accretion disc, inner edge (the hot edge)
DISC_OUTER = 620.0                 # and outer rim
VIEW_ANGLE = 14.0                  # camera height above the disc plane, degrees;
                                   # 0 is dead edge-on, 90 straight down
HALO_SCALE = 1.0                   # the lensed arc over the top

FRAMES = 300                       # length of the loop (10 s at 30 fps)
FPS = 30
DISC_TURNS = 1.0                   # full rotations of the disc across FRAMES
CAM_ORBIT_DEG = 24.0               # hero mode only: slow camera drift
CAM_DISTANCE = DISC_OUTER * 2.25

RES_X, RES_Y = 1920, 1080          # hero mode

# The fire. Inner to outer: white-hot, gold, ember, dying red.
COLOR_CORE = c4d.Vector(1.00, 0.98, 0.92)
COLOR_HOT = c4d.Vector(1.00, 0.72, 0.28)
COLOR_MID = c4d.Vector(0.95, 0.32, 0.08)
COLOR_EDGE = c4d.Vector(0.36, 0.06, 0.02)

DISC_BRIGHTNESS = 2.6              # >1 so the inner edge blows out and blooms
RING_BRIGHTNESS = 5.0

# ── the event horizon's surface ────────────────────────────────────────────
# "shimmer" is the black anisotropic metal flow; "void" is flat, lightless
# black with no surface at all (physically the honest one).
HORIZON_STYLE = "shimmer"
HORIZON_ROUGHNESS = 0.22           # lower = tighter, wetter streaks
HORIZON_ANISOTROPY = 0.85          # how hard the highlight smears into bands
HORIZON_FLOW_SPEED = 0.30          # how fast the shimmer crawls
HORIZON_BUMP = 6.0                 # % relief, keep it small
HORIZON_SHEEN = c4d.Vector(0.30, 0.42, 0.62)   # the cold rim light on the metal

# A reflective black sphere in an empty room reflects nothing. This puts a dark
# graded sky around the rig, hidden from the camera, purely so the shimmer has
# something to catch.
ENV_SKY = True


# ── SAFE SETTERS ───────────────────────────────────────────────────────────
# Cinema 4D renames and renumbers parameters between versions, and one name
# this build has never heard of used to kill the whole script on that line —
# which left a half-built, empty scene. Everything optional now goes through
# put(): try each known name, then the parameter's label in the Attribute
# Manager, and if none of that works, note it and keep going.

SKIPPED = []


def deg(d):
    """Degrees the way a human says them, radians the way C4D wants them."""
    return utils.DegToRad(d)


def const(*names):
    """The first of these c4d constants this build has, or None."""
    for name in names:
        value = getattr(c4d, name, None)
        if value is not None:
            return value
    return None


def _find_by_label(node, label):
    try:
        desc = node.GetDescription(c4d.DESCFLAGS_DESC_0)
        for bc, param_id, _group in desc:
            if bc[c4d.DESC_NAME] == label:
                return param_id
    except Exception:
        pass
    return None


def _who(node):
    """A name for the console report; shaders have none, so use their type."""
    name = node.GetName()
    if not name and hasattr(node, "GetTypeName"):
        name = node.GetTypeName()
    return name or "?"


def put(node, names, value, label=None):
    """Set one parameter by any of its known names, or its UI label."""
    if isinstance(names, str):
        names = (names,)
    what = names[0] if names else label
    if value is None:
        SKIPPED.append("{}: {} (value not in this version)".format(_who(node), what))
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


class Section(object):
    """A build step that reports its failure instead of ending the script."""

    def __init__(self, name):
        self.name = name

    def __enter__(self):
        return self

    def __exit__(self, kind, err, _tb):
        if err is not None:
            SKIPPED.append("{} FAILED: {}: {}".format(self.name, kind.__name__, err))
        return True


def build_gradient(shader, knots, radial=True):
    """Fill a gradient shader. knots: [(color, position), ...]."""
    grad = c4d.Gradient()
    for index, (color, pos) in enumerate(knots):
        grad.InsertKnot(color, 1.0, pos, 0.5, index)
    put(shader, "SLA_GRADIENT_GRADIENT", grad)
    # 2D circular, so the gradient runs from the middle outward rather than
    # left to right across the disc.
    kind = const("SLA_GRADIENT_TYPE_2D_CIRC") if radial else const("SLA_GRADIENT_TYPE_2D_U")
    put(shader, "SLA_GRADIENT_TYPE", kind, "Type")
    return shader


def make_noise(rel_scale, scale, octaves, speed, contrast=None, brightness=None):
    noise = c4d.BaseShader(c4d.Xnoise)
    put(noise, "SLA_NOISE_NOISE", const("NOISE_FBM"), "Noise")
    put(noise, "SLA_NOISE_OCTAVES", float(octaves), "Octaves")
    put(noise, "SLA_NOISE_SCALE", scale, "Global Scale")
    put(noise, ("SLA_NOISE_RELSCALE", "SLA_NOISE_REL_SCALE"), rel_scale, "Relative Scale")
    put(noise, ("SLA_NOISE_ANI_SPEED", "SLA_NOISE_SPEED", "SLA_NOISE_ANIMATION_SPEED"),
        speed, "Animation Speed")
    # Repeat exactly once per loop, so frame FRAMES is frame 0 again and the
    # header never visibly jumps.
    put(noise, ("SLA_NOISE_LOOP_PERIOD", "SLA_NOISE_LOOPPERIOD"),
        float(FRAMES) / FPS, "Loop Period")
    put(noise, "SLA_NOISE_SPACE", const("SLA_NOISE_SPACE_UV"), "Space")
    if contrast is not None:
        put(noise, "SLA_NOISE_CONTRAST", contrast, "Contrast")
    if brightness is not None:
        put(noise, "SLA_NOISE_BRIGHTNESS", brightness, "Brightness")
    return noise


def set_keys(obj, desc_id, pairs):
    """Key one animatable value. `pairs` is [(frame, value), ...]."""
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
        # Linear in and out, or the disc visibly slows at each end of the loop.
        key.SetInterpolation(curve, c4d.CINTERPOLATION_LINEAR)
    return track


def rotation_id(axis):
    """DescID for one axis of an object's rotation. axis: 'h', 'p' or 'b'."""
    sub = {"h": c4d.VECTOR_X, "p": c4d.VECTOR_Y, "b": c4d.VECTOR_Z}[axis]
    return c4d.DescID(
        c4d.DescLevel(c4d.ID_BASEOBJECT_REL_ROTATION, c4d.DTYPE_VECTOR, 0),
        c4d.DescLevel(sub, c4d.DTYPE_REAL, 0),
    )


# ── MATERIALS ──────────────────────────────────────────────────────────────

def new_material(name):
    mat = c4d.BaseMaterial(c4d.Mmaterial)
    mat.SetName(name)
    put(mat, "MATERIAL_USE_COLOR", False)
    put(mat, "MATERIAL_USE_REFLECTION", False)
    return mat


def set_layer(mat, layer, name, value):
    """Set one reflectance-layer parameter, if this build has it."""
    param = const(name)
    if param is None or value is None:
        SKIPPED.append("{}: {}".format(mat.GetName(), name))
        return False
    try:
        mat[layer.GetDataID() + param] = value
        return True
    except Exception:
        SKIPPED.append("{}: {}".format(mat.GetName(), name))
        return False


def make_horizon_material(doc):
    """
    BLACK, BUT ALIVE — the shimmery metallic flow, in black.

    Chris, 2026-09-12: *"that shimmery, like, metallic flow material... it's
    gonna be like a black shimmery flow."*

    The base stays at zero and every bit of the shimmer comes from reflectance.
    Lift the diffuse colour even slightly and it turns grey, and grey is a ball.
    Anisotropic GGX smears the highlight into streaks (the "flow"), a Fresnel
    ramp keeps it black facing you and lit at the rim, and animated noise on
    the roughness makes the shimmer crawl.
    """
    mat = new_material("BH_Horizon")
    put(mat, "MATERIAL_USE_LUMINANCE", False)
    doc.InsertMaterial(mat)

    if HORIZON_STYLE != "shimmer":
        put(mat, "MATERIAL_USE_COLOR", True)
        put(mat, "MATERIAL_COLOR_COLOR", c4d.Vector(0, 0, 0))
        mat.Update(True, True)
        return mat

    with Section("horizon shimmer"):
        put(mat, "MATERIAL_USE_REFLECTION", True)
        layer = mat.AddReflectionLayer()
        layer.SetName("Black Flow")

        set_layer(mat, layer, "REFLECTION_LAYER_MAIN_DISTRIBUTION",
                  const("REFLECTION_DISTRIBUTION_GGX"))
        set_layer(mat, layer, "REFLECTION_LAYER_MAIN_VALUE_ROUGHNESS", HORIZON_ROUGHNESS)
        set_layer(mat, layer, "REFLECTION_LAYER_MAIN_VALUE_REFLECTION", 1.0)
        set_layer(mat, layer, "REFLECTION_LAYER_MAIN_VALUE_SPECULAR", 0.0)
        # Metal, not plastic: oil on steel, not a bowling ball.
        set_layer(mat, layer, "REFLECTION_LAYER_FRESNEL_MODE",
                  const("REFLECTION_FRESNEL_CONDUCTOR"))
        set_layer(mat, layer, "REFLECTION_LAYER_FRESNEL_VALUE_IOR", 2.4)
        set_layer(mat, layer, "REFLECTION_LAYER_ANISOTROPY_SCRATCHES",
                  const("REFLECTION_ANISOTROPY_SCRATCHES_RADIAL"))
        set_layer(mat, layer, "REFLECTION_LAYER_ANISOTROPY_AMOUNT", HORIZON_ANISOTROPY)
        set_layer(mat, layer, "REFLECTION_LAYER_ANISOTROPY_ATTENUATION", 0.35)
        set_layer(mat, layer, "REFLECTION_LAYER_ANISOTROPY_SCALE", 0.55)

        # Layer colour: black facing you, lit at the grazing edge.
        rim = c4d.BaseShader(c4d.Xfresnel)
        rim_grad = c4d.Gradient()
        rim_grad.InsertKnot(c4d.Vector(0.015, 0.015, 0.02), 1.0, 0.0, 0.5, 0)
        rim_grad.InsertKnot(c4d.Vector(0.10, 0.11, 0.16), 1.0, 0.62, 0.5, 1)
        rim_grad.InsertKnot(HORIZON_SHEEN, 1.0, 1.0, 0.5, 2)
        rim_ok = put(rim, "SLA_FRESNEL_GRADIENT", rim_grad, "Gradient")
        mat.InsertShader(rim)
        if not (rim_ok and set_layer(mat, layer, "REFLECTION_LAYER_COLOR_TEXTURE", rim)):
            set_layer(mat, layer, "REFLECTION_LAYER_COLOR_COLOR", HORIZON_SHEEN * 0.4)

        # The flow: animated noise driving the roughness, stretched into bands.
        flow = make_noise(c4d.Vector(1.0, 0.18, 1.0), 0.9, 5, HORIZON_FLOW_SPEED,
                          contrast=0.45, brightness=0.0)
        mat.InsertShader(flow)
        set_layer(mat, layer, "REFLECTION_LAYER_MAIN_SHADER_ROUGHNESS", flow)

        # And a whisper of relief so the light has something to catch.
        bump = make_noise(c4d.Vector(1.0, 0.18, 1.0), 0.7, 4, HORIZON_FLOW_SPEED)
        mat.InsertShader(bump)
        put(mat, "MATERIAL_USE_BUMP", True)
        put(mat, "MATERIAL_BUMP_SHADER", bump)
        put(mat, "MATERIAL_BUMP_STRENGTH", HORIZON_BUMP / 100.0)

    mat.Update(True, True)
    return mat


def make_disc_material(doc, name):
    """
    The glowing gas.

    Luminance, not Colour: this thing emits. The alpha channel punches the hole
    in the middle and fades the rim off into nothing so the disc has no cut edge.
    """
    mat = new_material(name)
    doc.InsertMaterial(mat)
    put(mat, "MATERIAL_USE_LUMINANCE", True)
    put(mat, "MATERIAL_LUMINANCE_BRIGHTNESS", DISC_BRIGHTNESS)

    heat_knots = [(COLOR_CORE, 0.00), (COLOR_HOT, 0.22),
                  (COLOR_MID * 0.8, 0.55), (COLOR_EDGE * 0.5, 1.00)]

    # Heat gradient multiplied by turbulence, so it is gas and not a painted
    # ring. If this build's Fusion shader won't wire up, fall back to the plain
    # gradient — still a disc, just a smoother one.
    with Section(name + " luminance"):
        heat = build_gradient(c4d.BaseShader(c4d.Xgradient), heat_knots)
        turb = make_noise(c4d.Vector(0.06, 1.0, 1.0), 1.4, 6, 0.35,
                          contrast=0.28, brightness=0.22)
        fusion = c4d.BaseShader(c4d.Xfusion)
        fusion.InsertShader(heat)
        fusion.InsertShader(turb)
        wired = (put(fusion, "SLA_FUSION_MODE", const("SLA_FUSION_MODE_MULTIPLY"), "Blend Mode")
                 and put(fusion, ("SLA_FUSION_BASE_CHANNEL", "SLA_FUSION_BASE"), heat)
                 and put(fusion, ("SLA_FUSION_BLEND_CHANNEL", "SLA_FUSION_BLEND"), turb))
        if wired:
            put(fusion, "SLA_FUSION_USE_MASK", False)
            mat.InsertShader(fusion)
            put(mat, "MATERIAL_LUMINANCE_SHADER", fusion)
        else:
            plain = build_gradient(c4d.BaseShader(c4d.Xgradient), heat_knots)
            mat.InsertShader(plain)
            put(mat, "MATERIAL_LUMINANCE_SHADER", plain)

    # Alpha: the hole in the middle, and a soft outer rim.
    with Section(name + " alpha"):
        black, white = c4d.Vector(0, 0, 0), c4d.Vector(1, 1, 1)
        alpha = build_gradient(c4d.BaseShader(c4d.Xgradient), [
            (black, 0.00), (black, 0.30),   # transparent at the centre
            (white, 0.38),                  # hard-ish inner edge
            (white, 0.78), (black, 1.00),   # and fade the rim away
        ])
        mat.InsertShader(alpha)
        put(mat, "MATERIAL_USE_ALPHA", True)
        put(mat, "MATERIAL_ALPHA_SHADER", alpha)
        put(mat, "MATERIAL_ALPHA_SOFT", True)

    mat.Update(True, True)
    return mat


def make_ring_material(doc):
    """The photon ring: one colour, far too bright, no texture at all."""
    mat = new_material("BH_PhotonRing")
    doc.InsertMaterial(mat)
    put(mat, "MATERIAL_USE_LUMINANCE", True)
    put(mat, "MATERIAL_LUMINANCE_COLOR", COLOR_CORE)
    put(mat, "MATERIAL_LUMINANCE_BRIGHTNESS", RING_BRIGHTNESS)
    mat.Update(True, True)
    return mat


def texture_tag(obj, mat, projection, radius=None):
    tag = c4d.TextureTag()
    tag.SetMaterial(mat)
    put(tag, "TEXTURETAG_PROJECTION", projection)
    if radius is not None:
        # Flat projection sized to the rim, or the radial gradient covers only
        # the middle and tiles across the rest of the disc.
        size = c4d.Vector(radius, radius, radius)
        if not put(tag, "TEXTURETAG_SIZE", size, "Length"):
            try:
                tag.SetScale(size)
                SKIPPED.pop()   # the fallback worked; not a real skip
            except Exception:
                pass
        put(tag, "TEXTURETAG_TILE", False, "Tile")
    obj.InsertTag(tag)
    return tag


# ── THE RIG ────────────────────────────────────────────────────────────────

def null(name, parent):
    obj = c4d.BaseObject(c4d.Onull)
    obj.SetName(name)
    obj.InsertUnder(parent)
    return obj


def make_disc(name, inner, outer, parent):
    disc = c4d.BaseObject(c4d.Odisc)
    disc.SetName(name)
    put(disc, "PRIM_DISC_IRAD", inner, "Inner Radius")
    put(disc, "PRIM_DISC_ORAD", outer, "Outer Radius")
    # Lie in its own XY plane, so a plain flat projection lands face-on and
    # the parent null alone decides which way it faces.
    put(disc, "PRIM_AXIS", const("PRIM_AXIS_ZP"), "Orientation")
    # Smooth rim. Labels first: 4 rotation segments is a diamond, and which
    # constant means which has not been stable.
    if not put(disc, (), 128, "Rotation Segments"):
        SKIPPED.pop()
        put(disc, "PRIM_DISC_SUB", 128)
    if not put(disc, (), 8, "Disc Segments"):
        SKIPPED.pop()
        put(disc, "PRIM_DISC_DSUB", 8)
    disc.InsertUnder(parent)
    return disc


def build(doc):
    root = c4d.BaseObject(c4d.Onull)
    root.SetName(GROUP_NAME)
    doc.InsertObject(root)

    mat_horizon = make_horizon_material(doc)
    mat_disc = make_disc_material(doc, "BH_Disc")
    mat_halo = make_disc_material(doc, "BH_LensedHalo")
    mat_ring = make_ring_material(doc)

    spherical = const("TEXTURETAG_PROJECTION_SPHERICAL")
    flat = const("TEXTURETAG_PROJECTION_FLAT")

    # --- camera first: the halo and ring turn to face it -------------------
    # Low and close to the disc plane. From above a black hole is a dot on a
    # plate; from just off the edge the disc runs across the front and the
    # lensed halo comes over the top. That near-edge-on angle IS the shot.
    orbit = null("Camera Orbit", root)
    cam = c4d.BaseObject(c4d.Ocamera)
    cam.SetName("BH Camera")
    put(cam, "CAMERA_FOCUS", HEADER_FOCUS if MODE == "header" else 55.0, "Focal Length")
    cam.SetRelPos(c4d.Vector(0, CAM_DISTANCE * math.sin(deg(VIEW_ANGLE)),
                             -CAM_DISTANCE * math.cos(deg(VIEW_ANGLE))))
    cam.InsertUnder(orbit)

    # --- event horizon ------------------------------------------------------
    horizon = c4d.BaseObject(c4d.Osphere)
    horizon.SetName("Event Horizon")
    horizon[c4d.PRIM_SPHERE_RAD] = HORIZON_RADIUS
    put(horizon, "PRIM_SPHERE_SUB", 64)
    horizon.InsertUnder(root)
    texture_tag(horizon, mat_horizon, spherical)

    aim = c4d.BaseTag(c4d.Ttargetexpression)
    aim[c4d.TARGETEXPRESSIONTAG_LINK] = horizon
    cam.InsertTag(aim)

    # --- the face-the-camera group: photon ring and lensed halo -------------
    # The photon ring is a circle around the SILHOUETTE, and the halo is light
    # from behind bent up and over: both always face you, whatever the angle.
    facing = null("Faces Camera", root)
    face = c4d.BaseTag(c4d.Ttargetexpression)
    face[c4d.TARGETEXPRESSIONTAG_LINK] = cam
    facing.InsertTag(face)

    with Section("photon ring"):
        ring = c4d.BaseObject(c4d.Otorus)
        ring.SetName("Photon Ring")
        put(ring, "PRIM_TORUS_OUTERRAD", RING_RADIUS, "Ring Radius")
        put(ring, "PRIM_TORUS_INNERRAD", RING_THICKNESS, "Pipe Radius")
        put(ring, "PRIM_TORUS_SEG", 128, "Ring Segments")
        put(ring, "PRIM_TORUS_CSUB", 16, "Pipe Segments")
        put(ring, "PRIM_AXIS", const("PRIM_AXIS_ZP"), "Orientation")
        ring.InsertUnder(facing)
        texture_tag(ring, mat_ring, flat)

    halo = make_disc("Lensed Halo", DISC_INNER * 0.92 * HALO_SCALE,
                     DISC_OUTER * 0.78 * HALO_SCALE, facing)
    texture_tag(halo, mat_halo, flat, radius=DISC_OUTER * 0.78 * HALO_SCALE)

    # --- accretion disc -----------------------------------------------------
    # The plane lives on a parent; the disc itself only spins about its own
    # axis. Spinning a tilted disc on a world axis makes it wobble like a coin.
    plane = null("Disc Plane", root)
    plane.SetRelRot(c4d.Vector(0, deg(90), 0))
    disc = make_disc("Accretion Disc", DISC_INNER, DISC_OUTER, plane)
    texture_tag(disc, mat_disc, flat, radius=DISC_OUTER)

    # --- something for the shimmer to reflect -------------------------------
    if ENV_SKY and HORIZON_STYLE == "shimmer":
        with Section("reflection sky"):
            sky_mat = new_material("BH_Sky")
            doc.InsertMaterial(sky_mat)
            put(sky_mat, "MATERIAL_USE_LUMINANCE", True)
            sky_grad = build_gradient(c4d.BaseShader(c4d.Xgradient), [
                (c4d.Vector(0.010, 0.012, 0.020), 0.00),
                (c4d.Vector(0.030, 0.045, 0.075), 0.55),
                (c4d.Vector(0.005, 0.006, 0.010), 1.00),
            ], radial=False)
            sky_mat.InsertShader(sky_grad)
            put(sky_mat, "MATERIAL_LUMINANCE_SHADER", sky_grad)
            sky_mat.Update(True, True)

            sky = c4d.BaseObject(c4d.Osky)
            sky.SetName("Reflection Sky")
            sky.InsertUnder(root)
            texture_tag(sky, sky_mat, spherical)

            # Reflection only. If this build won't hide it from the camera it
            # goes, because a visible sky fills the transparent background.
            comp = c4d.BaseTag(c4d.Tcompositing)
            hidden = put(comp, "COMPOSITINGTAG_SEENBYCAMERA", False, "Seen by Camera")
            put(comp, "COMPOSITINGTAG_SEENBYREFLECTION", True, "Seen by Reflection")
            sky.InsertTag(comp)
            if not hidden:
                sky.Remove()
                SKIPPED.append("reflection sky removed: could not hide it from camera")

    # --- light --------------------------------------------------------------
    # Luminance does not light anything in the Standard renderer. This omni at
    # the centre does the real lighting, with a little visible haze.
    with Section("core light"):
        light = c4d.BaseObject(c4d.Olight)
        light.SetName("Core Glow")
        put(light, "LIGHT_TYPE", const("LIGHT_TYPE_OMNI"))
        put(light, "LIGHT_COLOR", COLOR_HOT)
        put(light, "LIGHT_BRIGHTNESS", 1.2, "Intensity")
        put(light, "LIGHT_DETAILS_FALLOFF", const("LIGHT_DETAILS_FALLOFF_INVERSESQUARECLAMPED"))
        put(light, "LIGHT_DETAILS_OUTERDISTANCE", DISC_OUTER * 1.4)
        put(light, "LIGHT_VISIBILITY_TYPE", const("LIGHT_VISIBILITY_TYPE_VISIBLE"))
        put(light, "LIGHT_VISIBILITY_INNERDISTANCE", HORIZON_RADIUS * 0.5)
        put(light, "LIGHT_VISIBILITY_OUTERDISTANCE", DISC_OUTER * 0.9)
        put(light, "LIGHT_VISIBILITY_BRIGHTNESS", 0.30)
        put(light, "LIGHT_SHADOWTYPE", const("LIGHT_SHADOWTYPE_NONE"))
        light.InsertUnder(root)

    # --- animation ----------------------------------------------------------
    # The disc turns; its noise churns on its own, looping with the disc. The
    # halo turns the other way: you are looking at the far side of the disc.
    with Section("animation"):
        turn = deg(360.0 * DISC_TURNS)
        set_keys(disc, rotation_id("b"), [(0, 0.0), (FRAMES, turn)])
        set_keys(halo, rotation_id("b"), [(0, 0.0), (FRAMES, -turn)])
        # Hero only: a drift that never comes back would put a jump in a loop.
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
        # Standard, not Redshift: see the note at the top of the file.
        put(rd, "RDATA_RENDERENGINE", const("RDATA_RENDERENGINE_STANDARD"))
        put(rd, "RDATA_XRES", float(HEADER_RES if header else RES_X))
        put(rd, "RDATA_YRES", float(HEADER_RES if header else RES_Y))
        put(rd, "RDATA_FRAMERATE", float(FPS))
        put(rd, "RDATA_FRAMESEQUENCE", const("RDATA_FRAMESEQUENCE_MANUAL"))
        put(rd, "RDATA_FRAMEFROM", c4d.BaseTime(0, FPS))
        # Header: stop one short. Frame FRAMES is frame 0 again; rendering both
        # puts a held frame, a visible hitch, at the loop point.
        put(rd, "RDATA_FRAMETO", c4d.BaseTime(FRAMES - 1 if header else FRAMES, FPS))
        if header:
            put(rd, "RDATA_SAVEIMAGE", True)
            put(rd, "RDATA_PATH", OUTPUT_PATH)
            put(rd, "RDATA_FORMAT", const("FILTER_PNG"))
            put(rd, "RDATA_ALPHACHANNEL", True)
            # Straight alpha: no dark fringe when it sits on the app's graphite.
            put(rd, "RDATA_STRAIGHTALPHA", True)
            put(rd, "RDATA_FORMATDEPTH", const("RDATA_FORMATDEPTH_8"))

    # Look (and render) through the camera we just built.
    bd = doc.GetActiveBaseDraw()
    if bd is not None:
        bd.SetSceneCamera(cam)


def clear_previous(doc):
    """Re-running the script replaces its own rig instead of stacking another."""
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
        c4d.EventAdd()   # always, or a failed run leaves the viewport stale

    print("Black hole rig built ({} mode): {} frames at {} fps.".format(MODE, FRAMES, FPS))
    if SKIPPED:
        print("Settings this version of Cinema 4D did not take ({}):".format(len(SKIPPED)))
        for line in SKIPPED:
            print("  - " + line)
    else:
        print("Every setting applied.")
    if MODE == "header":
        print("Save the .c4d, then Render to Picture Viewer (Shift+R). "
              "PNGs land in {}*.png next to the file.".format(OUTPUT_PATH))
    gui.MessageDialog(
        "Black hole built. {} setting(s) skipped (see Console, Shift+F10).\n\n"
        "Save the file, then Shift+R to render.".format(len(SKIPPED)))


if __name__ == "__main__":
    main()
