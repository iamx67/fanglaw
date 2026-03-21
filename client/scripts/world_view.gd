@tool
class_name WorldView
extends Node2D

@export var camera_follow_speed := 10.0
@export var camera_resnap_distance := 512.0
@export_range(0.25, 2.0, 0.01) var camera_zoom_factor := 0.60
@export_range(0.25, 2.0, 0.01) var camera_zoom_min := 0.45
@export_range(0.25, 2.0, 0.01) var camera_zoom_max := 0.80
@export_range(0.01, 0.25, 0.01) var camera_zoom_step := 0.05

const WorldConfig = preload("res://scripts/world_config.gd")

@onready var world_settings: Node = $WorldSettings
@onready var backgrounds_layer: Node2D = $Backgrounds
@onready var map_layer: Node2D = $Map
@onready var biome_transitions_layer: Node2D = $Map/BiomeTransitions
@onready var scent_trail: Node2D = $ScentTrail
@onready var depth_objects_layer: Node2D = $DepthObjects
@onready var prey_visual_library: Node = $DepthObjects/PreyVisualLibrary
@onready var blockers_layer: Node2D = $Blockers
@onready var location_zones_layer: Node2D = $LocationZones
@onready var prey_search_zones_layer: Node2D = $PreySearchZones
@onready var bounds_layer: Node2D = $Bounds
@onready var props_layer: Node2D = $DepthObjects
@onready var npc_layer: Node2D = $DepthObjects
@onready var players_layer: Node2D = $DepthObjects
@onready var spawn_points_layer: Node2D = $SpawnPoints
@onready var world_camera: Camera2D = $Camera2D

var _active_camera_zone_rect := Rect2()

func _ready() -> void:
	world_camera.enabled = true
	world_camera.position_smoothing_speed = camera_follow_speed
	world_camera.position_smoothing_enabled = true
	_apply_camera_zoom()
	world_camera.limit_left = WorldConfig.camera_limit_left()
	world_camera.limit_top = WorldConfig.camera_limit_top()
	world_camera.limit_right = WorldConfig.camera_limit_right()
	world_camera.limit_bottom = WorldConfig.camera_limit_bottom()
	world_camera.make_current()

func _unhandled_input(event: InputEvent) -> void:
	if Engine.is_editor_hint():
		return

	var mouse_event := event as InputEventMouseButton
	if mouse_event == null or not mouse_event.pressed:
		return

	var effective_zoom_min := _get_effective_camera_zoom_min()

	if mouse_event.button_index == MOUSE_BUTTON_WHEEL_UP:
		camera_zoom_factor = clampf(camera_zoom_factor + camera_zoom_step, effective_zoom_min, camera_zoom_max)
		_apply_camera_zoom()
		get_viewport().set_input_as_handled()
	elif mouse_event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
		camera_zoom_factor = clampf(camera_zoom_factor - camera_zoom_step, effective_zoom_min, camera_zoom_max)
		_apply_camera_zoom()
		get_viewport().set_input_as_handled()

func grab_world_focus() -> void:
	var parent_control := get_parent() as Control
	if parent_control == null:
		return

	parent_control.focus_mode = Control.FOCUS_ALL
	parent_control.grab_focus()

func set_camera_target(world_position: Vector2, snap_to_target := false) -> void:
	var requested_position := world_position
	world_position = _clamp_camera_target(world_position)
	if _has_active_camera_zone() and not requested_position.is_equal_approx(world_position):
		snap_to_target = true

	if not snap_to_target and camera_resnap_distance > 0.0:
		var actual_camera_position := world_camera.get_screen_center_position()
		if actual_camera_position.distance_to(world_position) >= camera_resnap_distance:
			snap_to_target = true

	world_camera.global_position = world_position

	if snap_to_target:
		world_camera.reset_smoothing()

func reset_camera() -> void:
	clear_camera_zone(false)
	world_camera.global_position = Vector2.ZERO
	world_camera.reset_smoothing()

func set_camera_zone_rect(zone_rect: Rect2, snap_to_zone := false) -> void:
	if zone_rect == Rect2():
		clear_camera_zone(snap_to_zone)
		return

	_active_camera_zone_rect = zone_rect
	var clamped_position := _clamp_camera_target(world_camera.global_position)
	world_camera.global_position = clamped_position
	if snap_to_zone:
		world_camera.reset_smoothing()

