@tool
class_name WorldSpawnPoint
extends Marker2D

const MARKER_COLOR := Color(0.980392, 0.843137, 0.270588, 0.95)
const RADIUS := 18.0

@export var spawn_id := "spawn_point_01"
@export var spawn_kind := "player"
@export var spawn_tag := "default"
@export_range(0.0, 1000.0, 0.1) var weight := 1.0
@export var enabled := true

func _ready() -> void:
	set_process(Engine.is_editor_hint())
	queue_redraw()

func _process(_delta: float) -> void:
	if not Engine.is_editor_hint():
		return

	queue_redraw()

func _draw() -> void:
	if not Engine.is_editor_hint() or not enabled:
		return

	draw_circle(Vector2.ZERO, RADIUS * 0.35, Color(MARKER_COLOR, 0.16))
	draw_arc(Vector2.ZERO, RADIUS, 0.0, TAU, 32, MARKER_COLOR, 2.0)
	draw_line(Vector2(-RADIUS, 0.0), Vector2(RADIUS, 0.0), MARKER_COLOR, 2.0)
	draw_line(Vector2(0.0, -RADIUS), Vector2(0.0, RADIUS), MARKER_COLOR, 2.0)

func build_export_point() -> Dictionary:
	if not enabled:
		return {}

	return {
		"name": name,
		"spawnId": spawn_id.strip_edges(),
		"spawnKind": spawn_kind.strip_edges(),
		"spawnTag": spawn_tag.strip_edges(),
		"weight": snappedf(weight, 0.001),
		"x": snappedf(global_position.x, 0.001),
		"y": snappedf(global_position.y, 0.001),
	}
