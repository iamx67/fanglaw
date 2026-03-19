@tool
class_name PlayerAvatar
extends Node2D

const PATTERN_TEXTURES := {
	"pattern_01": preload("res://assets/characters/patterns/pattern_01.png"),
	"pattern_02": preload("res://assets/characters/patterns/pattern_02.png"),
	"pattern_03": preload("res://assets/characters/patterns/pattern_03.png"),
	"pattern_04": preload("res://assets/characters/patterns/pattern_04.png"),
}

@export var idle_texture: Texture2D
@export var walk_texture: Texture2D
@export var body_texture: Texture2D
@export var eyes_base_texture: Texture2D
@export var eyes_iris_texture: Texture2D
@export var accessory_texture: Texture2D
@export var pattern_01_enabled := true:
	set(value):
		pattern_01_enabled = value
		if is_inside_tree():
			_apply_visuals()
@export var pattern_02_enabled := false:
	set(value):
		pattern_02_enabled = value
		if is_inside_tree():
			_apply_visuals()
@export var pattern_03_enabled := false:
	set(value):
		pattern_03_enabled = value
		if is_inside_tree():
			_apply_visuals()
@export var pattern_04_enabled := false:
	set(value):
		pattern_04_enabled = value
		if is_inside_tree():
			_apply_visuals()
@export_color_no_alpha var fur_color := Color.WHITE:
	set(value):
		fur_color = value
		if is_inside_tree():
			_apply_visuals()
@export_color_no_alpha var pattern_01_color := Color.WHITE:
	set(value):
		pattern_01_color = value
		if is_inside_tree():
			_apply_visuals()
@export_color_no_alpha var pattern_02_color := Color.WHITE:
	set(value):
		pattern_02_color = value
		if is_inside_tree():
			_apply_visuals()
@export_color_no_alpha var pattern_03_color := Color.WHITE:
	set(value):
		pattern_03_color = value
		if is_inside_tree():
			_apply_visuals()
@export_color_no_alpha var pattern_04_color := Color.WHITE:
	set(value):
		pattern_04_color = value
		if is_inside_tree():
			_apply_visuals()
@export_color_no_alpha var eye_color := Color.WHITE:
	set(value):
		eye_color = value
		if is_inside_tree():
			_apply_visuals()
@export var editor_preview_only := false
@export var editor_preview_name := "Player"
@export var editor_preview_as_local := true
@export var editor_preview_walking := false

var _player_name := "Cat"
var _is_local := false
var _is_moving := false
var _facing := "right"
var _base_character_scale := Vector2.ONE

@onready var _character_root: Node2D = $CharacterRoot
@onready var _body_sprite: Sprite2D = $CharacterRoot/BodySprite
@onready var _pattern_sprite_01: Sprite2D = $CharacterRoot/PatternSprite01
@onready var _pattern_sprite_02: Sprite2D = $CharacterRoot/PatternSprite02
@onready var _pattern_sprite_03: Sprite2D = $CharacterRoot/PatternSprite03
@onready var _pattern_sprite_04: Sprite2D = $CharacterRoot/PatternSprite04
@onready var _eyes_base_sprite: Sprite2D = $CharacterRoot/EyesBaseSprite
@onready var _eyes_iris_sprite: Sprite2D = $CharacterRoot/EyesIrisSprite
@onready var _accessory_sprite: Sprite2D = $CharacterRoot/AccessorySprite
@onready var _name_label: Label = $NameLabel
@onready var _tag_label: Label = $TagLabel

func _ready() -> void:
	if editor_preview_only and not Engine.is_editor_hint():
		queue_free()
		return

	_base_character_scale = Vector2(absf(_character_root.scale.x), _character_root.scale.y)
	set_process(Engine.is_editor_hint())
	_apply_visuals()

func configure(player_name: String, is_local_player: bool) -> void:
	_player_name = player_name
	_is_local = is_local_player

	if is_inside_tree():
		_apply_visuals()

func set_moving(is_moving: bool) -> void:
	if _is_moving == is_moving:
		return

	_is_moving = is_moving
	if is_inside_tree():
		_apply_visuals()

func set_facing(facing: String) -> void:
	var normalized := "left" if facing == "left" else "right"
	if _facing == normalized:
		return

	_facing = normalized
	if is_inside_tree():
		_apply_visuals()

func get_facing() -> String:
	return _facing

func get_display_name() -> String:
	return _player_name

func _process(_delta: float) -> void:
	if Engine.is_editor_hint():
		_apply_visuals()

