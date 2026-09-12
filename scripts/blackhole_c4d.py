"""
BLACK HOLE STUDIOS — a black hole, built by script, in Cinema 4D.

Paste into Cinema 4D's Script Manager (Extensions → Script Manager → New) and
press Execute. It builds the whole rig from nothing: event horizon, accretion
disc, photon ring, the lensed halo arcing over the top, lighting, camera, and a
360-frame animation of the disc turning. Nothing here needs a plugin or a
third-party renderer — it is all standard material channels, so it renders in
the Standard/Physical renderer out of the box and converts cleanly if you want
to take it into Redshift later.

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
            over toward you; faked here with a second disc at 90°, which is the
            same trick the Interstellar shot uses for its silhouette.

TUNE IT FROM THE CONFIG BLOCK BELOW — every number that matters is up there.
Run it again after a change; it clears its own objects first, so you can iterate
without a pile of duplicates.
"""

import math

import c4d
from c4d import utils

# ── CONFIG ─────────────────────────────────────────────────────────────────

GROUP_NAME = "BLACK_HOLE_RIG"      # re-running the script replaces this group

HORIZON_RADIUS = 100.0             # the black sphere
RING_RADIUS = 118.0                # photon ring, just outside the horizon
RING_THICKNESS = 2.2
DISC_INNER = 150.0                 # accretion disc, inner edge (the hot edge)
DISC_OUTER = 620.0                 # and outer rim
DISC_TILT = 76.0                   # degrees off flat-on; 90 is dead edge-on
HALO_SCALE = 1.0                   # the lensed arc over the top

FRAMES = 360                       # length of the animation
FPS = 30
DISC_TURNS = 1.0                   # full rotations of the disc across FRAMES
CAM_ORBIT_DEG = 24.0               # slow camera drift, degrees across FRAMES

RES_X, RES_Y = 1920, 1080

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

# A reflective black sphere in an empty room reflects an empty room, which is
# to say it reflects nothing and you have built a flat black ball again. This
# puts a dark graded sky around the rig purely so the shimmer has something to
# catch. Turn it off if you are lighting the scene yourself with an HDRI.
ENV_SKY = True


# ── SMALL HELPERS ──────────────────────────────────────────────────────────

def deg(d):
    """Degrees the way a human says them, radians the way C4D wants them."""
    return utils.DegToRad(d)


def gradient_knot(color, pos, brightness=1.0):
    knot = c4d.GradientKnot()
    knot.col = color * brightness
    knot.pos = pos
    knot.bias = 0.5
    return knot


def build_gradient(shader, knots, radial=True):
    """Fill a gradient shader with knots given as (color, position) pairs."""
    grad = c4d.Gradient()
    for knot in knots:
        grad.InsertKnot(col=knot.col, pos=knot.pos, bias=knot.bias)
    shader[c4d.SLA_GRADIENT_GRADIENT] = grad
    # 2D circular, so the gradient runs from the middle outward rather than
    # left to right across the disc.
    shader[c4d.SLA_GRADIENT_TYPE] = (c4d.SLA_GRADIENT_TYPE_2D_CIRC if radial
                                     else c4d.SLA_GRADIENT_TYPE_2D_U)
    return shader


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

def cid(name):
    """
    A constant by name, or None if this build of Cinema 4D does not have it.

    The reflectance channel has been renumbered more than once across versions,
    and a script that writes a parameter ID the installed build has never heard
    of dies on that line with a traceback. Everything optional goes through here
    so an older or newer C4D loses one setting instead of the whole rig.
    """
    return getattr(c4d, name, None)


def set_layer(mat, layer, name, value):
    """Set one reflectance-layer parameter, if this build has it."""
    param = cid(name)
    if param is None:
        return False
    try:
        mat[layer.GetDataID() + param] = value
        return True
    except (AttributeError, TypeError, IndexError):
        return False


