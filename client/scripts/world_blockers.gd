@tool
class_name WorldBlockers
extends Node2D

const EXPORT_PATH := "res://data/world_blockers.json"

var _last_export_payload := ""

func _ready() -> void:
	set_process(Engine.is_editor_hint())
	_export_if_changed()

func _process(_delta: float) -> void:
	if not Engine.is_editor_hint():
		return

	_export_if_changed()

func _export_if_changed() -> void:
	if not is_inside_tree():
		return

	var payload := JSON.stringify({
		"rects": _collect_blockers()
	}, "\t")

	if payload == _last_export_payload:
		return

	var file := FileAccess.open(EXPORT_PATH, FileAccess.WRITE)
	if file == null:
		return

	file.store_string(payload + "\n")
	_last_export_payload = payload

func _collect_blockers() -> Array[Dictionary]:
	var rects: Array[Dictionary] = []

	for child in get_children():
		if not child.has_method("build_export_rect"):
			continue

		var rect_data = child.build_export_rect()
		if typeof(rect_data) != TYPE_DICTIONARY or rect_data.is_empty():
			continue

		rects.append(rect_data)

	rects.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return str(a.get("name", "")) < str(b.get("name", ""))
	)
	return rects
