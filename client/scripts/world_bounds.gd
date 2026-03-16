@tool
class_name WorldBounds
extends Node2D

const WorldConfig = preload("res://scripts/world_config.gd")

const OUTLINE_COLOR := Color(0.94902, 0.741176, 0.341176, 0.9)
const DIAGONAL_COLOR := Color(0.94902, 0.741176, 0.341176, 0.3)
const FILL_COLOR := Color(0.94902, 0.741176, 0.341176, 0.03)
const GUIDE_COLOR := Color(0.94902, 0.741176, 0.341176, 0.14)

@onready var wall_top: StaticBody2D = $WallTop
@onready var wall_bottom: StaticBody2D = $WallBottom
@onready var wall_left: StaticBody2D = $WallLeft
@onready var wall_right: StaticBody2D = $WallRight
@onready var wall_top_shape: CollisionShape2D = $WallTop/CollisionShape2D
@onready var wall_bottom_shape: CollisionShape2D = $WallBottom/CollisionShape2D
@onready var wall_left_shape: CollisionShape2D = $WallLeft/CollisionShape2D
@onready var wall_right_shape: CollisionShape2D = $WallRight/CollisionShape2D

func _ready() -> void:
	_sync_bounds()
	set_process(Engine.is_editor_hint())

func _draw() -> void:
	if not Engine.is_editor_hint():
		return

	var rect := WorldConfig.outer_world_rect()
	var playable_rect := WorldConfig.playable_bounds_rect()

	draw_rect(rect, FILL_COLOR, true)
	draw_rect(rect, OUTLINE_COLOR, false, 4.0)
	draw_rect(playable_rect, GUIDE_COLOR, false, 2.0)
	draw_line(rect.position, rect.end, DIAGONAL_COLOR, 2.0)
	draw_line(
		Vector2(rect.end.x, rect.position.y),
		Vector2(rect.position.x, rect.end.y),
		DIAGONAL_COLOR,
		2.0
	)

func _process(_delta: float) -> void:
	_sync_bounds()

func _sync_bounds() -> void:
	if not is_inside_tree():
		return

	visible = true
	wall_top.position = WorldConfig.wall_top_position()
	wall_bottom.position = WorldConfig.wall_bottom_position()
	wall_left.position = WorldConfig.wall_left_position()
	wall_right.position = WorldConfig.wall_right_position()

	_assign_rectangle_shape(wall_top_shape, WorldConfig.horizontal_wall_size())
	_assign_rectangle_shape(wall_bottom_shape, WorldConfig.horizontal_wall_size())
	_assign_rectangle_shape(wall_left_shape, WorldConfig.vertical_wall_size())
	_assign_rectangle_shape(wall_right_shape, WorldConfig.vertical_wall_size())
	_sync_camera_limits()
	queue_redraw()

func _assign_rectangle_shape(collision_shape: CollisionShape2D, size: Vector2) -> void:
	var rectangle_shape := collision_shape.shape as RectangleShape2D
	if rectangle_shape == null:
		rectangle_shape = RectangleShape2D.new()
		collision_shape.shape = rectangle_shape

	if rectangle_shape.size != size:
		rectangle_shape.size = size

func _sync_camera_limits() -> void:
	var camera := get_parent().get_node_or_null("Camera2D") as Camera2D
	if camera == null:
		return

	camera.limit_left = WorldConfig.camera_limit_left()
	camera.limit_top = WorldConfig.camera_limit_top()
	camera.limit_right = WorldConfig.camera_limit_right()
	camera.limit_bottom = WorldConfig.camera_limit_bottom()
