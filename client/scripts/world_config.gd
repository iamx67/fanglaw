class_name WorldConfig
extends RefCounted

const CONFIG_PATH := "res://data/world_config.json"
const DEFAULT_CELL_SIZE := 64.0
const DEFAULT_WORLD_HALF_WIDTH_CELLS := 667.0
const DEFAULT_WORLD_HALF_HEIGHT_CELLS := 667.0
const DEFAULT_WALL_THICKNESS := 256.0

static var _loaded := false
static var _cell_size := DEFAULT_CELL_SIZE
static var _world_half_width_cells := DEFAULT_WORLD_HALF_WIDTH_CELLS
static var _world_half_height_cells := DEFAULT_WORLD_HALF_HEIGHT_CELLS
static var _wall_thickness := DEFAULT_WALL_THICKNESS

static func cell_size() -> float:
	_ensure_loaded()
	return _cell_size

static func world_half_width_cells() -> float:
	_ensure_loaded()
	return _world_half_width_cells

static func world_half_height_cells() -> float:
	_ensure_loaded()
	return _world_half_height_cells

static func wall_thickness() -> float:
	_ensure_loaded()
	return _wall_thickness

static func world_min_x() -> float:
	return -world_half_width_cells() * cell_size()

static func world_max_x() -> float:
	return world_half_width_cells() * cell_size()

static func world_min_y() -> float:
	return -world_half_height_cells() * cell_size()

static func world_max_y() -> float:
	return world_half_height_cells() * cell_size()

static func outer_world_rect() -> Rect2:
	var half_cell := cell_size() * 0.5
	return Rect2(
		Vector2(world_min_x() - half_cell, world_min_y() - half_cell),
		Vector2(
			(world_max_x() - world_min_x()) + cell_size(),
			(world_max_y() - world_min_y()) + cell_size()
		)
	)

static func playable_bounds_rect() -> Rect2:
	return Rect2(
		Vector2(world_min_x(), world_min_y()),
		Vector2(
			world_max_x() - world_min_x(),
			world_max_y() - world_min_y()
		)
	)

static func horizontal_wall_size() -> Vector2:
	var outer_rect := outer_world_rect()
	return Vector2(outer_rect.size.x + (wall_thickness() * 2.0), wall_thickness())

static func vertical_wall_size() -> Vector2:
	var outer_rect := outer_world_rect()
	return Vector2(wall_thickness(), outer_rect.size.y + (wall_thickness() * 2.0))

static func wall_top_position() -> Vector2:
	var outer_rect := outer_world_rect()
	return Vector2(0.0, outer_rect.position.y - (wall_thickness() * 0.5))

static func wall_bottom_position() -> Vector2:
	var outer_rect := outer_world_rect()
	return Vector2(0.0, outer_rect.end.y + (wall_thickness() * 0.5))

static func wall_left_position() -> Vector2:
	var outer_rect := outer_world_rect()
	return Vector2(outer_rect.position.x - (wall_thickness() * 0.5), 0.0)

static func wall_right_position() -> Vector2:
	var outer_rect := outer_world_rect()
	return Vector2(outer_rect.end.x + (wall_thickness() * 0.5), 0.0)

static func camera_limit_left() -> int:
	return int(round(outer_world_rect().position.x))

static func camera_limit_top() -> int:
	return int(round(outer_world_rect().position.y))

static func camera_limit_right() -> int:
	return int(round(outer_world_rect().end.x))

static func camera_limit_bottom() -> int:
	return int(round(outer_world_rect().end.y))

static func is_walkable_position(world_position: Vector2) -> bool:
	return (
		world_position.x >= world_min_x()
		and world_position.x <= world_max_x()
		and world_position.y >= world_min_y()
		and world_position.y <= world_max_y()
	)

static func clamp_to_playable_bounds(world_position: Vector2) -> Vector2:
	return Vector2(
		clampf(world_position.x, world_min_x(), world_max_x()),
		clampf(world_position.y, world_min_y(), world_max_y())
	)

static func _ensure_loaded() -> void:
	if _loaded:
		return

	_loaded = true
	var file := FileAccess.open(CONFIG_PATH, FileAccess.READ)
	if file == null:
		return

	var parsed = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return

	var data: Dictionary = parsed
	_cell_size = _read_positive_number(data, "cellSize", DEFAULT_CELL_SIZE)
	_world_half_width_cells = _read_positive_number(
		data,
		"worldHalfWidthCells",
		DEFAULT_WORLD_HALF_WIDTH_CELLS
	)
	_world_half_height_cells = _read_positive_number(
		data,
		"worldHalfHeightCells",
		DEFAULT_WORLD_HALF_HEIGHT_CELLS
	)
	_wall_thickness = _read_positive_number(data, "wallThickness", DEFAULT_WALL_THICKNESS)

static func _read_positive_number(data: Dictionary, key: String, fallback: float) -> float:
	if not data.has(key):
		return fallback

	var value = data[key]
	if typeof(value) != TYPE_INT and typeof(value) != TYPE_FLOAT:
		return fallback

	var number := float(value)
	if not is_finite(number) or number <= 0.0:
		return fallback

	return number