def make_horizon_material(doc):
    """
    BLACK, BUT ALIVE — the shimmery metallic flow, in black.

    Chris, 2026-09-12: *"that shimmery, like, metallic flow material... it's
    gonna be like a black shimmery flow."*

    The trick to a black metal that still reads as metal is that the BASE stays
    at zero and every bit of the shimmer comes from reflectance. Lift the
    diffuse colour even slightly to "see it better" and it turns grey, and grey
    is a ball. So:

      colour        off entirely. Nothing diffuse, ever.
      reflectance   a GGX layer with anisotropy, which is what makes a metal
                    smear its highlight into streaks instead of a single dot.
                    That streak is the "flow".
      layer colour  a Fresnel ramp — near-black facing you, hot at the grazing
                    rim. Physically this is also how a real horizon behaves, so
                    the art direction and the physics agree for once.
      roughness     driven by animated turbulence noise, which is what makes the
                    shimmer MOVE. A static anisotropic metal is jewellery; one
                    whose roughness crawls is liquid.
      bump          the same noise again, faintly, so the surface has relief.

    Set HORIZON_STYLE = "void" at the top for the flat, physically honest black
    hole with no surface at all.
    """
    mat = c4d.BaseMaterial(c4d.Mmaterial)
    mat.SetName("BH_Horizon")

    # Never a diffuse colour. This is the whole discipline of a black material.
    mat[c4d.MATERIAL_USE_COLOR] = False
    mat[c4d.MATERIAL_USE_LUMINANCE] = False
    mat[c4d.MATERIAL_USE_SPECULAR] = False

    if HORIZON_STYLE != "shimmer":
        mat[c4d.MATERIAL_USE_COLOR] = True
        mat[c4d.MATERIAL_COLOR_COLOR] = c4d.Vector(0, 0, 0)
        mat[c4d.MATERIAL_USE_REFLECTION] = False
        mat.Update(True, True)
        doc.InsertMaterial(mat)
        return mat

    mat[c4d.MATERIAL_USE_REFLECTION] = True
    layer = mat.AddReflectionLayer()
    layer.SetName("Black Flow")

    set_layer(mat, layer, "REFLECTION_LAYER_MAIN_DISTRIBUTION",
              cid("REFLECTION_DISTRIBUTION_GGX"))
    set_layer(mat, layer, "REFLECTION_LAYER_MAIN_ROUGHNESS", HORIZON_ROUGHNESS)
    set_layer(mat, layer, "REFLECTION_LAYER_MAIN_VALUE_REFLECTION", 1.0)
    set_layer(mat, layer, "REFLECTION_LAYER_MAIN_VALUE_SPECULAR", 0.0)

    # Metal, not plastic: a conductor Fresnel is what stops it reading as a
    # shiny black bowling ball and starts it reading as oil on steel.
    set_layer(mat, layer, "REFLECTION_LAYER_FRESNEL_MODE",
              cid("REFLECTION_FRESNEL_CONDUCTOR"))
    set_layer(mat, layer, "REFLECTION_LAYER_FRESNEL_VALUE_IOR", 2.4)

    # --- the anisotropy: a smeared, brushed-metal highlight -----------------
    set_layer(mat, layer, "REFLECTION_LAYER_ANISOTROPY_SCRATCHES",
              cid("REFLECTION_ANISOTROPY_SCRATCHES_RADIAL"))
    set_layer(mat, layer, "REFLECTION_LAYER_ANISOTROPY_AMOUNT", HORIZON_ANISOTROPY)
    set_layer(mat, layer, "REFLECTION_LAYER_ANISOTROPY_ATTENUATION", 0.35)
    set_layer(mat, layer, "REFLECTION_LAYER_ANISOTROPY_SCALE", 0.55)

    # --- layer colour: black facing you, lit at the grazing edge ------------
    rim = c4d.BaseShader(c4d.Xfresnel)
    rim_grad = c4d.Gradient()
    rim_grad.InsertKnot(col=c4d.Vector(0.015, 0.015, 0.02), pos=0.0, bias=0.5)
    rim_grad.InsertKnot(col=c4d.Vector(0.10, 0.11, 0.16), pos=0.62, bias=0.5)
    rim_grad.InsertKnot(col=HORIZON_SHEEN, pos=1.0, bias=0.5)
    rim[c4d.SLA_FRESNEL_GRADIENT] = rim_grad
    mat.InsertShader(rim)
    if not set_layer(mat, layer, "REFLECTION_LAYER_COLOR_TEXTURE", rim):
        set_layer(mat, layer, "REFLECTION_LAYER_COLOR_COLOR", HORIZON_SHEEN * 0.4)

    # --- the flow: animated turbulence driving the roughness ---------------
    flow = c4d.BaseShader(c4d.Xnoise)
    flow[c4d.SLA_NOISE_NOISE] = c4d.NOISE_FBM
    flow[c4d.SLA_NOISE_OCTAVES] = 5.0
    flow[c4d.SLA_NOISE_SCALE] = 0.9
    flow[c4d.SLA_NOISE_CONTRAST] = 0.45
    flow[c4d.SLA_NOISE_BRIGHTNESS] = 0.0
    # Stretched around the sphere so the shimmer runs in bands rather than
    # bubbling in place — bands are what read as flow.
    flow[c4d.SLA_NOISE_RELSCALE] = c4d.Vector(1.0, 0.18, 1.0)
    flow[c4d.SLA_NOISE_ANI_SPEED] = HORIZON_FLOW_SPEED
    flow[c4d.SLA_NOISE_SPACE] = c4d.SLA_NOISE_SPACE_UV
    mat.InsertShader(flow)
    set_layer(mat, layer, "REFLECTION_LAYER_MAIN_SHADER_ROUGHNESS", flow)
    set_layer(mat, layer, "REFLECTION_LAYER_MAIN_VALUE_ROUGHNESS", HORIZON_ROUGHNESS)

    # --- and a whisper of relief so the light has something to catch -------
    mat[c4d.MATERIAL_USE_BUMP] = True
    bump = c4d.BaseShader(c4d.Xnoise)
    bump[c4d.SLA_NOISE_NOISE] = c4d.NOISE_FBM
    bump[c4d.SLA_NOISE_OCTAVES] = 4.0
    bump[c4d.SLA_NOISE_SCALE] = 0.7
    bump[c4d.SLA_NOISE_RELSCALE] = c4d.Vector(1.0, 0.18, 1.0)
    bump[c4d.SLA_NOISE_ANI_SPEED] = HORIZON_FLOW_SPEED
    bump[c4d.SLA_NOISE_SPACE] = c4d.SLA_NOISE_SPACE_UV
    mat[c4d.MATERIAL_BUMP_SHADER] = bump
    mat.InsertShader(bump)
    mat[c4d.MATERIAL_BUMP_STRENGTH] = HORIZON_BUMP

    mat.Update(True, True)
    doc.InsertMaterial(mat)
    return mat


