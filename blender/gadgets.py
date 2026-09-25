"""Builds the four held gadgets (client/public/models/gadgets/<kind>.glb).

    blender -b --factory-startup --python blender/gadgets.py
    blender -b --factory-startup --python blender/gadgets.py -- --preview <dir>

Everything is modeled from primitives in code, so the models are
reproducible and reviewable like the rest of the repo; there's no .blend to
keep in sync. Sizes are real-world meters (the characters' rig is 1 unit =
1 m). Each gadget is one mesh (one primitive per material) whose origin is
its middle; how a hand holds it lives in the client (heldItems.ts).

Axes, as the client sees them after glTF's Y-up conversion: +Y is the
gadget's up and +Z its front (the flashlight's beam, the camera's lens, the
face with the screen). In Blender terms that's +Z up and -Y front.

A few materials are looked up by name in the client: FlashlightLens (lit
while the flashlight is on), CameraFlash (pops when a photo is taken),
WalkieLed and CalculatorScreen (a faint glow of their own). The flashlight
also carries an empty, Lens, at the middle of its glass: the beam starts
there.

--preview renders each gadget to <dir>/<kind>.png for a look without the app.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "client", "public", "models", "gadgets")


# --- scene and materials ---------------------------------------------------


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            block.remove(item)


def material(name, color, roughness=0.5, metallic=0.0, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    r, g, b = srgb_to_linear(color)
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        er, eg, eb = srgb_to_linear(emission)
        bsdf.inputs["Emission Color"].default_value = (er, eg, eb, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def srgb_to_linear(hex_color):
    def channel(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return tuple(channel((hex_color >> shift) & 0xFF) for shift in (16, 8, 0))


# --- primitives --------------------------------------------------------------
# Every helper returns the new object, already carrying its material; bevels
# stay modifiers until `finish` bakes them.


def _place(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def box(size, location, mat, bevel=0.0, segments=3, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "NONE"
    return _place(obj, mat)


def cylinder(radius, depth, location, mat, rotation=(0, 0, 0), vertices=32, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
    return _place(obj, mat)


def cone(radius1, radius2, depth, location, mat, rotation=(0, 0, 0), vertices=32):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    return _place(bpy.context.active_object, mat)


def sphere(radius, location, mat, segments=16, rings=8, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, radius=radius, location=location
    )
    obj = bpy.context.active_object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _place(obj, mat)


def torus(major, minor, location, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=24,
        minor_segments=6,
        location=location,
        rotation=rotation,
    )
    return _place(bpy.context.active_object, mat)


def finish(name, parts, smooth_angle=40):
    """Bakes every part's modifiers, joins them into one mesh named `name`
    (one material slot each) and smooths it, keeping hard edges hard."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for part in parts:
        baked = bpy.data.meshes.new_from_object(part.evaluated_get(depsgraph))
        old = part.data
        part.modifiers.clear()
        part.data = baked
        bpy.data.meshes.remove(old)
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    # The join keeps the first part's origin; the gadget's own middle, the
    # point every part was placed around, is what the client expects.
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.set_sharp_from_angle(angle=math.radians(smooth_angle))
    return obj


# --- the gadgets ---------------------------------------------------------------
# Blender axes here: +Z up, -Y front, +X the gadget's own left-to-right.

X90 = (math.radians(90), 0, 0)


