@tool
class_name WorldLocationZone
extends Area2D

const FILL_COLOR := Color(0.286275, 0.552941, 0.858824, 0.12)
const OUTLINE_COLOR := Color(0.388235, 0.709804, 0.992157, 0.95)

@export var location_id := "location_01"
@export var display_name := "Location"
@export var tribe_id := ""
@export var is_neutral := true
@export var prey_table_id := "default"

func _ready() -> void:
	_disable_runtime_collision()
	set_process(Engine.is_editor_hint())
	_normalize_editor_state()
	queue_redraw()

func _process(_delta: float) -> void:
	if not Engine.is_editor_hint():
		return

	_disable_runtime_collision()
	_normalize_editor_state()
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
	var shape_node := _get_collision_shape()
	if shape_node == null:
		return Rect2()

	var rectangle_shape := shape_node.shape as RectangleShape2D
	if rectangle_shape == null:
		return Rect2()

	var size := rectangle_shape.size
	return Rect2(shape_node.position - (size * 0.5), size)

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

	if shape_node.rotation != 0.0:
		shape_node.rotation = 0.0

	if shape_node.scale != Vector2.ONE:
		shape_node.scale = Vector2.ONE

func _get_collision_shape() -> CollisionShape2D:
	return get_node_or_null("CollisionShape2D") as CollisionShape2D