def make_disc_material(doc, name="BH_Disc"):
    """
    The glowing gas.

    Luminance, not Colour: this thing emits. A disc lit by a lamp reads as a
    dusty plate; a disc that is its own light source reads as plasma. The alpha
    channel punches the hole in the middle and fades the outer rim off into
    nothing so the disc has no cut edge.
    """
    mat = c4d.BaseMaterial(c4d.Mmaterial)
    mat.SetName(name)

    mat[c4d.MATERIAL_USE_COLOR] = False
    mat[c4d.MATERIAL_USE_REFLECTION] = False
    mat[c4d.MATERIAL_USE_SPECULAR] = False

    # --- Luminance: the heat gradient, multiplied by turbulence -------------
    mat[c4d.MATERIAL_USE_LUMINANCE] = True

    fusion = c4d.BaseShader(c4d.Xfusion)
    fusion[c4d.SLA_FUSION_MODE] = c4d.SLA_FUSION_MODE_MULTIPLY
    fusion[c4d.SLA_FUSION_USE_MASK] = False

    heat = c4d.BaseShader(c4d.Xgradient)
    build_gradient(heat, [
        gradient_knot(COLOR_CORE, 0.00, DISC_BRIGHTNESS),
        gradient_knot(COLOR_HOT, 0.22, DISC_BRIGHTNESS),
        gradient_knot(COLOR_MID, 0.55, DISC_BRIGHTNESS * 0.8),
        gradient_knot(COLOR_EDGE, 1.00, DISC_BRIGHTNESS * 0.5),
    ])

    # Stretched noise: gas smeared around the direction of travel, not blotchy.
    turb = c4d.BaseShader(c4d.Xnoise)
    turb[c4d.SLA_NOISE_NOISE] = c4d.NOISE_FBM
    turb[c4d.SLA_NOISE_OCTAVES] = 6.0
    turb[c4d.SLA_NOISE_SCALE] = 1.4
    turb[c4d.SLA_NOISE_CONTRAST] = 0.28
    turb[c4d.SLA_NOISE_BRIGHTNESS] = 0.22
    turb[c4d.SLA_NOISE_RELSCALE] = c4d.Vector(0.06, 1.0, 1.0)   # smear it round
    turb[c4d.SLA_NOISE_ANI_SPEED] = 0.35                        # it churns
    turb[c4d.SLA_NOISE_SPACE] = c4d.SLA_NOISE_SPACE_UV

    fusion.InsertShader(heat)
    fusion[c4d.SLA_FUSION_BASE] = heat
    fusion.InsertShader(turb)
    fusion[c4d.SLA_FUSION_BLEND] = turb

    mat[c4d.MATERIAL_LUMINANCE_SHADER] = fusion
    mat.InsertShader(fusion)
    mat[c4d.MATERIAL_LUMINANCE_BRIGHTNESS] = 1.0

    # --- Alpha: the hole in the middle, and a soft outer rim ----------------
    mat[c4d.MATERIAL_USE_ALPHA] = True
    alpha = c4d.BaseShader(c4d.Xgradient)
    build_gradient(alpha, [
        gradient_knot(c4d.Vector(0, 0, 0), 0.00),   # transparent at the centre
        gradient_knot(c4d.Vector(0, 0, 0), 0.30),
        gradient_knot(c4d.Vector(1, 1, 1), 0.38),   # hard-ish inner edge
        gradient_knot(c4d.Vector(1, 1, 1), 0.78),
        gradient_knot(c4d.Vector(0, 0, 0), 1.00),   # and fade the rim away
    ])
    mat[c4d.MATERIAL_ALPHA_SHADER] = alpha
    mat.InsertShader(alpha)

    mat.Update(True, True)
    doc.InsertMaterial(mat)
    return mat


