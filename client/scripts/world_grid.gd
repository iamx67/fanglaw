@tool
class_name WorldGrid
extends Node2D

const WorldConfig = preload("res://scripts/world_config.gd")
const GRID_LINE_COLOR := Color(0.88, 0.95, 1.0, 0.18)
const GRID_MAJOR_LINE_COLOR := Color(0.95, 0.98, 1.0, 0.30)
const GRID_SUPER_MAJOR_LINE_COLOR := Color(1.0, 1.0, 1.0, 0.42)
const GRID_AXIS_COLOR := Color(1.0, 0.94, 0.62, 0.54)
const GRID_BORDER_COLOR := Color(1.0, 0.94, 0.62, 0.42)
const LINES_CONTAINER_NAME := "__GridLines"

@export var show_in_game := false:
	set(value):
		show_in_game = value
		_update_grid_visibility()
@export var line_alpha := 0.18:
	set(value):
		line_alpha = clampf(value, 0.0, 1.0)
		_rebuild_grid()
@export var major_line_alpha := 0.30:
	set(value):
		major_line_alpha = clampf(value, 0.0, 1.0)
		_rebuild_grid()
@export var super_major_line_alpha := 0.42:
	set(value):
		super_major_line_alpha = clampf(value, 0.0, 1.0)
		_rebuild_grid()
@export var axis_alpha := 0.54:
	set(value):
		axis_alpha = clampf(value, 0.0, 1.0)
		_rebuild_grid()
@export var border_alpha := 0.42:
	set(value):
		border_alpha = clampf(value, 0.0, 1.0)
		_rebuild_grid()
@export_range(1, 64, 1) var major_line_every_cells := 1:
	set(value):
		major_line_every_cells = maxi(1, value)
		_rebuild_grid()
@export_range(1, 128, 1) var super_major_line_every_cells := 4:
	set(value):
		super_major_line_every_cells = maxi(1, value)
		_rebuild_grid()

var _last_signature := ""

func _ready() -> void:
	set_process(Engine.is_editor_hint())
	_rebuild_grid()

func _process(_delta: float) -> void:
	if not Engine.is_editor_hint():
		return

	var next_signature := _build_signature()
	if next_signature == _last_signature:
		return

	_rebuild_grid()

func _rebuild_grid() -> void:
	if not is_inside_tree():
		return

	_last_signature = _build_signature()
	var lines_container := _ensure_lines_container()
	for child in lines_container.get_children():
		child.queue_free()

	_update_grid_visibility()
	if not lines_container.visible:
		return

	var cell_size := WorldConfig.cell_size()
	var half_width_cells := int(round(WorldConfig.world_half_width_cells()))
	var half_height_cells := int(round(WorldConfig.world_half_height_cells()))
	var world_min_x := WorldConfig.world_min_x()
	var world_max_x := WorldConfig.world_max_x()
	var world_min_y := WorldConfig.world_min_y()
	var world_max_y := WorldConfig.world_max_y()
	var playable_rect := WorldConfig.playable_bounds_rect()

	var line_width := 2.0
	var major_line_width := 3.0
	var super_major_line_width := 4.0
	var axis_line_width := 4.0
	var border_line_width := 4.0

	for x_index in range(-half_width_cells, half_width_cells + 1):
		var x := float(x_index) * cell_size
		var x_color := _line_color_for_index(x_index)
		var x_width := _line_width_for_index(x_index, line_width, major_line_width, super_major_line_width, axis_line_width)
		var is_border_x := x_index == -half_width_cells or x_index == half_width_cells
		if is_border_x:
			x_color = GRID_BORDER_COLOR
			x_color.a = border_alpha
			x_width = border_line_width

		_add_line(lines_container, Vector2(x, world_min_y), Vector2(x, world_max_y), x_color, x_width)

	for y_index in range(-half_height_cells, half_height_cells + 1):
		var y := float(y_index) * cell_size
		var y_color := _line_color_for_index(y_index)
		var y_width := _line_width_for_index(y_index, line_width, major_line_width, super_major_line_width, axis_line_width)
		var is_border_y := y_index == -half_height_cells or y_index == half_height_cells
		if is_border_y:
			y_color = GRID_BORDER_COLOR
			y_color.a = border_alpha
			y_width = border_line_width

		_add_line(lines_container, Vector2(world_min_x, y), Vector2(world_max_x, y), y_color, y_width)

	_add_rect_outline(lines_container, playable_rect, _with_alpha(GRID_BORDER_COLOR, border_alpha), border_line_width)

func _line_color_for_index(index: int) -> Color:
	if index == 0:
		return _with_alpha(GRID_AXIS_COLOR, axis_alpha)
	if index % maxi(1, super_major_line_every_cells) == 0:
		return _with_alpha(GRID_SUPER_MAJOR_LINE_COLOR, super_major_line_alpha)
	if index % maxi(1, major_line_every_cells) == 0:
		return _with_alpha(GRID_MAJOR_LINE_COLOR, major_line_alpha)
	return _with_alpha(GRID_LINE_COLOR, line_alpha)

func _line_width_for_index(index: int, base_width: float, major_width: float, super_major_width: float, axis_width: float) -> float:
	if index == 0:
		return axis_width
	if index % maxi(1, super_major_line_every_cells) == 0:
		return super_major_width
	if index % maxi(1, major_line_every_cells) == 0:
		return major_width
	return base_width

func _with_alpha(color: Color, alpha: float) -> Color:
	var next := color
	next.a = alpha
	return next

func _add_rect_outline(parent: Node, rect: Rect2, color: Color, width: float) -> void:
	_add_line(parent, rect.position, Vector2(rect.end.x, rect.position.y), color, width)
	_add_line(parent, Vector2(rect.end.x, rect.position.y), rect.end, color, width)
	_add_line(parent, rect.end, Vector2(rect.position.x, rect.end.y), color, width)
	_add_line(parent, Vector2(rect.position.x, rect.end.y), rect.position, color, width)

func _add_line(parent: Node, from_point: Vector2, to_point: Vector2, color: Color, width: float) -> void:
	var line := Line2D.new()
	line.width = width
	line.default_color = color
	line.antialiased = true
	line.texture_mode = Line2D.LINE_TEXTURE_NONE
	line.add_point(from_point)
	line.add_point(to_point)
	parent.add_child(line, false, Node.INTERNAL_MODE_FRONT)

func _ensure_lines_container() -> Node2D:
	var existing := get_node_or_null(LINES_CONTAINER_NAME) as Node2D
	if existing != null:
		return existing

	var container := Node2D.new()
	container.name = LINES_CONTAINER_NAME
	add_child(container, false, Node.INTERNAL_MODE_FRONT)
	return container

func _update_grid_visibility() -> void:
	var lines_container := get_node_or_null(LINES_CONTAINER_NAME) as CanvasItem
	if lines_container == null:
		return

	lines_container.visible = Engine.is_editor_hint() or show_in_game

func _build_signature() -> String:
	return "%s|%s|%s|%s|%s|%s|%s|%s" % [
		WorldConfig.cell_size(),
		WorldConfig.world_half_width_cells(),
		WorldConfig.world_half_height_cells(),
		line_alpha,
		major_line_alpha,
		super_major_line_alpha,
		axis_alpha,
		border_alpha,
	]
