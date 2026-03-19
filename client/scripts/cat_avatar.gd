@tool
class_name PlayerAvatar
extends Node2D

const WorldConfig = preload("res://scripts/world_config.gd")
const DEFAULT_TINT := Color(1, 1, 1, 1)
const DEFAULT_APPEARANCE_JSON := "{\"body\":{\"base_id\":\"bodybase\",\"shadow_id\":\"bodybaseshadow\",\"contour_id\":\"bodybaseco\",\"color\":\"#f7f2ec\"},\"eyes\":{\"base_id\":\"eyeswhite\",\"color\":\"#8fa1ad\"},\"nose\":{\"mask_id\":\"pattern12nose\",\"color\":\"#d7b6ad\"},\"ears\":{\"id\":\"ears1\",\"contour_id\":\"ears1co\",\"color\":\"#f7f2ec\"},\"tail\":{\"id\":\"tails1\",\"shadow_id\":\"tails1shadow\",\"contour_id\":\"tails1co\",\"color\":\"#f7f2ec\"},\"mane\":null,\"cheeks\":null,\"body_pattern_layers\":[],\"tail_pattern_layers\":[]}"

const BODY_BASE_TEXTURES := {
	"bodybase": preload("res://assets/characters/body/base/bodybase.png"),
}
const BODY_SHADOW_TEXTURES := {
	"bodybaseshadow": preload("res://assets/characters/body/shadows/bodybaseshadow.png"),
}
const BODY_CONTOUR_TEXTURES := {
	"bodybaseco": preload("res://assets/characters/body/contours/bodybaseco.png"),
}
const EARS_BASE_TEXTURES := {
	"ears1": preload("res://assets/characters/ears/ears1.png"),
	"ears2": preload("res://assets/characters/ears/ears2.png"),
	"ears3": preload("res://assets/characters/ears/ears3.png"),
}
const EARS_CONTOUR_TEXTURES := {
	"ears1co": preload("res://assets/characters/ears/contours/ears1co.png"),
	"ears2co": preload("res://assets/characters/ears/contours/ears2co.png"),
	"ears3co": preload("res://assets/characters/ears/contours/ears3co.png"),
}
const TAIL_BASE_TEXTURES := {
	"tails1": preload("res://assets/characters/tails/base/tails1.png"),
	"tails2": preload("res://assets/characters/tails/base/tails2.png"),
	"tails3": preload("res://assets/characters/tails/base/tails3.png"),
}
const TAIL_SHADOW_TEXTURES := {
	"tails1shadow": preload("res://assets/characters/tails/shadows/tails1shadow.png"),
	"tails2shadow": preload("res://assets/characters/tails/shadows/tails2shadow.png"),
	"tails3shadow": preload("res://assets/characters/tails/shadows/tails3shadow.png"),
}
const TAIL_CONTOUR_TEXTURES := {
	"tails1co": preload("res://assets/characters/tails/contours/tails1co.png"),
	"tails2co": preload("res://assets/characters/tails/contours/tails2co.png"),
	"tails3co": preload("res://assets/characters/tails/contours/tails3co.png"),
}
const MANE_BASE_TEXTURES := {
	"manes1": preload("res://assets/characters/manes/manes1.png"),
}
const MANE_CONTOUR_TEXTURES := {
	"manes1co": preload("res://assets/characters/manes/contours/manes1co.png"),
}
const CHEEKS_TEXTURES := {
	"cheeks1": preload("res://assets/characters/cheeks/cheeks1.png"),
	"cheeks2": preload("res://assets/characters/cheeks/cheeks2.png"),
}
const BODY_PATTERN_TEXTURES := {
	"pattern1": preload("res://assets/characters/patterns/body/pattern1.png"),
	"pattern2": preload("res://assets/characters/patterns/body/pattern2.png"),
	"pattern3": preload("res://assets/characters/patterns/body/pattern3.png"),
	"pattern4": preload("res://assets/characters/patterns/body/pattern4.png"),
	"pattern5": preload("res://assets/characters/patterns/body/pattern5.png"),
	"pattern6": preload("res://assets/characters/patterns/body/pattern6.png"),
	"pattern7": preload("res://assets/characters/patterns/body/pattern7.png"),
	"pattern8": preload("res://assets/characters/patterns/body/pattern8.png"),
	"pattern9": preload("res://assets/characters/patterns/body/pattern9.png"),
	"pattern10": preload("res://assets/characters/patterns/body/pattern10.png"),
	"pattern11": preload("res://assets/characters/patterns/body/pattern11.png"),
	"pattern13": preload("res://assets/characters/patterns/body/pattern13.png"),
	"pattern14": preload("res://assets/characters/patterns/body/pattern14.png"),
	"pattern15": preload("res://assets/characters/patterns/body/pattern15.png"),
	"pattern16": preload("res://assets/characters/patterns/body/pattern16.png"),
	"pattern17": preload("res://assets/characters/patterns/body/pattern17.png"),
	"pattern18": preload("res://assets/characters/patterns/body/pattern18.png"),
	"pattern19": preload("res://assets/characters/patterns/body/pattern19.png"),
	"pattern20": preload("res://assets/characters/patterns/body/pattern20.png"),
	"pattern21": preload("res://assets/characters/patterns/body/pattern21.png"),
	"pattern22": preload("res://assets/characters/patterns/body/pattern22.png"),
	"pattern23": preload("res://assets/characters/patterns/body/pattern23.png"),
}
const TAIL_PATTERN_TEXTURES := {
	"patterntail1_1": preload("res://assets/characters/patterns/tail/patterntail1_1.png"),
	"patterntail1_2": preload("res://assets/characters/patterns/tail/patterntail1_2.png"),
	"patterntail1_3": preload("res://assets/characters/patterns/tail/patterntail1_3.png"),
	"patterntail2_1": preload("res://assets/characters/patterns/tail/patterntail2_1.png"),
	"patterntail2_2": preload("res://assets/characters/patterns/tail/patterntail2_2.png"),
	"patterntail2_3": preload("res://assets/characters/patterns/tail/patterntail2_3.png"),
	"patterntail3_1": preload("res://assets/characters/patterns/tail/patterntail3_1.png"),
	"patterntail3_2": preload("res://assets/characters/patterns/tail/patterntail3_2.png"),
	"patterntail3_3": preload("res://assets/characters/patterns/tail/patterntail3_3.png"),
}
const EYES_BASE_TEXTURES := {
	"eyeswhite": preload("res://assets/characters/patterns/body/eyeswhite.png"),
}
const NOSE_MASK_TEXTURES := {
	"pattern12nose": preload("res://assets/characters/patterns/body/pattern12nose.png"),
}

