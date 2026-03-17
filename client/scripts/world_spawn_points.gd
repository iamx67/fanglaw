@tool
class_name WorldSpawnPoints
extends Node2D

const EXPORT_PATH := "res://data/world_spawn_points.json"

var _last_export_payload := ""

func _ready() -> void:
	set_process(Engine.is_editor_hint())
	_export_if_changed()

func _process(_delta: float) -> void:
	if not Engine.is_editor_hint():
		return

	_export_if_changed()

func _export_if_changed() -> void:
	var payload := JSON.stringify({
		"points": _collect_points()
	}, "\t")

	if payload == _last_export_payload:
		return

	var file := FileAccess.open(EXPORT_PATH, FileAccess.WRITE)
	if file == null:
		return

	file.store_string(payload + "\n")
	_last_export_payload = payload

func _collect_points() -> Array[Dictionary]:
	var points: Array[Dictionary] = []
	for child in get_children():
		if not child.has_method("build_export_point"):
			continue

		var point = child.build_export_point()
		if typeof(point) == TYPE_DICTIONARY and not point.is_empty():
			points.append(point)

	points.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return str(a.get("name", "")) < str(b.get("name", ""))
	)
	return points
