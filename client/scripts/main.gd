extends Control

const colyseus = preload("res://addons/godot_colyseus/lib/colyseus.gd")
const CatAvatar = preload("res://scripts/cat_avatar.gd")

const SERVER_ENDPOINT := "ws://localhost:2567"
const ROOM_NAME := "cats"
const PING_INTERVAL := 2.0
const POSITION_SMOOTH_SPEED := 14.0
const INPUT_EPSILON := 0.001
const SETTINGS_PATH := "user://catlaw_client.cfg"
const SETTINGS_SECTION := "profile"
const SETTINGS_NAME_KEY := "player_name"
const BUTTON_ENTER_WORLD := "Enter World"
const BUTTON_CONNECTING := "Connecting..."
const BUTTON_IN_WORLD := "In World"
const BUTTON_RETRY := "Retry Connection"

enum ConnectionState {
	OFFLINE,
	CONNECTING,
	CONNECTED,
	RECONNECTING,
	FAILED,
}

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
@onready var debug_label: Label = $RootMargin/RootVBox/HudPanel/HudMargin/HudVBox/DebugLabel
@onready var world_layer: Control = $RootMargin/RootVBox/WorldPanel/WorldLayer

var client = null
var room: colyseus.Room = null
var local_session_id := ""
var local_position := Vector2.ZERO
var avatars: Dictionary = {}
var avatar_target_positions: Dictionary = {}
var avatar_world_positions: Dictionary = {}
var is_connecting := false
var ping_elapsed := 0.0
var last_pong_text := "waiting"
var connection_state := ConnectionState.OFFLINE
var status_detail := ""
var debug_enabled := OS.is_debug_build()
var last_sent_input := Vector2.ZERO

func _ready() -> void:
	enter_world_button.pressed.connect(_on_enter_world_pressed)
	name_input.text_submitted.connect(_on_name_submitted)
	name_input.text_changed.connect(_on_name_changed)
	world_layer.resized.connect(_refresh_all_avatar_positions)
	world_layer.focus_mode = Control.FOCUS_ALL

	debug_label.visible = debug_enabled
	_load_local_name()
	_set_connection_state(ConnectionState.OFFLINE, "Start the server, then click Enter World.")

func _physics_process(delta: float) -> void:
	if room == null or not room.has_joined():
		return

	ping_elapsed += delta
	if ping_elapsed >= PING_INTERVAL:
		ping_elapsed = 0.0
		room.send("ping")

	var direction := _read_movement_input()
	if _movement_input_changed(direction):
		_send_movement_input(direction)

func _process(delta: float) -> void:
	_smooth_avatar_positions(delta)

func _on_name_submitted(_text: String) -> void:
	await _on_enter_world_pressed()

func _on_name_changed(new_text: String) -> void:
	_save_local_name(new_text)

func _on_enter_world_pressed() -> void:
	if is_connecting:
		return

	if room != null and room.has_joined():
		return

	await _connect_to_world()

func _connect_to_world() -> void:
	is_connecting = true

	var player_name := _sanitize_name(name_input.text)
	name_input.text = player_name
	_save_local_name(player_name)

	_set_connection_state(ConnectionState.CONNECTING, "Connecting to %s ..." % SERVER_ENDPOINT)

	client = colyseus.Client.new(SERVER_ENDPOINT)
	var promise = client.join_or_create(RoomState, ROOM_NAME, {
		"name": player_name,
	})

	await promise.completed

	is_connecting = false

	if promise.get_state() == promise.State.Failed:
		_reset_room_runtime()
		_set_connection_state(ConnectionState.FAILED, "Connect failed: %s" % str(promise.get_error()))
		return

	room = promise.get_data()
	local_session_id = room.session_id
	local_position = Vector2.ZERO
	ping_elapsed = 0.0
	last_pong_text = "waiting"

	_bind_room_events()

	name_input.release_focus()
	enter_world_button.release_focus()
	world_layer.grab_focus()
	_set_connection_state(ConnectionState.CONNECTED, "Connected to %s as %s." % [ROOM_NAME, player_name])

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
	var error_text := "Room error %d: %s" % [code, message]
	if room != null and room.has_joined():
		_set_connection_state(ConnectionState.RECONNECTING, error_text)
	else:
		_set_connection_state(ConnectionState.FAILED, error_text)