@export var editor_preview_only := false
@export var editor_preview_name := "Player"
@export var editor_preview_as_local := true
@export_multiline var editor_preview_appearance_json := ""
@export_range(0.5, 1.2, 0.01) var fit_to_cell_ratio := 1.05

var _appearance_json := ""
var _appearance: Dictionary = {}
var _player_name := "Cat"
var _is_local := false
var _is_moving := false
var _facing := "right"
var _base_character_scale := Vector2.ONE
var _base_character_offset := Vector2.ZERO

@onready var _character_root: Node2D = $CharacterRoot
@onready var _tail_base_sprite: Sprite2D = $CharacterRoot/TailBaseSprite
@onready var _tail_pattern_layer: Node2D = $CharacterRoot/TailPatternLayer
@onready var _tail_shadow_sprite: Sprite2D = $CharacterRoot/TailShadowSprite
@onready var _tail_contour_sprite: Sprite2D = $CharacterRoot/TailContourSprite
@onready var _body_base_sprite: Sprite2D = $CharacterRoot/BodyBaseSprite
@onready var _body_pattern_layer: Node2D = $CharacterRoot/BodyPatternLayer
@onready var _eyes_base_sprite: Sprite2D = $CharacterRoot/EyesBaseSprite
@onready var _nose_sprite: Sprite2D = $CharacterRoot/NoseSprite
@onready var _body_shadow_sprite: Sprite2D = $CharacterRoot/BodyShadowSprite
@onready var _body_contour_sprite: Sprite2D = $CharacterRoot/BodyContourSprite
@onready var _cheeks_sprite: Sprite2D = $CharacterRoot/CheeksSprite
@onready var _mane_base_sprite: Sprite2D = $CharacterRoot/ManeBaseSprite
@onready var _mane_contour_sprite: Sprite2D = $CharacterRoot/ManeContourSprite
@onready var _ears_base_sprite: Sprite2D = $CharacterRoot/EarsBaseSprite
@onready var _ears_contour_sprite: Sprite2D = $CharacterRoot/EarsContourSprite
@onready var _name_label: Label = $NameLabel
@onready var _tag_label: Label = $TagLabel

