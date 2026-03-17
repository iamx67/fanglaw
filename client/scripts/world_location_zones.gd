@tool
class_name WorldLocationZones
extends Node2D

const EXPORT_PATH := "res://data/world_locations.json"

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
		"zones": _collect_zones()
	}, "\t")

	if payload == _last_export_payload:
		return

	var file := FileAccess.open(EXPORT_PATH, FileAccess.WRITE)
	if file == null:
		return

	file.store_string(payload + "\n")
	_last_export_payload = payload

func _collect_zones() -> Array[Dictionary]:
	var zones: Array[Dictionary] = []
	for child in get_children():
		if not child.has_method("build_export_zone"):
			continue

		var zone = child.build_export_zone()
		if typeof(zone) == TYPE_DICTIONARY and not zone.is_empty():
			zones.append(zone)

	zones.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return str(a.get("name", "")) < str(b.get("name", ""))
	)
	return zones
