class_name WorldGrid
extends Node2D

const WorldConfig = preload("res://scripts/world_config.gd")
const GRID_FILL_COLOR := Color(0.117647, 0.141176, 0.160784, 0.0)
const GRID_LINE_COLOR := Color(0.52549, 0.619608, 0.678431, 0.12)
const GRID_BORDER_COLOR := Color(0.729412, 0.807843, 0.862745, 0.18)

func _ready() -> void:
	queue_redraw()

func _draw() -> void:
	var rect := WorldConfig.outer_world_rect()
	var cell_size := WorldConfig.cell_size()

	draw_rect(rect, GRID_FILL_COLOR, true)

	var x := rect.position.x
	while x <= rect.end.x + 0.5:
		draw_line(Vector2(x, rect.position.y), Vector2(x, rect.end.y), GRID_LINE_COLOR, 1.0)
		x += cell_size

	var y := rect.position.y
	while y <= rect.end.y + 0.5:
		draw_line(Vector2(rect.position.x, y), Vector2(rect.end.x, y), GRID_LINE_COLOR, 1.0)
		y += cell_size

	draw_rect(rect, GRID_BORDER_COLOR, false, 2.0)