func _ready() -> void:
	if editor_preview_only and not Engine.is_editor_hint():
		queue_free()
		return

	if Engine.is_editor_hint():
		set_process(true)

	if _appearance.is_empty():
		_apply_default_preview()
	else:
		_apply_appearance_layers()

	_apply_visuals()

func _process(_delta: float) -> void:
	if not Engine.is_editor_hint():
		return

	if editor_preview_appearance_json.strip_edges().is_empty():
		if _appearance_json != DEFAULT_APPEARANCE_JSON:
			_apply_default_preview()
	else:
		var normalized = editor_preview_appearance_json.strip_edges()
		if normalized != _appearance_json:
			apply_appearance_json(normalized)

	_apply_visuals()

func configure(player_name: String, is_local_player: bool) -> void:
	_player_name = player_name
	_is_local = is_local_player
	_apply_visuals()

func set_moving(is_moving: bool) -> void:
	_is_moving = is_moving
	_apply_visuals()

func set_facing(facing: String) -> void:
	var normalized = "left" if facing == "left" else "right"
	if _facing == normalized:
		return

	_facing = normalized
	_apply_visuals()

func get_facing() -> String:
	return _facing

func get_display_name() -> String:
	return _player_name

func apply_appearance_json(appearance_json: String) -> void:
	var normalized = appearance_json.strip_edges()
	if normalized.is_empty():
		normalized = DEFAULT_APPEARANCE_JSON

	var parsed = JSON.parse_string(normalized)
	if parsed == null or typeof(parsed) != TYPE_DICTIONARY:
		normalized = DEFAULT_APPEARANCE_JSON
		parsed = JSON.parse_string(normalized)

	_appearance_json = normalized
	_appearance = _normalize_appearance(parsed)
	if is_inside_tree():
		_apply_appearance_layers()
		_apply_visuals()

func apply_appearance(appearance: Dictionary) -> void:
	_appearance = _normalize_appearance(appearance)
	_appearance_json = JSON.stringify(_appearance)
	if is_inside_tree():
		_apply_appearance_layers()
		_apply_visuals()

func _apply_default_preview() -> void:
	apply_appearance_json(editor_preview_appearance_json if not editor_preview_appearance_json.strip_edges().is_empty() else DEFAULT_APPEARANCE_JSON)

func _apply_visuals() -> void:
	if _character_root == null:
		return

	var display_name = _player_name
	var display_is_local = _is_local

	if Engine.is_editor_hint() and editor_preview_only:
		display_name = editor_preview_name
		display_is_local = editor_preview_as_local

	_character_root.modulate = DEFAULT_TINT
	_character_root.position = _base_character_offset
	_character_root.scale = Vector2(
		_base_character_scale.x if _facing == "right" else -_base_character_scale.x,
		_base_character_scale.y
	)
	if _name_label != null:
		_name_label.text = display_name
	if _tag_label != null:
		_tag_label.text = "YOU" if display_is_local else ""

