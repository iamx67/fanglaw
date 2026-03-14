extends Control

const colyseus = preload("res://addons/godot_colyseus/lib/colyseus.gd")
const CatAvatar = preload("res://scripts/cat_avatar.gd")

const SERVER_ENDPOINT := "ws://localhost:2567"
const ROOM_NAME := "cats"
const MOVE_SPEED := 180.0
const PING_INTERVAL := 2.0

class Player extends colyseus.Schema:
	static func define_fields():
		return [
			colyseus.Field.new("id", colyseus.STRING),
			colyseus.Field.new("name", colyseus.STRING),
			colyseus.Field.new("x", colyseus.NUMBER),
			colyseus.Field.new("y", colyseus.NUMBER),
		]

class RoomState extends colyseus.Schema:
	static func define_fields():
		return [
			colyseus.Field.new("players", colyseus.MAP, Player),
		]

@onready var name_input: LineEdit = $RootMargin/RootVBox/HudPanel/HudMargin/HudVBox/JoinRow/NameInput
@onready var enter_world_button: Button = $RootMargin/RootVBox/HudPanel/HudMargin/HudVBox/JoinRow/EnterWorldButton
@onready var status_label: Label = $RootMargin/RootVBox/HudPanel/HudMargin/HudVBox/StatusLabel
@onready var help_label: Label = $RootMargin/RootVBox/HudPanel/HudMargin/HudVBox/HelpLabel
@onready var world_layer: Control = $RootMargin/RootVBox/WorldPanel/WorldLayer

var client = null
var room: colyseus.Room = null
var local_session_id := ""
var local_position := Vector2.ZERO
var avatars: Dictionary = {}
var is_connecting := false
var ping_elapsed := 0.0
var last_pong_text := "waiting"

func _ready() -> void:
	enter_world_button.pressed.connect(_on_enter_world_pressed)
	name_input.text_submitted.connect(_on_name_submitted)
	world_layer.resized.connect(_refresh_all_avatar_positions)
	world_layer.focus_mode = Control.FOCUS_ALL

	_set_status("Offline. Start the server in the server folder, then enter the world.")

func _physics_process(delta: float) -> void:
	if room == null or not room.has_joined():
		return

	ping_elapsed += delta
	if ping_elapsed >= PING_INTERVAL:
		ping_elapsed = 0.0
		room.send("ping")

	var direction := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if direction == Vector2.ZERO:
		return

	local_position += direction.normalized() * MOVE_SPEED * delta
	room.send("move", {
		"x": local_position.x,
		"y": local_position.y,
	})

	_refresh_avatar_position(local_session_id, local_position)

func _on_name_submitted(_text: String) -> void:
	await _on_enter_world_pressed()

func _on_enter_world_pressed() -> void:
	if is_connecting or room != null:
		return

	await _connect_to_world()

func _connect_to_world() -> void:
	is_connecting = true
	enter_world_button.disabled = true
	enter_world_button.text = "Connecting..."

	var player_name := _sanitize_name(name_input.text)
	name_input.text = player_name

	_set_status("Connecting to %s ..." % SERVER_ENDPOINT)

	client = colyseus.Client.new(SERVER_ENDPOINT)
	var promise = client.join_or_create(RoomState, ROOM_NAME, {
		"name": player_name,
	})

	await promise.completed

	is_connecting = false

	if promise.get_state() == promise.State.Failed:
		enter_world_button.disabled = false
		enter_world_button.text = "Enter World"
		_set_status("Connect failed: %s" % str(promise.get_error()))
		return

	room = promise.get_data()
	local_session_id = room.session_id
	local_position = Vector2.ZERO
	ping_elapsed = 0.0
	last_pong_text = "connected"

	_bind_room_events()

	name_input.editable = false
	name_input.release_focus()
	enter_world_button.release_focus()
	world_layer.grab_focus()
	enter_world_button.text = "In World"
	_update_connected_status()

func _bind_room_events() -> void:
	var state = room.get_state()

	room.on_error.on(Callable(self, "_on_room_error"))
	room.on_leave.on(Callable(self, "_on_room_leave"))
	room.on_state_change.on(Callable(self, "_on_state_change"))
	room.on_message("pong").on(Callable(self, "_on_pong"))

	state.listen("players:add").on(Callable(self, "_on_player_added"))
	state.listen("players:remove").on(Callable(self, "_on_player_removed"))
	state.listen("players:clear").on(Callable(self, "_on_players_cleared"))
	_sync_all_players()