def build_flashlight():
    """A small aluminium torch, about 19 cm: rubber tail cap, a knurled grip,
    a rubber switch, a flared head with a polished bezel and the lens."""
    body = material("FlashlightBody", 0x2B2F36, roughness=0.32, metallic=0.85)
    rubber = material("FlashlightRubber", 0x121212, roughness=0.85)
    steel = material("FlashlightBezel", 0xC9CCD1, roughness=0.18, metallic=1.0)
    reflector = material("FlashlightReflector", 0xE6E6E6, roughness=0.08, metallic=1.0)
    lens = material(
        "FlashlightLens", 0xFFF4DD, roughness=0.05, emission=0xFFF0D0, emission_strength=1.0
    )

    parts = []
    # Along -Y: tail (+Y) to head (-Y).
    parts.append(cylinder(0.0152, 0.018, (0, 0.083, 0), rubber, rotation=X90, bevel=0.003))
    parts.append(cylinder(0.0145, 0.11, (0, 0.024, 0), body, rotation=X90))
    for i in range(7):  # grip rings
        parts.append(torus(0.0145, 0.0012, (0, 0.058 - i * 0.0095, 0), body, rotation=X90))
    parts.append(cylinder(0.016, 0.006, (0, -0.033, 0), body, rotation=X90, bevel=0.0015))
    parts.append(
        sphere(0.0048, (0, -0.02, 0.0142), rubber, scale=(1, 1.6, 0.55))
    )  # the switch
    parts.append(cone(0.016, 0.0215, 0.032, (0, -0.052, 0), body, rotation=X90))
    parts.append(cylinder(0.0228, 0.009, (0, -0.0715, 0), steel, rotation=X90, bevel=0.0018))
    parts.append(cone(0.0195, 0.006, 0.01, (0, -0.07, 0), reflector, rotation=(math.radians(-90), 0, 0)))
    parts.append(cylinder(0.0192, 0.0015, (0, -0.0757, 0), lens, rotation=X90))
    obj = finish("Flashlight", parts)

    beam = bpy.data.objects.new("Lens", None)
    bpy.context.collection.objects.link(beam)
    beam.parent = obj
    beam.location = (0, -0.0765, 0)
    return [obj, beam]


def build_walkie():
    """A consumer walkie-talkie, about 13 cm plus antenna: black body with
    yellow rubber sides, speaker grille, a small LCD and buttons, stubby
    antenna, channel knob, push-to-talk bar and a belt clip."""
    shell = material("WalkieBody", 0x1C1E22, roughness=0.55)
    grip = material("WalkieRubber", 0xF2B705, roughness=0.7)
    dark = material("WalkieGrille", 0x0C0D0F, roughness=0.8)
    antenna = material("WalkieAntenna", 0x151515, roughness=0.9)
    button = material("WalkieButton", 0x3A3D42, roughness=0.6)
    screen = material(
        "WalkieScreen",
        0x9DB29A,
        roughness=0.25,
        emission=0x9DB29A,
        emission_strength=0.25,
    )
    led = material("WalkieLed", 0xFF2A1A, roughness=0.3, emission=0xFF2A1A, emission_strength=2.0)

    w, d, h = 0.058, 0.032, 0.125
    parts = []
    parts.append(box((w, d, h), (0, 0, 0), shell, bevel=0.009))
    for side in (-1, 1):  # yellow rubber side panels
        parts.append(box((0.006, d * 0.86, h * 0.72), (side * w / 2, 0, -0.012), grip, bevel=0.0028))
    # Speaker grille, lower front.
    parts.append(box((0.04, 0.003, 0.046), (0, -d / 2 - 0.0002, -0.026), dark, bevel=0.003))
    for i in range(6):
        parts.append(
            box((0.034, 0.0022, 0.0022), (0, -d / 2 - 0.0016, -0.045 + i * 0.0076), shell, bevel=0.0009)
        )
    # LCD and three buttons, upper front.
    parts.append(box((0.036, 0.003, 0.02), (0, -d / 2 - 0.0004, 0.034), dark, bevel=0.002))
    parts.append(box((0.03, 0.002, 0.0145), (0, -d / 2 - 0.0013, 0.034), screen))
    for i, x in enumerate((-0.013, 0, 0.013)):
        parts.append(cylinder(0.0036, 0.004, (x, -d / 2 - 0.001, 0.013), button, rotation=X90, vertices=16, bevel=0.0012))
    # Antenna (left), knob (right) and LED on top.
    parts.append(cylinder(0.0072, 0.012, (-0.017, 0.002, h / 2 + 0.004), antenna, vertices=20, bevel=0.002))
    parts.append(cylinder(0.0052, 0.058, (-0.017, 0.002, h / 2 + 0.036), antenna, vertices=16))
    parts.append(sphere(0.0056, (-0.017, 0.002, h / 2 + 0.065), antenna, segments=16, rings=8))
    parts.append(cylinder(0.0068, 0.011, (0.014, 0.002, h / 2 + 0.004), button, vertices=12, bevel=0.0015))
    parts.append(sphere(0.0022, (0.001, -0.006, h / 2 + 0.0005), led, segments=12, rings=6))
    # Push-to-talk bar on the left side, belt clip on the back.
    parts.append(box((0.005, 0.014, 0.034), (-w / 2 - 0.002, 0, 0.012), dark, bevel=0.0022))
    parts.append(box((0.026, 0.004, 0.07), (0, d / 2 + 0.003, 0.004), shell, bevel=0.0018))
    return [finish("Walkie", parts)]