func _apply_appearance_layers() -> void:
	if _character_root == null:
		return
	if _tail_base_sprite == null or _tail_pattern_layer == null or _tail_shadow_sprite == null:
		return
	if _tail_contour_sprite == null or _body_base_sprite == null or _body_pattern_layer == null:
		return
	if _eyes_base_sprite == null or _nose_sprite == null or _body_shadow_sprite == null:
		return
	if _body_contour_sprite == null or _cheeks_sprite == null or _mane_base_sprite == null:
		return
	if _mane_contour_sprite == null or _ears_base_sprite == null or _ears_contour_sprite == null:
		return

	var body = _dictionary_or_empty(_appearance.get("body"))
	var eyes = _dictionary_or_empty(_appearance.get("eyes"))
	var nose = _dictionary_or_empty(_appearance.get("nose"))
	var ears = _dictionary_or_empty(_appearance.get("ears"))
	var tail = _dictionary_or_empty(_appearance.get("tail"))
	var mane = _dictionary_or_empty(_appearance.get("mane"))
	var cheeks = _dictionary_or_empty(_appearance.get("cheeks"))

	_set_tinted_sprite(_tail_base_sprite, _texture_from_dictionary(TAIL_BASE_TEXTURES, _string_or_default(tail.get("id"), "tails1")), _color_from_value(tail.get("color"), DEFAULT_TINT))
	_rebuild_pattern_layer(_tail_pattern_layer, _array_or_empty(_appearance.get("tail_pattern_layers")), TAIL_PATTERN_TEXTURES)
	_set_plain_sprite(_tail_shadow_sprite, _texture_from_dictionary(TAIL_SHADOW_TEXTURES, _string_or_default(tail.get("shadow_id"), "tails1shadow")))
	_set_plain_sprite(_tail_contour_sprite, _texture_from_dictionary(TAIL_CONTOUR_TEXTURES, _string_or_default(tail.get("contour_id"), "tails1co")))

	_set_tinted_sprite(_body_base_sprite, _texture_from_dictionary(BODY_BASE_TEXTURES, _string_or_default(body.get("base_id"), "bodybase")), _color_from_value(body.get("color"), DEFAULT_TINT))
	_rebuild_pattern_layer(_body_pattern_layer, _array_or_empty(_appearance.get("body_pattern_layers")), BODY_PATTERN_TEXTURES)
	_set_tinted_sprite(_eyes_base_sprite, _texture_from_dictionary(EYES_BASE_TEXTURES, _string_or_default(eyes.get("base_id"), "eyeswhite")), _color_from_value(eyes.get("color"), DEFAULT_TINT))
	_set_tinted_sprite(_nose_sprite, _texture_from_dictionary(NOSE_MASK_TEXTURES, _string_or_default(nose.get("mask_id"), "pattern12nose")), _color_from_value(nose.get("color"), DEFAULT_TINT))
	_set_plain_sprite(_body_shadow_sprite, _texture_from_dictionary(BODY_SHADOW_TEXTURES, _string_or_default(body.get("shadow_id"), "bodybaseshadow")))
	_set_plain_sprite(_body_contour_sprite, _texture_from_dictionary(BODY_CONTOUR_TEXTURES, _string_or_default(body.get("contour_id"), "bodybaseco")))
	_set_plain_sprite(_cheeks_sprite, _texture_from_dictionary(CHEEKS_TEXTURES, _string_or_default(cheeks.get("id"), "")))

	_set_tinted_sprite(_mane_base_sprite, _texture_from_dictionary(MANE_BASE_TEXTURES, _string_or_default(mane.get("id"), "")), _color_from_value(mane.get("color"), DEFAULT_TINT))
	_set_plain_sprite(_mane_contour_sprite, _texture_from_dictionary(MANE_CONTOUR_TEXTURES, _string_or_default(mane.get("contour_id"), "")))
	_set_tinted_sprite(_ears_base_sprite, _texture_from_dictionary(EARS_BASE_TEXTURES, _string_or_default(ears.get("id"), "ears1")), _color_from_value(ears.get("color"), DEFAULT_TINT))
	_set_plain_sprite(_ears_contour_sprite, _texture_from_dictionary(EARS_CONTOUR_TEXTURES, _string_or_default(ears.get("contour_id"), "ears1co")))
	_update_character_root_fit()

func _rebuild_pattern_layer(layer_root: Node2D, raw_layers: Array, texture_map: Dictionary) -> void:
	for child in layer_root.get_children():
		layer_root.remove_child(child)
		child.queue_free()

	for raw_layer in raw_layers:
		if typeof(raw_layer) != TYPE_DICTIONARY:
			continue

		var layer_data = raw_layer as Dictionary
		var layer_id = _string_or_default(layer_data.get("id"), "")
		var texture = _texture_from_dictionary(texture_map, layer_id)
		if texture == null:
			continue

		var sprite = Sprite2D.new()
		sprite.texture = texture
		sprite.centered = true
		sprite.modulate = _color_from_value(layer_data.get("color"), DEFAULT_TINT)
		sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
		layer_root.add_child(sprite)

