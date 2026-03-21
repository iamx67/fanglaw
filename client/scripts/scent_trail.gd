class_name ScentTrail
extends Node2D

@export_range(8.0, 128.0, 1.0) var min_visible_distance := 24.0
@export_range(12.0, 96.0, 1.0) var dot_spacing := 36.0
@export_range(2.0, 24.0, 0.5) var base_radius := 8.0
@export_range(1.0, 3.0, 0.05) var glow_radius_multiplier := 1.85
@export_range(0.0, 24.0, 0.5) var wobble_amplitude := 8.0
@export_range(0.1, 12.0, 0.1) var pulse_speed := 3.8
@export var glow_color := Color(0.69, 0.84, 0.58, 0.14)
@export var core_color := Color(0.93, 1.0, 0.87, 0.32)

var _from := Vector2.ZERO
var _to := Vector2.ZERO
var _active := false
var _phase := 0.0

func _ready() -> void:
	visible = false
	set_process(true)

func set_trail(from_position: Vector2, to_position: Vector2) -> void:
	_from = from_position
	_to = to_position
	_active = from_position.distance_to(to_position) >= min_visible_distance
	visible = _active
	queue_redraw()

func clear_trail() -> void:
	if not _active and not visible:
		return

	_active = false
	visible = false
	queue_redraw()

func _process(delta: float) -> void:
	if not _active:
		return

	_phase = wrapf(_phase + delta * pulse_speed, 0.0, TAU)
	queue_redraw()

func _draw() -> void:
	if not _active:
		return

	var direction := _to - _from
	var distance := direction.length()
	if distance < min_visible_distance:
		return

	var normalized_direction := direction / distance
	var normal := Vector2(-normalized_direction.y, normalized_direction.x)
	var step_count := maxi(3, int(distance / maxf(dot_spacing, 1.0)) + 1)
	if step_count < 2:
		step_count = 2

	for index in range(step_count):
		var t := float(index) / float(step_count - 1)
		var center := _from.lerp(_to, t)
		var wobble_profile := sin(t * PI)
		var wobble := sin((_phase * 1.4) + (t * 9.0)) * wobble_amplitude * wobble_profile
		center += normal * wobble

		var trail_weight := 0.35 + (t * 0.65)
		var glow := glow_color
		glow.a *= trail_weight
		var core := core_color
		core.a *= trail_weight

		var glow_radius := lerpf(base_radius * 0.7, base_radius * glow_radius_multiplier, t)
		var pulse := 0.9 + (0.16 * sin((_phase * 2.2) + (t * 12.0)))
		var core_radius := base_radius * pulse * (0.72 + (t * 0.18))

		draw_circle(center, glow_radius, glow)
		draw_circle(center, core_radius, core)
