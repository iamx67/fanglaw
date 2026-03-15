class_name StartScreen
extends Control

signal enter_requested
signal name_changed(new_text: String)

@onready var name_input: LineEdit = $LoginCenter/LoginPanel/LoginMargin/LoginVBox/JoinRow/NameInput
@onready var enter_world_button: Button = $LoginCenter/LoginPanel/LoginMargin/LoginVBox/JoinRow/EnterWorldButton
@onready var status_label: Label = $LoginCenter/LoginPanel/LoginMargin/LoginVBox/StatusLabel
@onready var help_label: Label = $LoginCenter/LoginPanel/LoginMargin/LoginVBox/HelpLabel
@onready var debug_label: Label = $LoginCenter/LoginPanel/LoginMargin/LoginVBox/DebugLabel

func _ready() -> void:
	enter_world_button.pressed.connect(_emit_enter_requested)
	name_input.text_submitted.connect(_on_name_submitted)
	name_input.text_changed.connect(_on_name_changed)

func release_form_focus() -> void:
	name_input.release_focus()
	enter_world_button.release_focus()

func _emit_enter_requested() -> void:
	enter_requested.emit()

func _on_name_submitted(_text: String) -> void:
	enter_requested.emit()

func _on_name_changed(new_text: String) -> void:
	name_changed.emit(new_text)