func _set_plain_sprite(sprite: Sprite2D, texture: Texture2D) -> void:
	if sprite == null:
		return

	sprite.texture = texture
	sprite.visible = texture != null
	if texture != null:
		sprite.modulate = DEFAULT_TINT

func _set_tinted_sprite(sprite: Sprite2D, texture: Texture2D, tint: Color) -> void:
	if sprite == null:
		return

	sprite.texture = texture
	sprite.visible = texture != null
	if texture != null:
		sprite.modulate = tint

func _update_character_root_fit() -> void:
	var bounds := _calculate_character_bounds()
	if bounds.size.x <= 0.0 or bounds.size.y <= 0.0:
		_base_character_scale = Vector2.ONE
		_base_character_offset = Vector2.ZERO
		return

	var target_cell_size := maxf(float(WorldConfig.cell_size()) * fit_to_cell_ratio, 1.0)
	var scale_factor := minf(target_cell_size / bounds.size.x, target_cell_size / bounds.size.y)
	scale_factor = maxf(scale_factor, 0.001)
	_base_character_scale = Vector2.ONE * scale_factor

	var center_x := bounds.position.x + bounds.size.x * 0.5
	var bottom_y := bounds.position.y + bounds.size.y
	_base_character_offset = Vector2(-center_x * scale_factor, -bottom_y * scale_factor)

func _calculate_character_bounds() -> Rect2:
	var has_bounds := false
	var combined_bounds := Rect2()

	for child in _character_root.get_children():
		var child_bounds = _collect_sprite_bounds(child, Transform2D.IDENTITY)
		if child_bounds.size.x <= 0.0 or child_bounds.size.y <= 0.0:
			continue

		if not has_bounds:
			combined_bounds = child_bounds
			has_bounds = true
		else:
			combined_bounds = combined_bounds.merge(child_bounds)

	return combined_bounds if has_bounds else Rect2()

func _collect_sprite_bounds(node: Node, parent_transform: Transform2D) -> Rect2:
	if not (node is Node2D):
		return Rect2()

	var node_2d := node as Node2D
	var current_transform := parent_transform * node_2d.transform
	var has_bounds := false
	var combined_bounds := Rect2()

	if node_2d is Sprite2D:
		var sprite := node_2d as Sprite2D
		if sprite.visible and sprite.texture != null:
			combined_bounds = _transform_rect(sprite.get_rect(), current_transform)
			has_bounds = true

	for child in node_2d.get_children():
		var child_bounds := _collect_sprite_bounds(child, current_transform)
		if child_bounds.size.x <= 0.0 or child_bounds.size.y <= 0.0:
			continue

		if not has_bounds:
			combined_bounds = child_bounds
			has_bounds = true
		else:
			combined_bounds = combined_bounds.merge(child_bounds)

	return combined_bounds if has_bounds else Rect2()

func _transform_rect(rect: Rect2, transform: Transform2D) -> Rect2:
	var top_left := transform * rect.position
	var top_right := transform * Vector2(rect.position.x + rect.size.x, rect.position.y)
	var bottom_left := transform * Vector2(rect.position.x, rect.position.y + rect.size.y)
	var bottom_right := transform * (rect.position + rect.size)

	var min_x := minf(minf(top_left.x, top_right.x), minf(bottom_left.x, bottom_right.x))
	var max_x := maxf(maxf(top_left.x, top_right.x), maxf(bottom_left.x, bottom_right.x))
	var min_y := minf(minf(top_left.y, top_right.y), minf(bottom_left.y, bottom_right.y))
	var max_y := maxf(maxf(top_left.y, top_right.y), maxf(bottom_left.y, bottom_right.y))

	return Rect2(Vector2(min_x, min_y), Vector2(max_x - min_x, max_y - min_y))