def build_calculator():
    """A pocket calculator, 7.5 x 12.5 cm: dark body, brushed face plate,
    solar strip, a recessed LCD with a few digits, and 5 x 4 keys (grey
    digits, dark operators, orange clear/equals)."""
    shell = material("CalculatorBody", 0x25272C, roughness=0.5)
    plate = material("CalculatorPlate", 0x9DA1A8, roughness=0.35, metallic=0.75)
    solar = material("CalculatorSolar", 0x2A1E17, roughness=0.15)
    screen = material(
        "CalculatorScreen", 0xB7C4A6, roughness=0.3, emission=0xB7C4A6, emission_strength=0.2
    )
    ink = material("CalculatorDigits", 0x20261E, roughness=0.6)
    digit = material("CalculatorKey", 0xDCDAD3, roughness=0.55)
    operator = material("CalculatorKeyDark", 0x4A4E57, roughness=0.55)
    accent = material("CalculatorKeyAccent", 0xE0602A, roughness=0.5)

    w, d, h = 0.075, 0.011, 0.125
    front = -d / 2
    parts = [box((w, d, h), (0, 0, 0), shell, bevel=0.0045)]
    parts.append(box((w - 0.008, 0.0008, 0.042), (0, front - 0.0003, 0.036), plate))
    parts.append(box((0.03, 0.001, 0.008), (0.014, front - 0.0008, 0.0495), solar))
    parts.append(box((0.058, 0.001, 0.02), (0, front - 0.0008, 0.031), ink, bevel=0.0008))
    parts.append(box((0.054, 0.0012, 0.016), (0, front - 0.0012, 0.031), screen))
    # A fresh calculator's "0." at the right, in seven-segment style.
    x, top, bottom = 0.021, 0.0376, 0.0244
    for z in (top, bottom):
        parts.append(box((0.0048, 0.0006, 0.0009), (x, front - 0.0019, z), ink))
    for side in (-1, 1):
        for z in (0.0343, 0.0277):
            parts.append(box((0.0009, 0.0006, 0.0054), (x + side * 0.0024, front - 0.0019, z), ink))
    parts.append(box((0.0011, 0.0006, 0.0011), (x + 0.0042, front - 0.0019, bottom), ink))
    colors = [
        [accent, operator, operator, operator],
        [digit, digit, digit, operator],
        [digit, digit, digit, operator],
        [digit, digit, digit, operator],
        [digit, digit, operator, accent],
    ]
    for row in range(5):
        for col in range(4):
            x = -0.0255 + col * 0.017
            z = 0.004 - row * 0.0128
            parts.append(box((0.0135, 0.0032, 0.0092), (x, front - 0.0012, z), colors[row][col], bevel=0.0016))
    return [finish("Calculator", parts)]


