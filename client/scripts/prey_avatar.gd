@tool
class_name PreyAvatar
extends Node2D

@export var editor_preview_kind := "mouse"
@export var placeholder_visible := true:
	set(value):
		placeholder_visible = value
		_apply_visuals()

var _kind := "mouse"
var _state := "alive"

@onready var _visual_root: Node2D = $VisualRoot
@onready var _placeholder: Node2D = $VisualRoot/Placeholder
@onready var _glow: Polygon2D = $VisualRoot/Placeholder/Glow
@onready var _body: Polygon2D = $VisualRoot/Placeholder/Body

func _ready() -> void:
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
	var display_kind := editor_preview_kind if Engine.is_editor_hint() else _kind
	if display_kind.is_empty():
		display_kind = "mouse"
	var display_state := "alive" if Engine.is_editor_hint() else _state

	_placeholder.visible = placeholder_visible

	var body_color := _color_for_kind(display_kind)
	if display_state == "carcass":
		body_color = body_color.darkened(0.25)

	_body.color = body_color
	var glow_color := body_color.lightened(0.35)
	glow_color.a = 0.18 if display_state == "carcass" else 0.42
	_glow.color = glow_color
	_visual_root.rotation_degrees = 90.0 if display_state == "carcass" else 0.0
	_visual_root.scale = Vector2(0.9, 0.72) if display_state == "carcass" else Vector2.ONE

func _color_for_kind(prey_kind: String) -> Color:
	match prey_kind:
		"mouse":
			return Color("8d6e63")
		"bird":
			return Color("b0bec5")
		_:
			return Color("a1887f")
