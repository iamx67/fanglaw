class_name WorldConfig
extends RefCounted

const CONFIG_PATH := "res://data/world_config.json"
const BLOCKERS_PATH := "res://data/world_blockers.json"
const DEFAULT_CELL_SIZE := 256.0
const DEFAULT_WORLD_HALF_WIDTH_CELLS := 62.0
const DEFAULT_WORLD_HALF_HEIGHT_CELLS := 62.0
const DEFAULT_WALL_THICKNESS := 256.0

static var _loaded := false
static var _cell_size := DEFAULT_CELL_SIZE
static var _world_half_width_cells := DEFAULT_WORLD_HALF_WIDTH_CELLS
static var _world_half_height_cells := DEFAULT_WORLD_HALF_HEIGHT_CELLS
static var _wall_thickness := DEFAULT_WALL_THICKNESS
static var _blocker_rects: Array[Rect2] = []
static var _config_modified_time := -1
static var _blockers_modified_time := -1

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
	return is_within_world_bounds(world_position) and not is_blocked_position(world_position)

static func is_within_world_bounds(world_position: Vector2) -> bool:
	return (
		world_position.x >= world_min_x()
		and world_position.x <= world_max_x()
		and world_position.y >= world_min_y()
		and world_position.y <= world_max_y()
	)

static func is_blocked_position(world_position: Vector2) -> bool:
	_ensure_loaded()

	for blocker_rect in _blocker_rects:
		if _rect_contains_point(blocker_rect, world_position):
			return true

	return false

static func blocker_rects() -> Array[Rect2]:
	_ensure_loaded()
	return _blocker_rects.duplicate()

static func clamp_to_playable_bounds(world_position: Vector2) -> Vector2:
	return Vector2(
		clampf(world_position.x, world_min_x(), world_max_x()),
		clampf(world_position.y, world_min_y(), world_max_y())
	)

static func _ensure_loaded() -> void:
	var config_modified_time := FileAccess.get_modified_time(CONFIG_PATH)
	var blockers_modified_time := FileAccess.get_modified_time(BLOCKERS_PATH)
	if (
		_loaded
		and config_modified_time == _config_modified_time
		and blockers_modified_time == _blockers_modified_time
	):
		return

	_loaded = true
	_config_modified_time = config_modified_time
	_blockers_modified_time = blockers_modified_time
	_cell_size = DEFAULT_CELL_SIZE
	_world_half_width_cells = DEFAULT_WORLD_HALF_WIDTH_CELLS
	_world_half_height_cells = DEFAULT_WORLD_HALF_HEIGHT_CELLS
	_wall_thickness = DEFAULT_WALL_THICKNESS
	var file := FileAccess.open(CONFIG_PATH, FileAccess.READ)
	if file == null:
		_blocker_rects = _load_blocker_rects()
		return

	var parsed = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		_blocker_rects = _load_blocker_rects()
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
	_blocker_rects = _load_blocker_rects()

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

static func _load_blocker_rects() -> Array[Rect2]:
	var rects: Array[Rect2] = []
	var file := FileAccess.open(BLOCKERS_PATH, FileAccess.READ)
	if file == null:
		return rects

	var parsed = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return rects

	var data: Dictionary = parsed
	var raw_rects = data.get("rects", [])
	if typeof(raw_rects) != TYPE_ARRAY:
		return rects

	for raw_rect in raw_rects:
		if typeof(raw_rect) != TYPE_DICTIONARY:
			continue

		var blocker_data: Dictionary = raw_rect
		var width := _read_positive_number(blocker_data, "width", 0.0)
		var height := _read_positive_number(blocker_data, "height", 0.0)
		if width <= 0.0 or height <= 0.0:
			continue

		var center_x := _read_number(blocker_data, "x", 0.0)
		var center_y := _read_number(blocker_data, "y", 0.0)
		rects.append_array(
			_rect_to_blocked_cells(
				Rect2(
					Vector2(center_x - (width * 0.5), center_y - (height * 0.5)),
					Vector2(width, height)
				)
			)
		)

	return rects

static func _read_number(data: Dictionary, key: String, fallback: float) -> float:
	if not data.has(key):
		return fallback

	var value = data[key]
	if typeof(value) != TYPE_INT and typeof(value) != TYPE_FLOAT:
		return fallback

	var number := float(value)
	if not is_finite(number):
		return fallback

	return number

static func _rect_contains_point(rect: Rect2, point: Vector2) -> bool:
	return (
		point.x >= rect.position.x
		and point.x <= rect.end.x
		and point.y >= rect.position.y
		and point.y <= rect.end.y
	)

static func _rect_to_blocked_cells(source_rect: Rect2) -> Array[Rect2]:
	var blocked_cells: Array[Rect2] = []
	var size := cell_size()
	var half_cell := size * 0.5
	var min_grid_x := int(floor((source_rect.position.x - half_cell) / size))
	var max_grid_x := int(ceil((source_rect.end.x + half_cell) / size))
	var min_grid_y := int(floor((source_rect.position.y - half_cell) / size))
	var max_grid_y := int(ceil((source_rect.end.y + half_cell) / size))

	for grid_y in range(min_grid_y, max_grid_y + 1):
		var center_y := float(grid_y) * size
		if center_y < world_min_y() or center_y > world_max_y():
			continue

		for grid_x in range(min_grid_x, max_grid_x + 1):
			var center_x := float(grid_x) * size
			if center_x < world_min_x() or center_x > world_max_x():
				continue

			var cell_rect := Rect2(
				Vector2(center_x - half_cell, center_y - half_cell),
				Vector2(size, size)
			)
			if source_rect.intersects(cell_rect):
				blocked_cells.append(cell_rect)

	return blocked_cells