func _on_room_error(code: int, message: String) -> void:
	_set_status("Room error %d: %s" % [code, message])

func _on_room_leave() -> void:
	_clear_world()
	room = null
	local_session_id = ""
	local_position = Vector2.ZERO
	name_input.editable = true
	enter_world_button.disabled = false
	enter_world_button.text = "Enter World"
	last_pong_text = "disconnected"
	_set_status("Disconnected from room.")

func _on_state_change(_state) -> void:
	_sync_all_players()
	_update_connected_status()

func _on_pong(data: Dictionary) -> void:
	last_pong_text = "pong %s" % str(data.get("serverTime", "ok"))
	_update_connected_status()

func _on_player_added(_target, player: Player, session_id: String) -> void:
	_register_player(session_id, player)
	_update_connected_status()

func _on_player_removed(_target, _player: Player, session_id: String) -> void:
	_remove_avatar(session_id)
	_update_connected_status()

func _on_players_cleared(_target) -> void:
	_clear_world()
	_update_connected_status()

func _on_player_changed(player: Player, session_id: String) -> void:
	_register_player(session_id, player)

func _on_player_deleted(_player: Player, session_id: String) -> void:
	_remove_avatar(session_id)
	_update_connected_status()

func _sync_all_players() -> void:
	if room == null:
		return

	var state = room.get_state()
	var players = _get_players_map(state)
	if players == null:
		return

	for session_id in players.keys():
		var player = players.at(session_id)
		_register_player(session_id, player)

func _register_player(session_id: String, player: Player) -> void:
	if player == null:
		return

	var avatar = avatars.get(session_id)
	if avatar == null:
		avatar = CatAvatar.new()
		avatar.name = "CatAvatar_%s" % session_id
		world_layer.add_child(avatar)
		avatars[session_id] = avatar

		player.listen(":change").on(Callable(self, "_on_player_changed"), [session_id])
		player.listen(":delete").on(Callable(self, "_on_player_deleted"), [session_id])

	avatar.configure(_display_player_name(player), session_id == local_session_id)

	var position := Vector2(player.x, player.y)
	_refresh_avatar_position(session_id, position)

	if session_id == local_session_id:
		local_position = position

func _refresh_avatar_position(session_id: String, world_position: Vector2) -> void:
	var avatar = avatars.get(session_id)
	if avatar == null:
		return

	avatar.position = _world_to_screen(world_position) - (CatAvatar.AVATAR_SIZE * 0.5)

func _refresh_all_avatar_positions() -> void:
	if room == null:
		return

	var state = room.get_state()
	var players = _get_players_map(state)
	if players == null:
		return

	for session_id in players.keys():
		var player = players.at(session_id)
		if player != null:
			_refresh_avatar_position(session_id, Vector2(player.x, player.y))

func _remove_avatar(session_id: String) -> void:
	var avatar = avatars.get(session_id)
	if avatar == null:
		return

	avatars.erase(session_id)
	avatar.queue_free()

func _clear_world() -> void:
	for session_id in avatars.keys():
		var avatar = avatars[session_id]
		if avatar != null:
			avatar.queue_free()

	avatars.clear()

func _update_connected_status() -> void:
	if room == null:
		return

	var player_count := 0
	var state = room.get_state()
	var players = _get_players_map(state)
	if players != null:
		player_count = players.size()

	_set_status(
		"Connected to %s as %s | players: %d | %s" % [
			ROOM_NAME,
			name_input.text,
			player_count,
			last_pong_text,
		]
	)

func _display_player_name(player: Player) -> String:
	var player_name = str(player.name).strip_edges()
	if player_name.is_empty():
		return "Cat"
	return player_name

func _sanitize_name(value: String) -> String:
	var result := value.strip_edges()
	if result.is_empty():
		return "Cat"
	return result.substr(0, 16)

func _get_players_map(state):
	if state == null:
		return null

	if state.has_method("meta_get"):
		return state.meta_get(0)

	return null

func _world_to_screen(world_position: Vector2) -> Vector2:
	return (world_layer.size * 0.5) + world_position

func _set_status(text: String) -> void:
	status_label.text = "Status: %s" % text
	help_label.text = "Room: %s | Server: %s | Move with arrow keys." % [ROOM_NAME, SERVER_ENDPOINT]
