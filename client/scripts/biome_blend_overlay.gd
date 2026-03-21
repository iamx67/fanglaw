@tool
class_name BiomeBlendOverlay
extends Node2D

const SHADER_RESOURCE := preload("res://shaders/biome_blend_overlay_preview.gdshader")

@export var overlay_size := Vector2(2048.0, 1024.0):
	set(value):
		overlay_size = Vector2(maxf(32.0, value.x), maxf(32.0, value.y))
		_sync_overlay()

@export_range(-180.0, 180.0, 1.0) var blend_angle_degrees := 0.0:
	set(value):
		blend_angle_degrees = value
		_sync_overlay()

@export_range(0.0, 1.0, 0.01) var blend_center := 0.5:
	set(value):
		blend_center = clampf(value, 0.0, 1.0)
		_sync_overlay()

@export_range(0.01, 1.0, 0.01) var blend_width := 0.35:
	set(value):
		blend_width = clampf(value, 0.01, 1.0)
		_sync_overlay()

@export_range(0.0, 0.5, 0.01) var edge_softness := 0.08:
	set(value):
		edge_softness = clampf(value, 0.0, 0.5)
		_sync_overlay()

@export_range(0.0, 0.45, 0.01) var outer_fade := 0.14:
	set(value):
		outer_fade = clampf(value, 0.0, 0.45)
		_sync_overlay()

@export_range(0.1, 32.0, 0.1) var noise_scale := 3.0:
	set(value):
		noise_scale = clampf(value, 0.1, 32.0)
		_sync_overlay()

@export_range(0.0, 0.5, 0.01) var noise_strength := 0.12:
	set(value):
		noise_strength = clampf(value, 0.0, 0.5)
		_sync_overlay()

@export var overlay_tint := Color(0.42, 0.44, 0.30, 0.36):
	set(value):
		overlay_tint = value
		_sync_overlay()

@export var overlay_tint_secondary := Color(0.30, 0.34, 0.22, 0.26):
	set(value):
		overlay_tint_secondary = value
		_sync_overlay()

@export_range(0.1, 16.0, 0.1) var tint_noise_scale := 2.2:
	set(value):
		tint_noise_scale = clampf(value, 0.1, 16.0)
		_sync_overlay()

@export_range(0.0, 0.8, 0.01) var alpha_noise_strength := 0.28:
	set(value):
		alpha_noise_strength = clampf(value, 0.0, 0.8)
		_sync_overlay()

@export var show_editor_outline := true:
	set(value):
		show_editor_outline = value
		queue_redraw()

var _noise_texture: NoiseTexture2D

@onready var _blend_quad: Polygon2D = $BlendQuad

func _ready() -> void:
	if Engine.is_editor_hint():
		set_process(true)
	_sync_overlay()

func _process(_delta: float) -> void:
	if not Engine.is_editor_hint():
		return

	_sync_overlay()

func _draw() -> void:
	if not Engine.is_editor_hint() or not show_editor_outline:
		return

	var rect := Rect2(-overlay_size * 0.5, overlay_size)
	draw_rect(rect, Color(0.97, 0.82, 0.32, 0.08), true)
	draw_rect(rect, Color(0.97, 0.82, 0.32, 0.92), false, 3.0)

func _sync_overlay() -> void:
	if _blend_quad == null:
		return

	_blend_quad.polygon = PackedVector2Array([
		Vector2(-overlay_size.x * 0.5, -overlay_size.y * 0.5),
		Vector2(overlay_size.x * 0.5, -overlay_size.y * 0.5),
		Vector2(overlay_size.x * 0.5, overlay_size.y * 0.5),
		Vector2(-overlay_size.x * 0.5, overlay_size.y * 0.5),
	])
	_blend_quad.uv = PackedVector2Array([
		Vector2(0.0, 0.0),
		Vector2(1.0, 0.0),
		Vector2(1.0, 1.0),
		Vector2(0.0, 1.0),
	])
	_blend_quad.color = Color.WHITE
	_blend_quad.visible = true

	var shader_material := _blend_quad.material as ShaderMaterial
	if shader_material == null:
		shader_material = ShaderMaterial.new()
		_blend_quad.material = shader_material
	if shader_material.shader != SHADER_RESOURCE:
		shader_material.shader = SHADER_RESOURCE

	shader_material.set_shader_parameter("noise_texture", _get_noise_texture())
	shader_material.set_shader_parameter("blend_angle_degrees", blend_angle_degrees)
	shader_material.set_shader_parameter("blend_center", blend_center)
	shader_material.set_shader_parameter("blend_width", blend_width)
	shader_material.set_shader_parameter("edge_softness", edge_softness)
	shader_material.set_shader_parameter("outer_fade", outer_fade)
	shader_material.set_shader_parameter("noise_scale", noise_scale)
	shader_material.set_shader_parameter("noise_strength", noise_strength)
	shader_material.set_shader_parameter("overlay_tint", overlay_tint)
	shader_material.set_shader_parameter("overlay_tint_secondary", overlay_tint_secondary)
	shader_material.set_shader_parameter("tint_noise_scale", tint_noise_scale)
	shader_material.set_shader_parameter("alpha_noise_strength", alpha_noise_strength)
	queue_redraw()

func _get_noise_texture() -> NoiseTexture2D:
	if _noise_texture != null:
		return _noise_texture

	var noise := FastNoiseLite.new()
	noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	noise.frequency = 0.015
	noise.fractal_octaves = 3
	noise.fractal_gain = 0.55
	noise.fractal_lacunarity = 2.0

	_noise_texture = NoiseTexture2D.new()
	_noise_texture.width = 256
	_noise_texture.height = 256
	_noise_texture.seamless = true
	_noise_texture.generate_mipmaps = true
	_noise_texture.noise = noise
	return _noise_texture
