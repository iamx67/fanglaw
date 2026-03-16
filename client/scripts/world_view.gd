@tool
class_name WorldView
extends Node2D

@export var camera_follow_speed := 10.0

const WorldConfig = preload("res://scripts/world_config.gd")

@onready var backgrounds_layer: Node2D = $Backgrounds
@onready var map_layer: Node2D = $Map
@onready var bounds_layer: Node2D = $Bounds
@onready var props_layer: Node2D = $Props
@onready var npc_layer: Node2D = $NPCs
@onready var players_layer: Node2D = $Players
@onready var spawn_points_layer: Node2D = $SpawnPoints
@onready var world_camera: Camera2D = $Camera2D

func _ready() -> void:
	world_camera.enabled = true
	world_camera.position_smoothing_enabled = true
	world_camera.position_smoothing_speed = camera_follow_speed
	world_camera.limit_left = WorldConfig.camera_limit_left()
	world_camera.limit_top = WorldConfig.camera_limit_top()
	world_camera.limit_right = WorldConfig.camera_limit_right()
	world_camera.limit_bottom = WorldConfig.camera_limit_bottom()
	world_camera.make_current()

func grab_world_focus() -> void:
	pass

func set_camera_target(world_position: Vector2, snap_to_target := false) -> void:
	world_camera.global_position = world_position

	if snap_to_target:
		world_camera.reset_smoothing()

func reset_camera() -> void:
	world_camera.global_position = Vector2.ZERO
	world_camera.reset_smoothing()
