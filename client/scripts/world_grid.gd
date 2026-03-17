@tool
class_name WorldGrid
extends Node2D

const WorldConfig = preload("res://scripts/world_config.gd")
const GRID_FILL_COLOR := Color(0.117647, 0.141176, 0.160784, 0.0)
const GRID_LINE_COLOR := Color(0.854902, 0.929412, 0.972549, 0.24)
const GRID_BORDER_COLOR := Color(0.980392, 0.960784, 0.737255, 0.48)

@export var show_in_game := false
@export var line_alpha := 0.24:
	set(value):
		line_alpha = clampf(value, 0.0, 1.0)
		queue_redraw()
@export var border_alpha := 0.48:
	set(value):
		border_alpha = clampf(value, 0.0, 1.0)
		queue_redraw()

func _ready() -> void:
	set_process(Engine.is_editor_hint())
	queue_redraw()

func _process(_delta: float) -> void:
	if not Engine.is_editor_hint():
		return

	queue_redraw()

func _draw() -> void:
	if not Engine.is_editor_hint() and not show_in_game:
		return

	var rect := WorldConfig.outer_world_rect()
	var cell_size := WorldConfig.cell_size()
	var grid_line_color := GRID_LINE_COLOR
	grid_line_color.a = line_alpha
	var grid_border_color := GRID_BORDER_COLOR
	grid_border_color.a = border_alpha

	draw_rect(rect, GRID_FILL_COLOR, true)

	var x := rect.position.x
	while x <= rect.end.x + 0.5:
		draw_line(Vector2(x, rect.position.y), Vector2(x, rect.end.y), grid_line_color, 1.0)
		x += cell_size

	var y := rect.position.y
	while y <= rect.end.y + 0.5:
		draw_line(Vector2(rect.position.x, y), Vector2(rect.end.x, y), grid_line_color, 1.0)
		y += cell_size

	draw_rect(rect, grid_border_color, false, 2.0)
