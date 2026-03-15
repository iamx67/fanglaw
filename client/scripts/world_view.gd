class_name WorldView
extends Control

@onready var world_layer: Control = $WorldLayer

func _ready() -> void:
	world_layer.focus_mode = Control.FOCUS_ALL

func grab_world_focus() -> void:
	world_layer.grab_focus()
