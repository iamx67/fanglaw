@tool
class_name WorldGrid
extends Node2D

const WorldConfig = preload("res://scripts/world_config.gd")
const GRID_FILL_COLOR := Color(0.117647, 0.141176, 0.160784, 0.0)
const GRID_LINE_COLOR := Color(0.88, 0.95, 1.0, 0.22)
const GRID_MAJOR_LINE_COLOR := Color(0.95, 0.98, 1.0, 0.42)
const GRID_SUPER_MAJOR_LINE_COLOR := Color(1.0, 1.0, 1.0, 0.68)
const GRID_AXIS_COLOR := Color(1.0, 0.94, 0.62, 0.78)
const GRID_BORDER_COLOR := Color(1.0, 0.94, 0.62, 0.62)

@export var show_in_game := false
@export var line_alpha := 0.22:
	set(value):
		line_alpha = clampf(value, 0.0, 1.0)
		queue_redraw()
@export var major_line_alpha := 0.42:
	set(value):
		major_line_alpha = clampf(value, 0.0, 1.0)
		queue_redraw()
@export var super_major_line_alpha := 0.68:
	set(value):
		super_major_line_alpha = clampf(value, 0.0, 1.0)
		queue_redraw()
@export var axis_alpha := 0.78:
	set(value):
		axis_alpha = clampf(value, 0.0, 1.0)
		queue_redraw()
@export var border_alpha := 0.62:
	set(value):
		border_alpha = clampf(value, 0.0, 1.0)
		queue_redraw()
@export_range(1, 64, 1) var major_line_every_cells := 1:
	set(value):
		major_line_every_cells = maxi(1, value)
		queue_redraw()
@export_range(1, 128, 1) var super_major_line_every_cells := 4:
	set(value):
		super_major_line_every_cells = maxi(1, value)
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
	var grid_major_line_color := GRID_MAJOR_LINE_COLOR
	grid_major_line_color.a = major_line_alpha
	var grid_super_major_line_color := GRID_SUPER_MAJOR_LINE_COLOR
	grid_super_major_line_color.a = super_major_line_alpha
	var grid_axis_color := GRID_AXIS_COLOR
	grid_axis_color.a = axis_alpha
	var grid_border_color := GRID_BORDER_COLOR
	grid_border_color.a = border_alpha
	var major_every := 1
	if major_line_every_cells != null:
		major_every = maxi(1, int(major_line_every_cells))
	var super_major_every := 4
	if super_major_line_every_cells != null:
		super_major_every = maxi(1, int(super_major_line_every_cells))
	var line_width := maxf(4.0, cell_size * 0.045)
	var major_line_width := maxf(6.0, cell_size * 0.065)
	var super_major_line_width := maxf(8.0, cell_size * 0.085)
	var axis_line_width := maxf(8.0, cell_size * 0.09)
	var border_width := maxf(6.0, cell_size * 0.065)

	draw_rect(rect, GRID_FILL_COLOR, true)

	var x := rect.position.x
	var x_index := 0
	while x <= rect.end.x + 0.5:
		var x_color := grid_line_color
		var x_width := line_width
		if is_zero_approx(x):
			x_color = grid_axis_color
			x_width = axis_line_width
		elif x_index % super_major_every == 0:
			x_color = grid_super_major_line_color
			x_width = super_major_line_width
		elif x_index % major_every == 0:
			x_color = grid_major_line_color
			x_width = major_line_width

		draw_line(Vector2(x, rect.position.y), Vector2(x, rect.end.y), x_color, x_width)
		x += cell_size
		x_index += 1

	var y := rect.position.y
	var y_index := 0
	while y <= rect.end.y + 0.5:
		var y_color := grid_line_color
		var y_width := line_width
		if is_zero_approx(y):
			y_color = grid_axis_color
			y_width = axis_line_width
		elif y_index % super_major_every == 0:
			y_color = grid_super_major_line_color
			y_width = super_major_line_width
		elif y_index % major_every == 0:
			y_color = grid_major_line_color
			y_width = major_line_width

		draw_line(Vector2(rect.position.x, y), Vector2(rect.end.x, y), y_color, y_width)
		y += cell_size
		y_index += 1

	draw_rect(rect, grid_border_color, false, border_width)
