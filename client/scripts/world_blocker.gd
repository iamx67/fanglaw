@tool
class_name WorldBlocker
extends Area2D

const FILL_COLOR := Color(0.843137, 0.262745, 0.243137, 0.22)
const OUTLINE_COLOR := Color(0.94902, 0.388235, 0.262745, 0.95)
const CROSS_COLOR := Color(0.94902, 0.388235, 0.262745, 0.55)
const MIN_BLOCKER_SIZE := 1.0

@export var blocks_movement := true:
	set(value):
		blocks_movement = value
		queue_redraw()

@export var blocker_size := Vector2(32.0, 32.0):
	set(value):
		blocker_size = Vector2(
			maxf(value.x, MIN_BLOCKER_SIZE),
			maxf(value.y, MIN_BLOCKER_SIZE)
		)
		_apply_shape_size()
		queue_redraw()

func _ready() -> void:
	monitoring = false
	monitorable = false
	collision_layer = 0
	collision_mask = 0
	set_process(Engine.is_editor_hint())
	_ensure_unique_shape()
	_normalize_editor_state()
	_sync_size_from_shape()
	queue_redraw()

func _process(_delta: float) -> void:
	if not Engine.is_editor_hint():
		return

	_ensure_unique_shape()
	_normalize_editor_state()
	_sync_size_from_shape()
	queue_redraw()

func _draw() -> void:
	if not Engine.is_editor_hint() or not blocks_movement:
		return

	var local_rect := get_local_blocker_rect()
	if local_rect == Rect2():
		return

	draw_rect(local_rect, FILL_COLOR, true)
	draw_rect(local_rect, OUTLINE_COLOR, false, 2.0)
	draw_line(local_rect.position, local_rect.end, CROSS_COLOR, 2.0)
	draw_line(
		Vector2(local_rect.end.x, local_rect.position.y),
		Vector2(local_rect.position.x, local_rect.end.y),
		CROSS_COLOR,
		2.0
	)

func build_export_rect() -> Dictionary:
	var shape_node := _get_collision_shape()
	if shape_node == null:
		return {}

	var rectangle_shape := shape_node.shape as RectangleShape2D
	if rectangle_shape == null or not blocks_movement:
		return {}

	var center := global_position + shape_node.position
	var size := rectangle_shape.size
	return {
		"name": name,
		"x": snappedf(center.x, 0.001),
		"y": snappedf(center.y, 0.001),
		"width": snappedf(size.x, 0.001),
		"height": snappedf(size.y, 0.001),
	}

func get_local_blocker_rect() -> Rect2:
	var shape_node := _get_collision_shape()
	if shape_node == null:
		return Rect2()

	var rectangle_shape := shape_node.shape as RectangleShape2D
	if rectangle_shape == null:
		return Rect2()

	var size := rectangle_shape.size
	return Rect2(shape_node.position - (size * 0.5), size)

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

	if rectangle_shape.size == blocker_size:
		return

	rectangle_shape.size = blocker_size

func _sync_size_from_shape() -> void:
	var shape_node := _get_collision_shape()
	if shape_node == null:
		return

	var rectangle_shape := shape_node.shape as RectangleShape2D
	if rectangle_shape == null:
		return

	var actual_size := Vector2(
		maxf(rectangle_shape.size.x, MIN_BLOCKER_SIZE),
		maxf(rectangle_shape.size.y, MIN_BLOCKER_SIZE)
	)
	if blocker_size == actual_size:
		return

	blocker_size = actual_size

func _get_collision_shape() -> CollisionShape2D:
	return get_node_or_null("CollisionShape2D") as CollisionShape2D
