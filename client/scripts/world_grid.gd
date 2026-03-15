class_name WorldGrid
extends Control

const CELL_SIZE := 64.0
const WORLD_MIN_X := -512.0
const WORLD_MAX_X := 512.0
const WORLD_MIN_Y := -256.0
const WORLD_MAX_Y := 256.0
const GRID_FILL_COLOR := Color(0.117647, 0.141176, 0.160784, 0.0)
const GRID_LINE_COLOR := Color(0.52549, 0.619608, 0.678431, 0.12)
const GRID_BORDER_COLOR := Color(0.729412, 0.807843, 0.862745, 0.18)

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	anchors_preset = PRESET_FULL_RECT
	offset_left = 0.0
	offset_top = 0.0
	offset_right = 0.0
	offset_bottom = 0.0
	z_index = -10

func _ready() -> void:
	resized.connect(queue_redraw)
	queue_redraw()

func _draw() -> void:
	var top_left := _world_to_screen(Vector2(
		WORLD_MIN_X - (CELL_SIZE * 0.5),
		WORLD_MIN_Y - (CELL_SIZE * 0.5)
	))
	var bottom_right := _world_to_screen(Vector2(
		WORLD_MAX_X + (CELL_SIZE * 0.5),
		WORLD_MAX_Y + (CELL_SIZE * 0.5)
	))
	var rect := Rect2(top_left, bottom_right - top_left)

	draw_rect(rect, GRID_FILL_COLOR, true)

	var x := rect.position.x
	while x <= rect.end.x + 0.5:
		draw_line(Vector2(x, rect.position.y), Vector2(x, rect.end.y), GRID_LINE_COLOR, 1.0)
		x += CELL_SIZE

	var y := rect.position.y
	while y <= rect.end.y + 0.5:
		draw_line(Vector2(rect.position.x, y), Vector2(rect.end.x, y), GRID_LINE_COLOR, 1.0)
		y += CELL_SIZE

	draw_rect(rect, GRID_BORDER_COLOR, false, 2.0)

func _world_to_screen(world_position: Vector2) -> Vector2:
	return (size * 0.5) + world_position
