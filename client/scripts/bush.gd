@tool
class_name Bush
extends Node2D

@export var bush_texture: Texture2D:
	set(value):
		bush_texture = value
		_apply_visual()

@export var editor_preview_only := false

@export_range(-1024.0, 1024.0, 1.0) var visual_offset_y := 0.0:
	set(value):
		visual_offset_y = value
		_apply_visual()

@onready var sprite: Sprite2D = $Sprite2D

func _ready() -> void:
	if editor_preview_only and not Engine.is_editor_hint():
		queue_free()
		return

	_apply_visual()

func _apply_visual() -> void:
	if sprite == null:
		return

	sprite.texture = bush_texture
	sprite.centered = true

	if bush_texture == null:
		sprite.position = Vector2.ZERO
		return

	var texture_size := bush_texture.get_size()
	sprite.position = Vector2(0.0, -texture_size.y * 0.5 + visual_offset_y)