func apply_appearance(appearance: Dictionary) -> void:
	if appearance.has("body_texture") and appearance["body_texture"] is Texture2D:
		body_texture = appearance["body_texture"]
	if appearance.has("eyes_base_texture") and appearance["eyes_base_texture"] is Texture2D:
		eyes_base_texture = appearance["eyes_base_texture"]
	if appearance.has("eyes_iris_texture") and appearance["eyes_iris_texture"] is Texture2D:
		eyes_iris_texture = appearance["eyes_iris_texture"]
	if appearance.has("accessory_texture") and appearance["accessory_texture"] is Texture2D:
		accessory_texture = appearance["accessory_texture"]
	if appearance.has("pattern_ids") and appearance["pattern_ids"] is Array:
		_apply_pattern_ids(_normalize_pattern_ids(appearance["pattern_ids"]))
	elif appearance.has("pattern_id") and appearance["pattern_id"] is String:
		_apply_pattern_ids([appearance["pattern_id"]])
	if appearance.has("pattern_01_enabled"):
		pattern_01_enabled = bool(appearance["pattern_01_enabled"])
	if appearance.has("pattern_02_enabled"):
		pattern_02_enabled = bool(appearance["pattern_02_enabled"])
	if appearance.has("pattern_03_enabled"):
		pattern_03_enabled = bool(appearance["pattern_03_enabled"])
	if appearance.has("pattern_04_enabled"):
		pattern_04_enabled = bool(appearance["pattern_04_enabled"])
	if appearance.has("fur_color"):
		fur_color = _coerce_color(appearance["fur_color"], fur_color)
	if appearance.has("pattern_01_color"):
		pattern_01_color = _coerce_color(appearance["pattern_01_color"], pattern_01_color)
	if appearance.has("pattern_02_color"):
		pattern_02_color = _coerce_color(appearance["pattern_02_color"], pattern_02_color)
	if appearance.has("pattern_03_color"):
		pattern_03_color = _coerce_color(appearance["pattern_03_color"], pattern_03_color)
	if appearance.has("pattern_04_color"):
		pattern_04_color = _coerce_color(appearance["pattern_04_color"], pattern_04_color)
	if appearance.has("pattern_color"):
		var legacy_pattern_color := _coerce_color(appearance["pattern_color"], Color.WHITE)
		pattern_01_color = legacy_pattern_color
		pattern_02_color = legacy_pattern_color
		pattern_03_color = legacy_pattern_color
		pattern_04_color = legacy_pattern_color
	if appearance.has("eye_color"):
		eye_color = _coerce_color(appearance["eye_color"], eye_color)

	if is_inside_tree():
		_apply_visuals()

func _apply_pattern_ids(pattern_ids: Array[String]) -> void:
	pattern_01_enabled = pattern_ids.has("pattern_01")
	pattern_02_enabled = pattern_ids.has("pattern_02")
	pattern_03_enabled = pattern_ids.has("pattern_03")
	pattern_04_enabled = pattern_ids.has("pattern_04")

func _apply_visuals() -> void:
	var display_name := _player_name
	var display_is_local := _is_local
	var display_is_moving := _is_moving

	if Engine.is_editor_hint() and editor_preview_only:
		display_name = editor_preview_name
		display_is_local = editor_preview_as_local
		display_is_moving = editor_preview_walking

	var active_body_texture := body_texture
	if display_is_moving and walk_texture != null:
		active_body_texture = walk_texture
	elif not display_is_moving and idle_texture != null:
		active_body_texture = idle_texture

	var resolved_fur_color := _coerce_color(fur_color, Color.WHITE)
	var resolved_pattern_01_color := _coerce_color(pattern_01_color, Color.WHITE)
	var resolved_pattern_02_color := _coerce_color(pattern_02_color, Color.WHITE)
	var resolved_pattern_03_color := _coerce_color(pattern_03_color, Color.WHITE)
	var resolved_pattern_04_color := _coerce_color(pattern_04_color, Color.WHITE)
	var resolved_eye_color := _coerce_color(eye_color, Color.WHITE)

	_character_root.modulate = Color.WHITE
	_character_root.scale = Vector2(
		-_base_character_scale.x if _facing == "right" else _base_character_scale.x,
		_base_character_scale.y
	)
	_apply_sprite(_body_sprite, active_body_texture, resolved_fur_color)
	_apply_pattern_sprite(_pattern_sprite_01, PATTERN_TEXTURES["pattern_01"], pattern_01_enabled, resolved_pattern_01_color)
	_apply_pattern_sprite(_pattern_sprite_02, PATTERN_TEXTURES["pattern_02"], pattern_02_enabled, resolved_pattern_02_color)
	_apply_pattern_sprite(_pattern_sprite_03, PATTERN_TEXTURES["pattern_03"], pattern_03_enabled, resolved_pattern_03_color)
	_apply_pattern_sprite(_pattern_sprite_04, PATTERN_TEXTURES["pattern_04"], pattern_04_enabled, resolved_pattern_04_color)
	_apply_sprite(_eyes_base_sprite, eyes_base_texture, Color.WHITE)
	_apply_sprite(_eyes_iris_sprite, eyes_iris_texture, resolved_eye_color)
	_apply_sprite(_accessory_sprite, accessory_texture, Color.WHITE)

	_name_label.text = display_name
	_tag_label.text = "YOU" if display_is_local else ""

func _apply_sprite(sprite: Sprite2D, texture: Texture2D, tint: Variant) -> void:
	if sprite == null:
		return

	sprite.texture = texture
	sprite.visible = texture != null
	if texture != null:
		sprite.modulate = _coerce_color(tint, Color.WHITE)

func _apply_pattern_sprite(sprite: Sprite2D, texture: Texture2D, enabled: bool, tint: Variant) -> void:
	if sprite == null:
		return

	sprite.texture = texture
	sprite.visible = enabled and texture != null
	if enabled and texture != null:
		sprite.modulate = _coerce_color(tint, Color.WHITE)

func _normalize_pattern_ids(raw_pattern_ids: Array) -> Array[String]:
	var normalized: Array[String] = []
	for entry in raw_pattern_ids:
		if entry is String and PATTERN_TEXTURES.has(entry):
			normalized.append(entry)
	return normalized

func _coerce_color(value: Variant, fallback: Color) -> Color:
	if value is Color:
		return value

	if value is String and not String(value).is_empty():
		var text := String(value)
		if text.begins_with("#"):
			return Color.from_string(text, fallback)
		return Color.from_string("#%s" % text, fallback)

	return fallback
