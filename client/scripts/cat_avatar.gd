class_name CatAvatar
extends Control

const AVATAR_SIZE := Vector2(96, 76)
const LOCAL_BODY_COLOR := Color(0.94902, 0.737255, 0.321569, 1)
const LOCAL_ACCENT_COLOR := Color(0.854902, 0.443137, 0.176471, 1)
const REMOTE_BODY_COLOR := Color(0.462745, 0.701961, 0.94902, 1)
const REMOTE_ACCENT_COLOR := Color(0.215686, 0.415686, 0.701961, 1)

var _player_name := "Cat"
var _is_local := false

var _body: ColorRect
var _ear_left: ColorRect
var _ear_right: ColorRect
var _name_label: Label
var _tag_label: Label

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	size = AVATAR_SIZE
	custom_minimum_size = AVATAR_SIZE

func _ready() -> void:
	_build_visual()
	_apply_visuals()

func configure(player_name: String, is_local_player: bool) -> void:
	_player_name = player_name
	_is_local = is_local_player

	if is_inside_tree():
		_apply_visuals()

func _build_visual() -> void:
	if _body != null:
		return

	var shadow = ColorRect.new()
	shadow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	shadow.position = Vector2(28, 50)
	shadow.size = Vector2(40, 8)
	shadow.color = Color(0, 0, 0, 0.18)
	add_child(shadow)

	_ear_left = ColorRect.new()
	_ear_left.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ear_left.position = Vector2(24, 22)
	_ear_left.size = Vector2(12, 16)
	add_child(_ear_left)

	_ear_right = ColorRect.new()
	_ear_right.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ear_right.position = Vector2(60, 22)
	_ear_right.size = Vector2(12, 16)
	add_child(_ear_right)

	_body = ColorRect.new()
	_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_body.position = Vector2(24, 34)
	_body.size = Vector2(48, 24)
	add_child(_body)

	_tag_label = Label.new()
	_tag_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tag_label.position = Vector2(0, 0)
	_tag_label.size = Vector2(AVATAR_SIZE.x, 18)
	_tag_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_tag_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_tag_label.add_theme_font_size_override("font_size", 11)
	add_child(_tag_label)

	_name_label = Label.new()
	_name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_name_label.position = Vector2(0, 58)
	_name_label.size = Vector2(AVATAR_SIZE.x, 18)
	_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	add_child(_name_label)

func _apply_visuals() -> void:
	if _body == null:
		return

	var body_color = REMOTE_BODY_COLOR
	var accent_color = REMOTE_ACCENT_COLOR

	if _is_local:
		body_color = LOCAL_BODY_COLOR
		accent_color = LOCAL_ACCENT_COLOR

	_body.color = body_color
	_ear_left.color = accent_color
	_ear_right.color = accent_color
	_name_label.text = _player_name
	_tag_label.text = "YOU" if _is_local else "CAT"
