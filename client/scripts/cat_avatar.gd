@tool
class_name PlayerAvatar
extends Node2D

@export var idle_texture: Texture2D
@export var walk_texture: Texture2D
@export var editor_preview_only := false
@export var editor_preview_name := "Player"
@export var editor_preview_as_local := true
@export var editor_preview_walking := false

var _player_name := "Cat"
var _is_local := false
var _is_moving := false

@onready var _character_root: Node2D = $CharacterRoot
@onready var _sprite: Sprite2D = $CharacterRoot/Sprite2D
@onready var _name_label: Label = $NameLabel
@onready var _tag_label: Label = $TagLabel

func _ready() -> void:
	if editor_preview_only and not Engine.is_editor_hint():
		queue_free()
		return

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

func get_display_name() -> String:
	return _player_name

func _process(_delta: float) -> void:
	if Engine.is_editor_hint():
		_apply_visuals()

func _apply_visuals() -> void:
	var display_name := _player_name
	var display_is_local := _is_local
	var display_is_moving := _is_moving

	if Engine.is_editor_hint() and editor_preview_only:
		display_name = editor_preview_name
		display_is_local = editor_preview_as_local
		display_is_moving = editor_preview_walking

	var active_texture := idle_texture
	if display_is_moving and walk_texture != null:
		active_texture = walk_texture

	_character_root.modulate = Color.WHITE
	_sprite.modulate = Color.WHITE
	if active_texture != null:
		_sprite.texture = active_texture

	_name_label.text = display_name
	_tag_label.text = "YOU" if display_is_local else ""