func _texture_from_dictionary(texture_map: Dictionary, texture_id: String) -> Texture2D:
	if texture_id.is_empty() or not texture_map.has(texture_id):
		return null
	return texture_map[texture_id]

func _normalize_appearance(raw: Variant) -> Dictionary:
	var normalized = _default_appearance()
	if typeof(raw) != TYPE_DICTIONARY:
		return normalized

	var raw_dict = raw as Dictionary
	var body = _merge_section(normalized["body"], raw_dict.get("body"))
	var eyes = _merge_section(normalized["eyes"], raw_dict.get("eyes"))
	var nose = _merge_section(normalized["nose"], raw_dict.get("nose"))
	var ears = _merge_section(normalized["ears"], raw_dict.get("ears"))
	var tail = _merge_section(normalized["tail"], raw_dict.get("tail"))

	normalized["body"] = body
	normalized["eyes"] = eyes
	normalized["nose"] = nose
	normalized["ears"] = ears
	normalized["tail"] = tail
	normalized["mane"] = _normalize_optional_section(raw_dict.get("mane"))
	normalized["cheeks"] = _normalize_optional_section(raw_dict.get("cheeks"))
	normalized["body_pattern_layers"] = _normalize_pattern_layers(raw_dict.get("body_pattern_layers"))
	normalized["tail_pattern_layers"] = _normalize_pattern_layers(raw_dict.get("tail_pattern_layers"))
	return normalized

func _default_appearance() -> Dictionary:
	return {
		"body": {
			"base_id": "bodybase",
			"shadow_id": "bodybaseshadow",
			"contour_id": "bodybaseco",
			"color": "#f7f2ec",
		},
		"eyes": {
			"base_id": "eyeswhite",
			"color": "#8fa1ad",
		},
		"nose": {
			"mask_id": "pattern12nose",
			"color": "#d7b6ad",
		},
		"ears": {
			"id": "ears1",
			"contour_id": "ears1co",
			"color": "#f7f2ec",
		},
		"tail": {
			"id": "tails1",
			"shadow_id": "tails1shadow",
			"contour_id": "tails1co",
			"color": "#f7f2ec",
		},
		"mane": null,
		"cheeks": null,
		"body_pattern_layers": [],
		"tail_pattern_layers": [],
	}

func _merge_section(default_section: Variant, raw_section: Variant) -> Dictionary:
	var result = _dictionary_or_empty(default_section).duplicate(true)
	if typeof(raw_section) != TYPE_DICTIONARY:
		return result

	var source = raw_section as Dictionary
	for key in source.keys():
		result[key] = source[key]
	return result

func _normalize_optional_section(raw_section: Variant) -> Variant:
	if raw_section == null or typeof(raw_section) != TYPE_DICTIONARY:
		return null
	return raw_section

func _normalize_pattern_layers(raw_layers: Variant) -> Array:
	if typeof(raw_layers) != TYPE_ARRAY:
		return []

	var normalized: Array = []
	for raw_layer in raw_layers:
		if typeof(raw_layer) != TYPE_DICTIONARY:
			continue

		var layer = raw_layer as Dictionary
		var layer_id = _string_or_default(layer.get("id"), "")
		if layer_id.is_empty():
			continue

		normalized.append({
			"id": layer_id,
			"color": _string_or_default(layer.get("color"), "#ffffff"),
		})
	return normalized

func _dictionary_or_empty(value: Variant) -> Dictionary:
	if typeof(value) == TYPE_DICTIONARY:
		return value as Dictionary
	return {}

func _array_or_empty(value: Variant) -> Array:
	if typeof(value) == TYPE_ARRAY:
		return value as Array
	return []

func _string_or_default(value: Variant, fallback: String) -> String:
	if value is String:
		var text = String(value).strip_edges()
		return text if not text.is_empty() else fallback
	return fallback

func _color_from_value(value: Variant, fallback: Color) -> Color:
	if value is Color:
		return value

	if value is String:
		var text = String(value).strip_edges()
		if not text.is_empty():
			return Color.from_string(text if text.begins_with("#") else "#%s" % text, fallback)

	return fallback