func _on_room_leave() -> void:
	_clear_world()
	_reset_room_runtime()
	_set_connection_state(ConnectionState.RECONNECTING, "Connection lost. Click Retry Connection.")

func _on_state_change(_state) -> void:
	_sync_all_players()
	_refresh_debug_info()

func _on_pong(data: Dictionary) -> void:
	last_pong_text = "pong %s" % str(data.get("serverTime", "ok"))
	_refresh_debug_info()

func _on_player_added(_target, player: Player, session_id: String) -> void:
	_register_player(session_id, player)
	_refresh_debug_info()

func _on_player_removed(_target, _player: Player, session_id: String) -> void:
	_remove_avatar(session_id)
	_refresh_debug_info()

func _on_players_cleared(_target) -> void:
	_clear_world()
	_refresh_debug_info()

func _on_player_changed(player: Player, session_id: String) -> void:
	_register_player(session_id, player)

func _on_player_deleted(_player: Player, session_id: String) -> void:
	_remove_avatar(session_id)
	_refresh_debug_info()

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
	var is_new_avatar := avatar == null
	if avatar == null:
		avatar = CatAvatar.new()
		avatar.name = "CatAvatar_%s" % session_id
		world_layer.add_child(avatar)
		avatars[session_id] = avatar

		player.listen(":change").on(Callable(self, "_on_player_changed"), [session_id])
		player.listen(":delete").on(Callable(self, "_on_player_deleted"), [session_id])

	avatar.configure(_display_player_name(player), session_id == local_session_id)

	var position := Vector2(player.x, player.y)
	_set_avatar_target(session_id, position, is_new_avatar)

	if session_id == local_session_id:
		local_position = position

func _set_avatar_target(session_id: String, world_position: Vector2, snap_to_target := false) -> void:
	var avatar = avatars.get(session_id)
	if avatar == null:
		return

	avatar_world_positions[session_id] = world_position
	var screen_position := _world_to_screen(world_position) - (CatAvatar.AVATAR_SIZE * 0.5)
	avatar_target_positions[session_id] = screen_position

	if snap_to_target:
		avatar.position = screen_position

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
			_set_avatar_target(session_id, Vector2(player.x, player.y))

func _remove_avatar(session_id: String) -> void:
	var avatar = avatars.get(session_id)
	if avatar == null:
		return

	avatars.erase(session_id)
	avatar_target_positions.erase(session_id)
	avatar_world_positions.erase(session_id)
	avatar.queue_free()

func _clear_world() -> void:
	for session_id in avatars.keys():
		var avatar = avatars[session_id]
		if avatar != null:
			avatar.queue_free()

	avatars.clear()
	avatar_target_positions.clear()
	avatar_world_positions.clear()
	_refresh_debug_info()

func _reset_room_runtime() -> void:
	room = null
	client = null
	local_session_id = ""
	local_position = Vector2.ZERO
	ping_elapsed = 0.0
	last_pong_text = "waiting"
	last_sent_input = Vector2.ZERO

func _set_connection_state(next_state: int, detail: String = "") -> void:
	connection_state = next_state
	status_detail = detail
	_refresh_status_ui()