def make_ring_material(doc):
    """The photon ring: one colour, far too bright, no texture at all."""
    mat = c4d.BaseMaterial(c4d.Mmaterial)
    mat.SetName("BH_PhotonRing")
    mat[c4d.MATERIAL_USE_COLOR] = False
    mat[c4d.MATERIAL_USE_REFLECTION] = False
    mat[c4d.MATERIAL_USE_SPECULAR] = False
    mat[c4d.MATERIAL_USE_LUMINANCE] = True
    mat[c4d.MATERIAL_LUMINANCE_COLOR] = COLOR_CORE
    mat[c4d.MATERIAL_LUMINANCE_BRIGHTNESS] = RING_BRIGHTNESS
    mat.Update(True, True)
    doc.InsertMaterial(mat)
    return mat


def texture_tag(obj, mat, projection=c4d.TEXTURETAG_PROJECTION_FLAT):
    tag = c4d.TextureTag()
    tag.SetMaterial(mat)
    tag[c4d.TEXTURETAG_PROJECTION] = projection
    obj.InsertTag(tag)
    return tag


# ── THE RIG ────────────────────────────────────────────────────────────────

def build(doc):
    root = c4d.BaseObject(c4d.Onull)
    root.SetName(GROUP_NAME)
    doc.InsertObject(root)

    mat_horizon = make_horizon_material(doc)
    mat_disc = make_disc_material(doc)
    mat_halo = make_disc_material(doc, "BH_LensedHalo")
    mat_ring = make_ring_material(doc)

    # --- event horizon ------------------------------------------------------
    horizon = c4d.BaseObject(c4d.Osphere)
    horizon.SetName("Event Horizon")
    horizon[c4d.PRIM_SPHERE_RAD] = HORIZON_RADIUS
    horizon[c4d.PRIM_SPHERE_SUB] = 64
    horizon.InsertUnder(root)
    texture_tag(horizon, mat_horizon, c4d.TEXTURETAG_PROJECTION_SPHERICAL)

    # --- photon ring --------------------------------------------------------
    ring = c4d.BaseObject(c4d.Otorus)
    ring.SetName("Photon Ring")
    ring[c4d.PRIM_TORUS_OUTERRAD] = RING_RADIUS
    ring[c4d.PRIM_TORUS_INNERRAD] = RING_THICKNESS
    ring[c4d.PRIM_TORUS_SEG] = 128
    ring[c4d.PRIM_TORUS_CSUB] = 16
    # Standing up and facing camera, not lying flat with the disc: the photon
    # ring is a circle around the SILHOUETTE, which is why you see it whole.
    ring.SetRelRot(c4d.Vector(0, deg(90), 0))
    ring.InsertUnder(root)
    texture_tag(ring, mat_ring)

    # --- accretion disc -----------------------------------------------------
    disc = c4d.BaseObject(c4d.Odisc)
    disc.SetName("Accretion Disc")
    disc[c4d.PRIM_DISC_IRAD] = DISC_INNER
    disc[c4d.PRIM_DISC_ORAD] = DISC_OUTER
    disc[c4d.PRIM_DISC_SUB] = 4
    disc[c4d.PRIM_DISC_DISCSUB] = 24
    disc[c4d.PRIM_DISC_ROTSUB] = 128
    disc.SetRelRot(c4d.Vector(0, deg(90 - DISC_TILT), 0))
    disc.InsertUnder(root)
    texture_tag(disc, mat_disc)

    # --- the lensed far side, arcing over the top ---------------------------
    halo = c4d.BaseObject(c4d.Odisc)
    halo.SetName("Lensed Halo")
    halo[c4d.PRIM_DISC_IRAD] = DISC_INNER * 0.92 * HALO_SCALE
    halo[c4d.PRIM_DISC_ORAD] = DISC_OUTER * 0.78 * HALO_SCALE
    halo[c4d.PRIM_DISC_SUB] = 4
    halo[c4d.PRIM_DISC_DISCSUB] = 24
    halo[c4d.PRIM_DISC_ROTSUB] = 128
    # Straight up and perpendicular to the disc — this is the bent light from
    # the material passing BEHIND the hole, which gravity lifts into view.
    halo.SetRelRot(c4d.Vector(deg(90), 0, deg(90)))
    halo.InsertUnder(root)
    texture_tag(halo, mat_halo)

    # --- something for the shimmer to reflect -------------------------------
    if ENV_SKY and HORIZON_STYLE == "shimmer":
        sky_mat = c4d.BaseMaterial(c4d.Mmaterial)
        sky_mat.SetName("BH_Sky")
        sky_mat[c4d.MATERIAL_USE_COLOR] = False
        sky_mat[c4d.MATERIAL_USE_REFLECTION] = False
        sky_mat[c4d.MATERIAL_USE_SPECULAR] = False
        sky_mat[c4d.MATERIAL_USE_LUMINANCE] = True
        sky_grad = c4d.BaseShader(c4d.Xgradient)
        build_gradient(sky_grad, [
            gradient_knot(c4d.Vector(0.010, 0.012, 0.020), 0.00),
            gradient_knot(c4d.Vector(0.030, 0.045, 0.075), 0.55),
            gradient_knot(c4d.Vector(0.005, 0.006, 0.010), 1.00),
        ], radial=False)
        sky_mat[c4d.MATERIAL_LUMINANCE_SHADER] = sky_grad
        sky_mat.InsertShader(sky_grad)
        sky_mat.Update(True, True)
        doc.InsertMaterial(sky_mat)

        sky = c4d.BaseObject(c4d.Osky)
        sky.SetName("Reflection Sky")
        sky.InsertUnder(root)
        texture_tag(sky, sky_mat, c4d.TEXTURETAG_PROJECTION_SPHERICAL)

        # Seen directly it would grey out the background, so it is reflection
        # only — the camera still looks into black, the metal still has a world.
        comp = c4d.BaseTag(c4d.Tcompositing)
        comp[c4d.COMPOSITINGTAG_SEENBYCAMERA] = False
        comp[c4d.COMPOSITINGTAG_SEENBYREFLECTION] = True
        sky.InsertTag(comp)

    # --- light --------------------------------------------------------------
    # The disc emits via Luminance, which does not actually illuminate anything
    # in the Standard renderer. This omni sits at the centre and does the real
    # lighting work, with visible volumetrics for the haze around the hole.
    light = c4d.BaseObject(c4d.Olight)
    light.SetName("Core Glow")
    light[c4d.LIGHT_TYPE] = c4d.LIGHT_TYPE_OMNI
    light[c4d.LIGHT_COLOR] = COLOR_HOT
    light[c4d.LIGHT_BRIGHTNESS] = 1.2
    light[c4d.LIGHT_DETAILS_FALLOFF] = c4d.LIGHT_DETAILS_FALLOFF_INVERSESQUARECLAMPED
    light[c4d.LIGHT_DETAILS_OUTERDISTANCE] = DISC_OUTER * 1.4
    light[c4d.LIGHT_VISIBILITY_TYPE] = c4d.LIGHT_VISIBILITY_TYPE_VISIBLE
    light[c4d.LIGHT_VISIBILITY_INNERDISTANCE] = HORIZON_RADIUS * 0.5
    light[c4d.LIGHT_VISIBILITY_OUTERDISTANCE] = DISC_OUTER * 0.9
    light[c4d.LIGHT_VISIBILITY_BRIGHTNESS] = 0.30
    light[c4d.LIGHT_SHADOWTYPE] = c4d.LIGHT_SHADOWTYPE_NONE
    light.InsertUnder(root)

    # --- camera -------------------------------------------------------------
    # Low and close to the disc plane. Seen from above, a black hole is a dot in
    # a plate; seen from just off the edge, the disc runs across the front and
    # the lensed halo comes over the top. That near-edge-on angle IS the shot.
    cam = c4d.BaseObject(c4d.Ocamera)
    cam.SetName("BH Camera")
    cam[c4d.CAMERA_FOCUS] = 55.0
    cam.SetRelPos(c4d.Vector(0, DISC_OUTER * 0.28, -DISC_OUTER * 2.25))
    cam.SetRelRot(c4d.Vector(0, deg(-7), 0))
    cam.InsertUnder(root)

    target = c4d.BaseTag(c4d.Ttargetexpression)
    target[c4d.TARGETEXPRESSIONTAG_LINK] = horizon
    cam.InsertTag(target)

    # --- animation ----------------------------------------------------------
    # The disc turns; the noise in its material churns on its own (ANI_SPEED),
    # so the gas moves as well as revolves. The halo turns with it, backwards,
    # because you are looking at the far side of the same disc.
    set_keys(disc, rotation_id("h"), [(0, 0.0), (FRAMES, deg(360.0 * DISC_TURNS))])
    set_keys(halo, rotation_id("b"), [(0, deg(90)), (FRAMES, deg(90) - deg(360.0 * DISC_TURNS))])

    # A drift, not an orbit. Movement enough to feel three-dimensional, slow
    # enough that it can loop behind a title without pulling the eye.
    orbit = c4d.BaseObject(c4d.Onull)
    orbit.SetName("Camera Orbit")
    orbit.InsertUnder(root)
    cam.InsertUnder(orbit)
    set_keys(orbit, rotation_id("h"), [(0, deg(-CAM_ORBIT_DEG / 2.0)),
                                       (FRAMES, deg(CAM_ORBIT_DEG / 2.0))])

    return root, cam


