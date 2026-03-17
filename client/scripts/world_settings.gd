@tool
class_name WorldSettings
extends Node

const EXPORT_PATH := "res://data/world_config.json"

@export_range(1.0, 1024.0, 1.0) var cell_size := 64.0:
	set(value):
		cell_size = maxf(1.0, value)
		_export_if_changed()

@export_range(1.0, 5000.0, 1.0) var world_half_width_cells := 667.0:
	set(value):
		world_half_width_cells = maxf(1.0, value)
		_export_if_changed()

@export_range(1.0, 5000.0, 1.0) var world_half_height_cells := 667.0:
	set(value):
		world_half_height_cells = maxf(1.0, value)
		_export_if_changed()

@export_range(1.0, 4096.0, 1.0) var wall_thickness := 256.0:
	set(value):
		wall_thickness = maxf(1.0, value)
		_export_if_changed()

var _last_export_payload := ""

func _ready() -> void:
	set_process(Engine.is_editor_hint())
	_export_if_changed()

func _process(_delta: float) -> void:
	if not Engine.is_editor_hint():
		return

	_export_if_changed()

func _export_if_changed() -> void:
	if not Engine.is_editor_hint():
		return

	var payload := JSON.stringify({
		"cellSize": snappedf(cell_size, 0.001),
		"worldHalfWidthCells": snappedf(world_half_width_cells, 0.001),
		"worldHalfHeightCells": snappedf(world_half_height_cells, 0.001),
		"wallThickness": snappedf(wall_thickness, 0.001),
	}, "\t")

	if payload == _last_export_payload:
		return

	var file := FileAccess.open(EXPORT_PATH, FileAccess.WRITE)
	if file == null:
		return

	file.store_string(payload + "\n")
	_last_export_payload = payload