func _refresh_status_ui() -> void:
	match connection_state:
		ConnectionState.OFFLINE:
			name_input.editable = true
			enter_world_button.disabled = false
			enter_world_button.text = BUTTON_ENTER_WORLD
		ConnectionState.CONNECTING:
			name_input.editable = false
			enter_world_button.disabled = true
			enter_world_button.text = BUTTON_CONNECTING
		ConnectionState.CONNECTED:
			name_input.editable = false
			enter_world_button.disabled = true
			enter_world_button.text = BUTTON_IN_WORLD
		ConnectionState.RECONNECTING:
			var can_retry := room == null or not room.has_joined()
			name_input.editable = can_retry
			enter_world_button.disabled = not can_retry
			enter_world_button.text = BUTTON_RETRY
		ConnectionState.FAILED:
			name_input.editable = true
			enter_world_button.disabled = false
			enter_world_button.text = BUTTON_RETRY

	status_label.text = "Status: %s" % _format_status_text()
	help_label.text = "Room: %s | Server: %s | Move with arrow keys." % [ROOM_NAME, SERVER_ENDPOINT]
	_refresh_debug_info()

func _format_status_text() -> String:
	var state_text := _connection_state_text(connection_state)
	if status_detail.is_empty():
		return state_text
	return "%s | %s" % [state_text, status_detail]

func _connection_state_text(state: int) -> String:
	match state:
		ConnectionState.OFFLINE:
			return "offline"
		ConnectionState.CONNECTING:
			return "connecting"
		ConnectionState.CONNECTED:
			return "connected"
		ConnectionState.RECONNECTING:
			return "reconnecting"
		ConnectionState.FAILED:
			return "failed"
		_:
			return "unknown"

func _refresh_debug_info() -> void:
	if not debug_enabled:
		debug_label.visible = false
		return

	debug_label.visible = true
	debug_label.text = "Debug: sessionId=%s | players=%d | ping=%s" % [
		_get_debug_session_id(),
		_get_player_count(),
		last_pong_text,
	]

func _get_debug_session_id() -> String:
	if local_session_id.is_empty():
		return "-"
	return local_session_id

func _get_player_count() -> int:
	if room == null:
		return 0

	var state = room.get_state()
	var players = _get_players_map(state)
	if players == null:
		return 0

	return players.size()

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

func _load_local_name() -> void:
	var config := ConfigFile.new()
	if config.load(SETTINGS_PATH) != OK:
		name_input.text = _sanitize_name(name_input.text)
		return

	var saved_name := str(config.get_value(SETTINGS_SECTION, SETTINGS_NAME_KEY, name_input.text))
	name_input.text = _sanitize_name(saved_name)

func _save_local_name(value: String) -> void:
	var config := ConfigFile.new()
	config.load(SETTINGS_PATH)
	config.set_value(SETTINGS_SECTION, SETTINGS_NAME_KEY, value)
	config.save(SETTINGS_PATH)

func _read_movement_input() -> Vector2:
	var input_direction := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if input_direction == Vector2.ZERO:
		return Vector2.ZERO

	return input_direction.normalized()

func _movement_input_changed(next_input: Vector2) -> bool:
	return last_sent_input.distance_to(next_input) > INPUT_EPSILON

func _send_movement_input(input_direction: Vector2) -> void:
	if room == null or not room.has_joined():
		return

	last_sent_input = input_direction
	room.send("move", {
		"x": input_direction.x,
		"y": input_direction.y,
	})

func _smooth_avatar_positions(delta: float) -> void:
	if avatars.is_empty():
		return

	var weight: float = clamp(delta * POSITION_SMOOTH_SPEED, 0.0, 1.0)

	for session_id in avatars.keys():
		var avatar: Control = avatars.get(session_id)
		if avatar == null or not avatar_target_positions.has(session_id):
			continue

		var target: Vector2 = avatar_target_positions[session_id]
		var next_position: Vector2 = avatar.position.lerp(target, weight)
		if next_position.distance_to(target) <= 0.5:
			next_position = target

		avatar.position = next_position

func _get_players_map(state):
	if state == null:
		return null

	if state.has_method("meta_get"):
		return state.meta_get(0)

	return null

func _world_to_screen(world_position: Vector2) -> Vector2:
	return (world_layer.size * 0.5) + world_position