func clear_camera_zone(snap_to_world := false) -> void:
	_active_camera_zone_rect = Rect2()
	var clamped_position := _clamp_camera_target(world_camera.global_position)
	world_camera.global_position = clamped_position
	if snap_to_world:
		world_camera.reset_smoothing()

func get_prey_visual_preview(visual_id: String, fallback_kind := "") -> Node:
	var normalized_visual_id := visual_id.strip_edges().to_lower()
	if prey_visual_library != null:
		for child in prey_visual_library.get_children():
			if child != null and child.has_method("matches_visual_id") and child.matches_visual_id(normalized_visual_id):
				return child

	var normalized_fallback_kind := fallback_kind.strip_edges().to_lower()
	if prey_visual_library != null and not normalized_fallback_kind.is_empty():
		for child in prey_visual_library.get_children():
			if child != null and child.has_method("matches_visual_id") and child.matches_visual_id(normalized_fallback_kind):
				return child

	return npc_layer.get_node_or_null("PreyPreview")

func set_scent_trail(from_position: Vector2, to_position: Vector2) -> void:
	if scent_trail == null:
		return

	if scent_trail.has_method("set_trail"):
		scent_trail.set_trail(from_position, to_position)

func clear_scent_trail() -> void:
	if scent_trail == null:
		return

	if scent_trail.has_method("clear_trail"):
		scent_trail.clear_trail()

func _apply_camera_zoom() -> void:
	if world_camera == null:
		return

	var effective_zoom_min := _get_effective_camera_zoom_min()
	camera_zoom_factor = clampf(camera_zoom_factor, effective_zoom_min, camera_zoom_max)
	world_camera.zoom = Vector2.ONE * camera_zoom_factor
	world_camera.global_position = _clamp_camera_target(world_camera.global_position)
	if _has_active_camera_zone():
		world_camera.reset_smoothing()

func _has_active_camera_zone() -> bool:
	return _active_camera_zone_rect != Rect2()

func _get_effective_camera_zoom_min() -> float:
	var effective_min := camera_zoom_min
	if not _has_active_camera_zone():
		return effective_min

	var viewport_size := get_viewport_rect().size
	if viewport_size.x <= 0.0 or viewport_size.y <= 0.0:
		return effective_min

	var zone_rect := _active_camera_zone_rect
	if zone_rect.size.x <= 0.0 or zone_rect.size.y <= 0.0:
		return effective_min

	var zone_zoom_min_x := viewport_size.x / zone_rect.size.x
	var zone_zoom_min_y := viewport_size.y / zone_rect.size.y
	return maxf(effective_min, maxf(zone_zoom_min_x, zone_zoom_min_y))

func _clamp_camera_target(world_position: Vector2) -> Vector2:
	var target := world_position
	var world_rect := Rect2(
		Vector2(WorldConfig.camera_limit_left(), WorldConfig.camera_limit_top()),
		Vector2(
			WorldConfig.camera_limit_right() - WorldConfig.camera_limit_left(),
			WorldConfig.camera_limit_bottom() - WorldConfig.camera_limit_top()
		)
	)
	target = _clamp_to_rect(target, world_rect)
	if _has_active_camera_zone():
		target = _clamp_to_rect(target, _active_camera_zone_rect)
	return target

func _clamp_to_rect(world_position: Vector2, rect: Rect2) -> Vector2:
	if rect == Rect2() or world_camera == null:
		return world_position

	var viewport_size := get_viewport_rect().size
	if viewport_size.x <= 0.0 or viewport_size.y <= 0.0:
		return world_position

	var safe_zoom := Vector2(
		maxf(world_camera.zoom.x, 0.001),
		maxf(world_camera.zoom.y, 0.001)
	)
	var half_extents := Vector2(
		(viewport_size.x * 0.5) / safe_zoom.x,
		(viewport_size.y * 0.5) / safe_zoom.y
	)
	var rect_center := rect.position + (rect.size * 0.5)

	var min_x := rect.position.x + half_extents.x
	var max_x := rect.end.x - half_extents.x
	var min_y := rect.position.y + half_extents.y
	var max_y := rect.end.y - half_extents.y

	var target_x := rect_center.x if min_x > max_x else clampf(world_position.x, min_x, max_x)
	var target_y := rect_center.y if min_y > max_y else clampf(world_position.y, min_y, max_y)
	return Vector2(target_x, target_y)
