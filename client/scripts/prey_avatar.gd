@tool
class_name PreyAvatar
extends Node2D

const WorldConfig = preload("res://scripts/world_config.gd")
const WATCH_INDICATOR_TEXTURE_PATH := "res://assets/ui/bird_watch_indicator.png"

@export var editor_preview_only := false
@export var editor_preview_visual_id := "mouse"
@export var editor_preview_kind := "mouse"
@export var editor_preview_state := "alive"
@export_range(0.1, 2.0, 0.01) var fit_to_cell_ratio := 0.85
@export var visual_texture: Texture2D:
	set(value):
		visual_texture = value
		_apply_visuals()
@export var placeholder_visible := true:
	set(value):
		placeholder_visible = value
		_apply_visuals()

var _kind := "mouse"
var _state := "alive"
var _behavior_type := "runner"
var _watching := false

var _visual_root: Node2D = null
var _visual_sprite: Sprite2D = null
var _placeholder: Node2D = null
var _glow: Polygon2D = null
var _body: Polygon2D = null
var _watch_indicator: Sprite2D = null

func _ready() -> void:
	if editor_preview_only and not Engine.is_editor_hint():
		visible = false
		set_process(false)
		return

	set_process(Engine.is_editor_hint())
	_apply_visuals()

func configure(prey_kind: String, prey_state := "alive", behavior_type := "runner", watching := false) -> void:
	_kind = prey_kind.strip_edges()
	if _kind.is_empty():
		_kind = "mouse"
	_state = prey_state.strip_edges()
	if _state.is_empty():
		_state = "alive"
	_behavior_type = str(behavior_type).strip_edges()
	if _behavior_type.is_empty():
		_behavior_type = "runner"
	_watching = bool(watching)

	if is_inside_tree():
		_apply_visuals()

func _process(_delta: float) -> void:
	if Engine.is_editor_hint():
		_apply_visuals()

func _apply_visuals() -> void:
	_refresh_visual_refs()

	var display_kind := editor_preview_kind if Engine.is_editor_hint() and editor_preview_only else _kind
	if display_kind.is_empty():
		display_kind = "mouse"
	var display_state := editor_preview_state if Engine.is_editor_hint() and editor_preview_only else _state
	if display_state.is_empty():
		display_state = "alive"

	if _placeholder != null:
		_placeholder.visible = placeholder_visible

	var body_color := _color_for_kind(display_kind)
	if display_state == "carcass":
		body_color = body_color.darkened(0.25)

	if _body != null:
		_body.color = body_color

	if _glow != null:
		var glow_color := body_color.lightened(0.35)
		glow_color.a = 0.18 if display_state == "carcass" else 0.42
		_glow.color = glow_color

	if _visual_root == null:
		return

	if _visual_sprite != null and visual_texture != null:
		_visual_sprite.texture = visual_texture

	_visual_root.modulate = Color(0.82, 0.82, 0.82, 1.0) if display_state == "carcass" else Color.WHITE
	_visual_root.rotation_degrees = 90.0 if display_state == "carcass" else 0.0
	var fit_scale := _compute_fit_scale()
	var state_scale := Vector2(0.9, 0.72) if display_state == "carcass" else Vector2.ONE
	_visual_root.scale = (Vector2.ONE * fit_scale) * state_scale
	_update_watch_indicator()

func copy_visual_from(source_avatar: PreyAvatar) -> void:
	if source_avatar == null:
		return

	_refresh_visual_refs()
	if _visual_root == null:
		return

	var source_visual_root := source_avatar.get_node_or_null("VisualRoot") as Node2D
	if source_visual_root == null:
		return

	for child in _visual_root.get_children():
		_visual_root.remove_child(child)
		child.queue_free()

	for child in source_visual_root.get_children():
		_visual_root.add_child(child.duplicate())

	visual_texture = source_avatar.visual_texture
	fit_to_cell_ratio = source_avatar.fit_to_cell_ratio
	placeholder_visible = source_avatar.placeholder_visible
	_refresh_visual_refs()
	_apply_visuals()

func matches_visual_id(visual_id: String) -> bool:
	var normalized_requested := visual_id.strip_edges().to_lower()
	var normalized_self := editor_preview_visual_id.strip_edges().to_lower()
	if normalized_requested.is_empty():
		return false

	return normalized_requested == normalized_self

func _should_draw_watch_indicator() -> bool:
	return _visual_root != null and _state == "alive" and _behavior_type == "bird" and _watching

func _update_watch_indicator() -> void:
	if _watch_indicator == null:
		return

	_ensure_watch_indicator_texture()
	var should_show := _should_draw_watch_indicator() and _watch_indicator.texture != null
	_watch_indicator.visible = should_show
	if not should_show:
		return

	var visual_bounds := _calculate_subtree_bounds(_visual_root, Transform2D.IDENTITY, false)
	if visual_bounds.size == Vector2.ZERO:
		_watch_indicator.visible = false
		return

	var indicator_size := Vector2(60.0, 40.0)
	var center_x := visual_bounds.position.x + visual_bounds.size.x * 0.5
	var indicator_y := visual_bounds.position.y - maxf(22.0, visual_bounds.size.y * 0.22)
	var texture_size := _watch_indicator.texture.get_size()
	if texture_size.x <= 0.0 or texture_size.y <= 0.0:
		_watch_indicator.visible = false
		return

	var fit_scale := minf(indicator_size.x / texture_size.x, indicator_size.y / texture_size.y)
	_watch_indicator.centered = true
	_watch_indicator.position = Vector2(center_x, indicator_y)
	_watch_indicator.scale = Vector2.ONE * fit_scale