def build_camera():
    """An instant camera in the spirit of the classic Polaroid: a cream body
    with a black front, a big lens, a flash window, a viewfinder, the red
    shutter button, the film slot and the rainbow stripe."""
    shell = material("CameraBody", 0xEDE8DC, roughness=0.42)
    black = material("CameraFront", 0x141416, roughness=0.3)
    ring = material("CameraLensRing", 0x2C2E33, roughness=0.35, metallic=0.6)
    glass = material("CameraGlass", 0x0A0E14, roughness=0.04)
    flash = material("CameraFlash", 0xF4F4F0, roughness=0.2, emission=0xFFFFFF, emission_strength=1.0)
    red = material("CameraShutter", 0xD2231E, roughness=0.4)
    stripes = [
        material("CameraStripeRed", 0xE3342F, roughness=0.45),
        material("CameraStripeOrange", 0xF28C28, roughness=0.45),
        material("CameraStripeYellow", 0xF6C81B, roughness=0.45),
        material("CameraStripeGreen", 0x3FA34D, roughness=0.45),
        material("CameraStripeBlue", 0x2A7FC1, roughness=0.45),
    ]

    w, d, h = 0.135, 0.09, 0.098
    front = -d / 2
    parts = [box((w, d, h), (0, 0, 0), shell, bevel=0.012, segments=4)]
    # The black front block (the film bay), lower two-thirds.
    parts.append(box((w - 0.006, 0.02, 0.064), (0, front + 0.004, -0.013), black, bevel=0.008, segments=3))
    # Lens: barrel, ring, glass.
    parts.append(cylinder(0.026, 0.016, (-0.018, front - 0.012, -0.006), ring, rotation=X90, bevel=0.002))
    parts.append(cylinder(0.0215, 0.004, (-0.018, front - 0.0205, -0.006), black, rotation=X90, bevel=0.0012))
    parts.append(cylinder(0.017, 0.002, (-0.018, front - 0.0226, -0.006), glass, rotation=X90))
    # Flash window and viewfinder, top.
    parts.append(box((0.04, 0.004, 0.017), (0.033, front - 0.001, 0.033), black, bevel=0.002))
    parts.append(box((0.036, 0.002, 0.013), (0.033, front - 0.003, 0.033), flash))
    parts.append(box((0.02, 0.012, 0.014), (-0.03, front + 0.02, h / 2 + 0.004), black, bevel=0.003))
    # Rainbow stripe down the front, right of the lens.
    for i, stripe in enumerate(stripes):
        parts.append(box((0.0042, 0.002, 0.034), (0.02 + i * 0.0042, front - 0.0068, -0.016), stripe))
    # Shutter button and the film slot.
    parts.append(cylinder(0.0065, 0.006, (0.052, front - 0.007, -0.002), red, rotation=X90, vertices=24, bevel=0.0015))
    parts.append(box((0.1, 0.004, 0.003), (0, front - 0.006, -0.041), glass, bevel=0.0008))
    return [finish("Camera", parts)]


BUILDERS = {
    "flashlight": build_flashlight,
    "walkie": build_walkie,
    "calculator": build_calculator,
    "camera": build_camera,
}


# --- export and preview ------------------------------------------------------


def export(kind, objects):
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    path = os.path.join(OUT_DIR, f"{kind}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=False,
        export_materials="EXPORT",
    )
    print(f"wrote {path} ({os.path.getsize(path)} bytes)")


def preview(kind, objects, out_dir):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 700
    scene.render.film_transparent = False
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.22, 0.2, 0.19, 1)
    bg.inputs["Strength"].default_value = 0.8

    main = objects[0]
    size = max(main.dimensions)
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 60
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    bpy.context.collection.objects.link(cam)
    distance = size * 3.2
    cam.location = (distance * 0.55, -distance * 0.8, distance * 0.45)
    cam.rotation_euler = (-cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    key_data = bpy.data.lights.new("Key", "AREA")
    key_data.energy = 60 * size * size / 0.01
    key_data.size = size * 2
    key = bpy.data.objects.new("Key", key_data)
    key.location = (distance * 0.2, -distance * 0.6, distance * 0.9)
    key.rotation_euler = (-key.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(key)

    scene.render.filepath = os.path.join(out_dir, f"{kind}.png")
    bpy.ops.render.render(write_still=True)
    for obj in (cam, key):
        bpy.data.objects.remove(obj, do_unlink=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    preview_dir = argv[argv.index("--preview") + 1] if "--preview" in argv else None
    for kind, build in BUILDERS.items():
        clear_scene()
        objects = build()
        if preview_dir:
            preview(kind, objects, preview_dir)
        else:
            export(kind, objects)


main()
