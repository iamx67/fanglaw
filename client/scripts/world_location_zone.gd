@tool
class_name WorldLocationZone
extends Area2D

const FILL_COLOR := Color(0.286275, 0.552941, 0.858824, 0.12)
const OUTLINE_COLOR := Color(0.388235, 0.709804, 0.992157, 0.95)
const MIN_ZONE_SIZE := 1.0

@export var location_id := "location_01"
@export var display_name := "Location"
@export var tribe_id := ""
@export var is_neutral := true
@export var prey_table_id := "default"
@export var zone_size := Vector2(768.0, 432.0):
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
	_apply_shape_size()
	queue_redraw()

func _process(_delta: float) -> void:
	if not Engine.is_editor_hint():
		return

	_disable_runtime_collision()
	_ensure_unique_shape()
	_normalize_editor_state()
	_apply_shape_size()
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
	var size := zone_size
	var center := global_position
	return {
		"name": name,
		"locationId": location_id.strip_edges(),
		"displayName": display_name.strip_edges(),
		"tribeId": tribe_id.strip_edges(),
		"isNeutral": is_neutral,
		"preyTableId": prey_table_id.strip_edges(),
		"x": snappedf(center.x, 0.001),
		"y": snappedf(center.y, 0.001),
		"width": snappedf(size.x, 0.001),
		"height": snappedf(size.y, 0.001),
	}

func get_local_zone_rect() -> Rect2:
	return Rect2(-(zone_size * 0.5), zone_size)

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

func _get_collision_shape() -> CollisionShape2D:
	return get_node_or_null("CollisionShape2D") as CollisionShape2D