func _ensure_watch_indicator_texture() -> void:
	if _watch_indicator == null or _watch_indicator.texture != null:
		return

	if not ResourceLoader.exists(WATCH_INDICATOR_TEXTURE_PATH):
		return

	_watch_indicator.texture = load(WATCH_INDICATOR_TEXTURE_PATH) as Texture2D

func _compute_fit_scale() -> float:
	if _visual_root == null:
		return 1.0

	var bounds := _calculate_unscaled_visual_bounds()
	if bounds.size.x <= 0.0 or bounds.size.y <= 0.0:
		return 1.0

	var target_size := WorldConfig.cell_size() * fit_to_cell_ratio
	var scale_x := target_size / bounds.size.x
	var scale_y := target_size / bounds.size.y
	return minf(1.0, minf(scale_x, scale_y))

func _calculate_unscaled_visual_bounds() -> Rect2:
	if _visual_root == null:
		return Rect2()

	var has_bounds := false
	var bounds := Rect2()
	for child in _visual_root.get_children():
		var child_node := child as Node
		if child_node == null:
			continue

		var child_bounds := _calculate_subtree_bounds(child_node, Transform2D.IDENTITY, false)
		if child_bounds.size == Vector2.ZERO:
			continue

		if not has_bounds:
			bounds = child_bounds
			has_bounds = true
		else:
			bounds = bounds.merge(child_bounds)

	return bounds if has_bounds else Rect2()

func _calculate_subtree_bounds(node: Node, accumulated_transform: Transform2D, has_bounds: bool) -> Rect2:
	var bounds := Rect2()
	var local_transform := accumulated_transform
	var node_2d := node as Node2D
	if node_2d != null and node != self:
		local_transform = accumulated_transform * node_2d.transform

	if node is Sprite2D:
		var sprite := node as Sprite2D
		if sprite.texture != null:
			var texture_size := sprite.texture.get_size()
			var origin := sprite.offset
			if sprite.centered:
				origin -= texture_size * 0.5
			var sprite_rect := Rect2(origin, texture_size)
			var sprite_bounds := _transform_rect(sprite_rect, local_transform)
			if not has_bounds:
				bounds = sprite_bounds
				has_bounds = true
			else:
				bounds = bounds.merge(sprite_bounds)

	if node is Polygon2D:
		var polygon_node := node as Polygon2D
		if polygon_node.polygon.size() > 0:
			var polygon_bounds := Rect2(polygon_node.polygon[0], Vector2.ZERO)
			for point in polygon_node.polygon:
				polygon_bounds = polygon_bounds.expand(point)
			var transformed_polygon_bounds := _transform_rect(polygon_bounds, local_transform)
			if not has_bounds:
				bounds = transformed_polygon_bounds
				has_bounds = true
			else:
				bounds = bounds.merge(transformed_polygon_bounds)

	for child in node.get_children():
		var child_node := child as Node
		if child_node == null:
			continue
		var child_bounds := _calculate_subtree_bounds(child_node, local_transform, has_bounds)
		if child_bounds.size != Vector2.ZERO:
			if not has_bounds:
				bounds = child_bounds
				has_bounds = true
			else:
				bounds = bounds.merge(child_bounds)

	return bounds if has_bounds else Rect2()

func _transform_rect(rect: Rect2, transform: Transform2D) -> Rect2:
	var points := PackedVector2Array([
		rect.position,
		rect.position + Vector2(rect.size.x, 0.0),
		rect.position + Vector2(0.0, rect.size.y),
		rect.position + rect.size,
	])
	var transformed_rect := Rect2(transform * points[0], Vector2.ZERO)
	for point in points:
		transformed_rect = transformed_rect.expand(transform * point)
	return transformed_rect

func _refresh_visual_refs() -> void:
	_visual_root = get_node_or_null("VisualRoot") as Node2D
	_visual_sprite = get_node_or_null("VisualRoot/Sprite2D") as Sprite2D
	_placeholder = get_node_or_null("VisualRoot/Placeholder") as Node2D
	_glow = get_node_or_null("VisualRoot/Placeholder/Glow") as Polygon2D
	_body = get_node_or_null("VisualRoot/Placeholder/Body") as Polygon2D
	_watch_indicator = get_node_or_null("WatchIndicator") as Sprite2D

func _color_for_kind(prey_kind: String) -> Color:
	match prey_kind:
		"mouse":
			return Color("8d6e63")
		"bird":
			return Color("b0bec5")
		_:
			return Color("a1887f")
