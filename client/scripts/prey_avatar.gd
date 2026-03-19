@tool
class_name PreyAvatar
extends Node2D

@export var editor_preview_only := false
@export var editor_preview_kind := "mouse"
@export var editor_preview_state := "alive"
@export var placeholder_visible := true:
	set(value):
		placeholder_visible = value
		_apply_visuals()

var _kind := "mouse"
var _state := "alive"

var _visual_root: Node2D = null
var _placeholder: Node2D = null
var _glow: Polygon2D = null
var _body: Polygon2D = null

func _ready() -> void:
	if editor_preview_only and not Engine.is_editor_hint():
		visible = false
		set_process(false)
		return

	set_process(Engine.is_editor_hint())
	_apply_visuals()

func configure(prey_kind: String, prey_state := "alive") -> void:
	_kind = prey_kind.strip_edges()
	if _kind.is_empty():
		_kind = "mouse"
	_state = prey_state.strip_edges()
	if _state.is_empty():
		_state = "alive"

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

	_visual_root.modulate = Color(0.82, 0.82, 0.82, 1.0) if display_state == "carcass" else Color.WHITE
	_visual_root.rotation_degrees = 90.0 if display_state == "carcass" else 0.0
	_visual_root.scale = Vector2(0.9, 0.72) if display_state == "carcass" else Vector2.ONE

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
		child.queue_free()

	for child in source_visual_root.get_children():
		_visual_root.add_child(child.duplicate())

	_refresh_visual_refs()
	_apply_visuals()

func _refresh_visual_refs() -> void:
	_visual_root = get_node_or_null("VisualRoot") as Node2D
	_placeholder = get_node_or_null("VisualRoot/Placeholder") as Node2D
	_glow = get_node_or_null("VisualRoot/Placeholder/Glow") as Polygon2D
	_body = get_node_or_null("VisualRoot/Placeholder/Body") as Polygon2D

func _color_for_kind(prey_kind: String) -> Color:
	match prey_kind:
		"mouse":
			return Color("8d6e63")
		"bird":
			return Color("b0bec5")
		_:
			return Color("a1887f")
