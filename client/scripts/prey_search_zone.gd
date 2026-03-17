@tool
class_name PreySearchZone
extends Area2D

const FILL_COLOR := Color(0.356863, 0.737255, 0.415686, 0.12)
const OUTLINE_COLOR := Color(0.482353, 0.878431, 0.533333, 0.95)
const MIN_ZONE_SIZE := 1.0

@export var search_zone_id := "search_zone_01"
@export var location_id := ""
@export var prey_kind := "mouse"
@export var spawn_tag := "default"
@export var required_skill := "hunting"
@export_range(0.0, 1000.0, 1.0) var difficulty := 0.0
@export var zone_size := Vector2(256.0, 256.0):
	set(value):
		zone_size = Vector2(
			maxf(value.x, MIN_ZONE_SIZE),
			maxf(value.y, MIN_ZONE_SIZE)
		)
		_apply_shape_size()
		queue_redraw()

func _ready() -> void:
	_disable_runtime_collision()
	set_process(Engine.is_editor_hint())
	_ensure_unique_shape()
	_normalize_editor_state()
	_sync_size_from_shape()
	queue_redraw()

func _process(_delta: float) -> void:
	if not Engine.is_editor_hint():
		return

	_disable_runtime_collision()
	_ensure_unique_shape()
	_normalize_editor_state()
	_sync_size_from_shape()
	queue_redraw()

func _draw() -> void:
	if not Engine.is_editor_hint():
		return

	var local_rect := get_local_zone_rect()
	if local_rect == Rect2():
		return

	draw_rect(local_rect, FILL_COLOR, true)
	draw_rect(local_rect, OUTLINE_COLOR, false, 3.0)

func build_export_zone() -> Dictionary:
	var shape_node := _get_collision_shape()
	if shape_node == null:
		return {}

	var rectangle_shape := shape_node.shape as RectangleShape2D
	if rectangle_shape == null:
		return {}

	var center := global_position + shape_node.position
	var size := rectangle_shape.size
	return {
		"name": name,
		"searchZoneId": search_zone_id.strip_edges(),
		"locationId": location_id.strip_edges(),
		"preyKind": prey_kind.strip_edges(),
		"spawnTag": spawn_tag.strip_edges(),
		"requiredSkill": required_skill.strip_edges(),
		"difficulty": snappedf(difficulty, 0.001),
		"x": snappedf(center.x, 0.001),
		"y": snappedf(center.y, 0.001),
		"width": snappedf(size.x, 0.001),
		"height": snappedf(size.y, 0.001),
	}

func get_local_zone_rect() -> Rect2:
	var shape_node := _get_collision_shape()
	if shape_node == null:
		return Rect2()

	var rectangle_shape := shape_node.shape as RectangleShape2D
	if rectangle_shape == null:
		return Rect2()

	var size := rectangle_shape.size
	return Rect2(shape_node.position - (size * 0.5), size)

func get_world_zone_rect() -> Rect2:
	var local_rect := get_local_zone_rect()
	if local_rect == Rect2():
		return Rect2()

	return Rect2(global_position + local_rect.position, local_rect.size)

func contains_world_position(world_position: Vector2) -> bool:
	var world_rect := get_world_zone_rect()
	if world_rect == Rect2():
		return false

	return (
		world_position.x >= world_rect.position.x
		and world_position.x <= world_rect.end.x
		and world_position.y >= world_rect.position.y
		and world_position.y <= world_rect.end.y
	)

func _disable_runtime_collision() -> void:
	monitoring = false
	monitorable = false
	collision_layer = 0
	collision_mask = 0

func _normalize_editor_state() -> void:
	var shape_node := _get_collision_shape()
	if shape_node == null:
		return

	if rotation != 0.0:
		rotation = 0.0

	if scale != Vector2.ONE:
		scale = Vector2.ONE

	if shape_node.position != Vector2.ZERO:
		position += shape_node.position
		shape_node.position = Vector2.ZERO

	if shape_node.rotation != 0.0:
		shape_node.rotation = 0.0

	if shape_node.scale != Vector2.ONE:
		shape_node.scale = Vector2.ONE

func _ensure_unique_shape() -> void:
	var shape_node := _get_collision_shape()
	if shape_node == null or shape_node.shape == null:
		return

	if shape_node.shape.resource_local_to_scene:
		return

	var unique_shape := shape_node.shape.duplicate()
	unique_shape.resource_local_to_scene = true
	shape_node.shape = unique_shape

func _apply_shape_size() -> void:
	var shape_node := _get_collision_shape()
	if shape_node == null:
		return

	var rectangle_shape := shape_node.shape as RectangleShape2D
	if rectangle_shape == null:
		return

	if rectangle_shape.size == zone_size:
		return

	rectangle_shape.size = zone_size

func _sync_size_from_shape() -> void:
	var shape_node := _get_collision_shape()
	if shape_node == null:
		return

	var rectangle_shape := shape_node.shape as RectangleShape2D
	if rectangle_shape == null:
		return

	var actual_size := Vector2(
		maxf(rectangle_shape.size.x, MIN_ZONE_SIZE),
		maxf(rectangle_shape.size.y, MIN_ZONE_SIZE)
	)
	if zone_size == actual_size:
		return

	zone_size = actual_size

func _get_collision_shape() -> CollisionShape2D:
	return get_node_or_null("CollisionShape2D") as CollisionShape2D