def configure_document(doc, cam):
    doc.SetFps(FPS)
    doc.SetMinTime(c4d.BaseTime(0, FPS))
    doc.SetMaxTime(c4d.BaseTime(FRAMES, FPS))
    doc.SetLoopMinTime(c4d.BaseTime(0, FPS))
    doc.SetLoopMaxTime(c4d.BaseTime(FRAMES, FPS))

    rd = doc.GetActiveRenderData()
    if rd is not None:
        rd[c4d.RDATA_XRES] = float(RES_X)
        rd[c4d.RDATA_YRES] = float(RES_Y)
        rd[c4d.RDATA_FRAMERATE] = float(FPS)
        rd[c4d.RDATA_FRAMESEQUENCE] = c4d.RDATA_FRAMESEQUENCE_MANUAL
        rd[c4d.RDATA_FRAMEFROM] = c4d.BaseTime(0, FPS)
        rd[c4d.RDATA_FRAMETO] = c4d.BaseTime(FRAMES, FPS)

    # Look through the camera we just built.
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
    doc = c4d.documents.GetActiveDocument()
    doc.StartUndo()
    try:
        clear_previous(doc)
        root, cam = build(doc)
        configure_document(doc, cam)
        doc.AddUndo(c4d.UNDOTYPE_NEW, root)
    finally:
        doc.EndUndo()
    c4d.EventAdd()
    print("Black hole rig built: {} frames at {} fps.".format(FRAMES, FPS))


if __name__ == "__main__":
    main()
