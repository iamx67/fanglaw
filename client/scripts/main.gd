extends Control

const colyseus = preload("res://addons/godot_colyseus/lib/colyseus.gd")
const CatAvatar = preload("res://scripts/cat_avatar.gd")
const WorldGrid = preload("res://scripts/world_grid.gd")

const DEFAULT_SERVER_ENDPOINT := "ws://localhost:2567"
const SERVER_CONFIG_PATH := "res://server_config.cfg"
const USER_SERVER_CONFIG_PATH := "user://server_config.cfg"
const SERVER_CONFIG_SECTION := "network"
const SERVER_ENDPOINT_KEY := "endpoint"
const ROOM_NAME := "cats"
const PING_INTERVAL := 2.0
const GRID_MOVE_REPEAT_SECONDS := 0.18
const CELL_TRANSITION_DURATION := 0.18
const SETTINGS_PATH := "user://catlaw_client.cfg"
const SETTINGS_SECTION := "profile"
const SETTINGS_NAME_KEY := "player_name"
const SETTINGS_PLAYER_ID_KEY := "player_id"
const SETTINGS_RECONNECT_TOKEN_KEY := "reconnection_token"
const BUTTON_ENTER_WORLD := "Enter World"
const BUTTON_CONNECTING := "Connecting..."
const BUTTON_RECONNECTING := "Reconnecting..."
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
			colyseus.Field.new("playerId", colyseus.STRING),
			colyseus.Field.new("sessionId", colyseus.STRING),
			colyseus.Field.new("name", colyseus.STRING),
			colyseus.Field.new("x", colyseus.NUMBER),
			colyseus.Field.new("y", colyseus.NUMBER),
			colyseus.Field.new("connected", colyseus.BOOLEAN),
		]

class RoomState extends colyseus.Schema:
	static func define_fields():
		return [
			colyseus.Field.new("players", colyseus.MAP, Player),
		]

@onready var world_view: WorldView = $WorldView
@onready var start_screen: StartScreen = $StartScreen
@onready var name_input: LineEdit = start_screen.name_input
@onready var enter_world_button: Button = start_screen.enter_world_button
@onready var status_label: Label = start_screen.status_label
@onready var help_label: Label = start_screen.help_label
@onready var debug_label: Label = start_screen.debug_label
@onready var world_layer: Control = world_view.world_layer

var client = null
var room: colyseus.Room = null
var local_player_id := ""
var local_session_id := ""
var local_position := Vector2.ZERO
var current_reconnection_token := ""
var avatars: Dictionary = {}
var avatar_target_positions: Dictionary = {}
var avatar_world_positions: Dictionary = {}
var tracked_player_refs: Dictionary = {}
var is_connecting := false
var ping_elapsed := 0.0
var last_pong_text := "waiting"
var connection_state := ConnectionState.OFFLINE
var status_detail := ""
var debug_enabled := OS.is_debug_build()
var server_endpoint := DEFAULT_SERVER_ENDPOINT
var held_move_direction := Vector2.ZERO
var move_repeat_elapsed := 0.0

func _ready() -> void:
	start_screen.enter_requested.connect(_on_enter_world_pressed)
	start_screen.name_changed.connect(_on_name_changed)
	world_layer.resized.connect(_refresh_all_avatar_positions)

	debug_label.visible = debug_enabled
	_ensure_world_grid()
	_load_server_endpoint()
	_load_local_profile()
	_set_connection_state(ConnectionState.OFFLINE, _build_offline_detail())

func _physics_process(delta: float) -> void:
	if room == null or not room.has_joined():
		return

	ping_elapsed += delta
	if ping_elapsed >= PING_INTERVAL:
		ping_elapsed = 0.0
		room.send("ping")

	_handle_grid_movement_input(delta)

func _process(delta: float) -> void:
	_smooth_avatar_positions(delta)

func _on_name_changed(new_text: String) -> void:
	_save_local_name(new_text)

func _on_enter_world_pressed() -> void:
	if is_connecting:
		return

	if room != null and room.has_joined():
		return

	if _has_reconnection_token():
		await _reconnect_to_world(false)
	else:
		await _connect_to_world()

func _connect_to_world() -> void:
	is_connecting = true

	if room == null and not _has_reconnection_token() and not avatars.is_empty():
		_clear_world()

	var player_name := _sanitize_name(name_input.text)
	name_input.text = player_name
	_save_local_name(player_name)

	_set_connection_state(ConnectionState.CONNECTING, "Connecting to %s ..." % server_endpoint)

	client = colyseus.Client.new(server_endpoint)
	var promise = client.join(RoomState, ROOM_NAME, {
		"name": player_name,
		"playerId": local_player_id,
	})

	await promise.completed

	is_connecting = false

	if promise.get_state() == promise.State.Failed:
		_detach_room_runtime()
		_set_connection_state(ConnectionState.FAILED, "Connect failed: %s" % str(promise.get_error()))
		return

	_activate_room(promise.get_data(), false)
	_set_connection_state(ConnectionState.CONNECTED, "Connected to %s as %s." % [ROOM_NAME, player_name])

func _reconnect_to_world(auto_attempt: bool) -> void:
	if not _has_reconnection_token():
		if not auto_attempt:
			await _connect_to_world()
		return

	is_connecting = true
	_set_connection_state(ConnectionState.RECONNECTING, "Trying to reconnect...")

	client = colyseus.Client.new(server_endpoint)
	var promise = client.reconnect(RoomState, current_reconnection_token)

	await promise.completed

	is_connecting = false

	if promise.get_state() == promise.State.Failed:
		var error_text := str(promise.get_error())
		_detach_room_runtime()

		if _is_expired_reconnect_error(error_text):
			_clear_reconnection_token()
			_clear_world()
			if auto_attempt:
				_set_connection_state(ConnectionState.FAILED, "Reconnect expired. Click Retry Connection to join again.")
			else:
				await _connect_to_world()
		else:
			_set_connection_state(ConnectionState.FAILED, "Reconnect failed: %s" % error_text)

		return

	_activate_room(promise.get_data(), true)
	_set_connection_state(ConnectionState.CONNECTED, "Reconnected to %s as %s." % [ROOM_NAME, name_input.text])

func _activate_room(next_room: colyseus.Room, is_reconnect: bool) -> void:
	room = next_room
	local_session_id = room.session_id
	ping_elapsed = 0.0
	last_pong_text = "reconnected" if is_reconnect else "waiting"
	held_move_direction = Vector2.ZERO
	move_repeat_elapsed = 0.0

	_store_reconnection_token(room.reconnection_token)
	_bind_room_events()

	start_screen.release_form_focus()
	world_view.grab_world_focus()

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
	if room != null and room.has_joined() and _has_reconnection_token():
		_set_connection_state(ConnectionState.RECONNECTING, error_text)
	else:
		_set_connection_state(ConnectionState.FAILED, error_text)

func _on_room_leave() -> void:
	_detach_room_runtime()

	if _has_reconnection_token():
		_set_connection_state(ConnectionState.RECONNECTING, "Connection lost. Reconnecting...")
		call_deferred("_auto_reconnect_after_drop")
	else:
		_clear_world()
		_set_connection_state(ConnectionState.FAILED, "Connection lost.")

func _auto_reconnect_after_drop() -> void:
	if is_connecting or room != null or not _has_reconnection_token():
		return

	await _reconnect_to_world(true)

func _on_state_change(_state) -> void:
	_sync_all_players()
	_refresh_debug_info()

func _on_pong(data: Dictionary) -> void:
	last_pong_text = "pong %s" % str(data.get("serverTime", "ok"))
	_refresh_debug_info()

func _on_player_added(_target, player: Player, player_id: String) -> void:
	_register_player(player_id, player)
	_refresh_debug_info()

func _on_player_removed(_target, _player: Player, player_id: String) -> void:
	_remove_avatar(player_id)
	_refresh_debug_info()

func _on_players_cleared(_target) -> void:
	_clear_world()
	_refresh_debug_info()

func _on_player_changed(player: Player, player_id: String) -> void:
	_register_player(player_id, player)

func _on_player_deleted(_player: Player, player_id: String) -> void:
	_remove_avatar(player_id)
	_refresh_debug_info()

func _sync_all_players() -> void:
	if room == null:
		return

	var state = room.get_state()
	var players = _get_players_map(state)
	if players == null:
		return

	for player_id in players.keys():
		var player = players.at(player_id)
		_register_player(player_id, player)

func _register_player(player_id: String, player: Player) -> void:
	if player == null:
		return

	var avatar = avatars.get(player_id)
	var is_new_avatar := avatar == null
	if avatar == null:
		avatar = CatAvatar.new()
		avatar.name = "CatAvatar_%s" % player_id
		world_layer.add_child(avatar)
		avatars[player_id] = avatar

	if tracked_player_refs.get(player_id) != player:
		tracked_player_refs[player_id] = player
		player.listen(":change").on(Callable(self, "_on_player_changed"), [player_id])
		player.listen(":delete").on(Callable(self, "_on_player_deleted"), [player_id])

	var is_local_avatar := _is_local_player(player_id, player)
	if is_local_avatar:
		_store_local_player_identity(player_id, player)

	avatar.configure(_display_player_name(player), is_local_avatar)
	avatar.modulate = Color(1, 1, 1, 1.0 if player.connected else 0.55)

	var position := Vector2(player.x, player.y)
	_set_avatar_target(player_id, position, is_new_avatar)

func _set_avatar_target(player_id: String, world_position: Vector2, snap_to_target := false) -> void:
	var avatar = avatars.get(player_id)
	if avatar == null:
		return

	avatar_world_positions[player_id] = world_position
	var screen_position := _world_to_screen(world_position) - (CatAvatar.AVATAR_SIZE * 0.5)
	avatar_target_positions[player_id] = screen_position

	if snap_to_target:
		avatar.position = screen_position

func _refresh_all_avatar_positions() -> void:
	if room == null:
		return

	var state = room.get_state()
	var players = _get_players_map(state)
	if players == null:
		return

	for player_id in players.keys():
		var player = players.at(player_id)
		if player != null:
			_set_avatar_target(player_id, Vector2(player.x, player.y))

func _remove_avatar(player_id: String) -> void:
	var avatar = avatars.get(player_id)
	if avatar == null:
		return

	avatars.erase(player_id)
	avatar_target_positions.erase(player_id)
	avatar_world_positions.erase(player_id)
	tracked_player_refs.erase(player_id)
	avatar.queue_free()

func _clear_world() -> void:
	for player_id in avatars.keys():
		var avatar = avatars[player_id]
		if avatar != null:
			avatar.queue_free()

	avatars.clear()
	avatar_target_positions.clear()
	avatar_world_positions.clear()
	tracked_player_refs.clear()
	_refresh_debug_info()

func _detach_room_runtime() -> void:
	room = null
	client = null
	local_session_id = ""
	ping_elapsed = 0.0
	last_pong_text = "waiting"
	held_move_direction = Vector2.ZERO
	move_repeat_elapsed = 0.0

func _set_connection_state(next_state: int, detail: String = "") -> void:
	connection_state = next_state
	status_detail = detail
	_refresh_status_ui()

func _refresh_status_ui() -> void:
	start_screen.visible = connection_state != ConnectionState.CONNECTED

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
			var can_retry := not is_connecting and (room == null or not room.has_joined())
			name_input.editable = false
			enter_world_button.disabled = not can_retry
			enter_world_button.text = BUTTON_RETRY if can_retry else BUTTON_RECONNECTING
		ConnectionState.FAILED:
			name_input.editable = true
			enter_world_button.disabled = false
			enter_world_button.text = BUTTON_RETRY

	status_label.text = "Status: %s" % _format_status_text()
	help_label.text = "Room: %s | Server: %s | Move one cell with arrow keys." % [ROOM_NAME, server_endpoint]
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
	debug_label.text = "Debug: playerId=%s | sessionId=%s | players=%d | ping=%s" % [
		_get_debug_player_id(),
		_get_debug_session_id(),
		_get_player_count(),
		last_pong_text,
	]

func _get_debug_player_id() -> String:
	if local_player_id.is_empty():
		return "-"
	return local_player_id

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

func _load_server_endpoint() -> void:
	server_endpoint = _build_runtime_default_server_endpoint()

	var user_config := ConfigFile.new()
	if user_config.load(USER_SERVER_CONFIG_PATH) == OK:
		server_endpoint = _sanitize_server_endpoint(str(
			user_config.get_value(SERVER_CONFIG_SECTION, SERVER_ENDPOINT_KEY, server_endpoint)
		))
		return

	if OS.has_feature("web") or OS.has_feature("editor"):
		return

	var bundled_config := ConfigFile.new()
	if bundled_config.load(SERVER_CONFIG_PATH) == OK:
		server_endpoint = _sanitize_server_endpoint(str(
			bundled_config.get_value(SERVER_CONFIG_SECTION, SERVER_ENDPOINT_KEY, server_endpoint)
		))

func _sanitize_server_endpoint(value: String) -> String:
	var result := value.strip_edges()
	if result.begins_with("ws://") or result.begins_with("wss://"):
		return result
	return DEFAULT_SERVER_ENDPOINT

func _build_runtime_default_server_endpoint() -> String:
	if not OS.has_feature("web"):
		return DEFAULT_SERVER_ENDPOINT

	var browser_host := str(JavaScriptBridge.eval("window.location.host"))
	var browser_protocol := str(JavaScriptBridge.eval("window.location.protocol"))

	if browser_host.is_empty():
		return DEFAULT_SERVER_ENDPOINT

	var scheme := "wss://" if browser_protocol == "https:" else "ws://"
	return scheme + browser_host

func _load_local_profile() -> void:
	var config := ConfigFile.new()
	var load_result := config.load(SETTINGS_PATH)

	var saved_name := name_input.text
	if load_result == OK:
		saved_name = str(config.get_value(SETTINGS_SECTION, SETTINGS_NAME_KEY, name_input.text))
		local_player_id = _sanitize_player_id(str(config.get_value(SETTINGS_SECTION, SETTINGS_PLAYER_ID_KEY, "")))
		current_reconnection_token = str(config.get_value(SETTINGS_SECTION, SETTINGS_RECONNECT_TOKEN_KEY, ""))

	if local_player_id.is_empty():
		local_player_id = _generate_guest_player_id()
		_save_profile_value(SETTINGS_PLAYER_ID_KEY, local_player_id)

	name_input.text = _sanitize_name(saved_name)

func _save_local_name(value: String) -> void:
	_save_profile_value(SETTINGS_NAME_KEY, _sanitize_name(value))

func _save_profile_value(key: String, value) -> void:
	var config := ConfigFile.new()
	config.load(SETTINGS_PATH)
	config.set_value(SETTINGS_SECTION, key, value)
	config.save(SETTINGS_PATH)

func _store_reconnection_token(token: String) -> void:
	current_reconnection_token = token
	_save_profile_value(SETTINGS_RECONNECT_TOKEN_KEY, current_reconnection_token)

func _clear_reconnection_token() -> void:
	current_reconnection_token = ""
	_save_profile_value(SETTINGS_RECONNECT_TOKEN_KEY, "")

func _has_reconnection_token() -> bool:
	return not current_reconnection_token.strip_edges().is_empty()

func _build_offline_detail() -> String:
	if _has_reconnection_token():
		return "Reconnect available. Click Enter World."
	return "Start the server, then click Enter World."

func _ensure_world_grid() -> void:
	if world_layer.get_node_or_null("WorldGrid") != null:
		return

	var world_grid := WorldGrid.new()
	world_grid.name = "WorldGrid"
	world_layer.add_child(world_grid)
	world_layer.move_child(world_grid, 0)

func _sanitize_player_id(value: String) -> String:
	var cleaned := value.strip_edges().to_lower()
	var result := ""

	for i in cleaned.length():
		var ch := cleaned[i]
		var is_digit := ch >= "0" and ch <= "9"
		var is_lower := ch >= "a" and ch <= "z"
		if is_digit or is_lower or ch == "_" or ch == "-":
			result += ch

	if result.is_empty():
		return ""

	return result.substr(0, 32)

func _generate_guest_player_id() -> String:
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var raw := "%s%x%x" % [
		str(Time.get_unix_time_from_system()),
		rng.randi(),
		rng.randi(),
	]
	return _sanitize_player_id("guest_%s" % raw)

func _is_local_player(player_id: String, player: Player) -> bool:
	if player_id == local_player_id:
		return true

	return str(player.sessionId) == local_session_id

func _store_local_player_identity(player_id: String, player: Player) -> void:
	if local_player_id != player_id:
		local_player_id = player_id
		_save_profile_value(SETTINGS_PLAYER_ID_KEY, local_player_id)

	local_session_id = str(player.sessionId)
	local_position = Vector2(player.x, player.y)

func _is_expired_reconnect_error(error_text: String) -> bool:
	var lowered := error_text.to_lower()
	return (
		lowered.contains("expired")
		or lowered.contains("already consumed")
		or lowered.contains("bad reconnection token")
		or lowered.contains("reconnection token invalid")
		or lowered.contains("disposed")
		or lowered.contains("invalid room")
		or lowered.contains("[522]")
		or lowered.contains("[524]")
	)

func _handle_grid_movement_input(delta: float) -> void:
	var pressed_direction := _read_pressed_grid_direction()
	if pressed_direction != Vector2.ZERO:
		_send_grid_move(pressed_direction)
		held_move_direction = pressed_direction
		move_repeat_elapsed = 0.0
		return

	var held_direction := _read_held_grid_direction()
	if held_direction == Vector2.ZERO:
		held_move_direction = Vector2.ZERO
		move_repeat_elapsed = 0.0
		return

	if held_direction != held_move_direction:
		held_move_direction = held_direction
		move_repeat_elapsed = 0.0
		return

	move_repeat_elapsed += delta
	if move_repeat_elapsed >= GRID_MOVE_REPEAT_SECONDS:
		move_repeat_elapsed = 0.0
		_send_grid_move(held_direction)

func _read_pressed_grid_direction() -> Vector2:
	if Input.is_action_just_pressed("ui_left"):
		return Vector2.LEFT
	if Input.is_action_just_pressed("ui_right"):
		return Vector2.RIGHT
	if Input.is_action_just_pressed("ui_up"):
		return Vector2.UP
	if Input.is_action_just_pressed("ui_down"):
		return Vector2.DOWN
	return Vector2.ZERO

func _read_held_grid_direction() -> Vector2:
	if Input.is_action_pressed("ui_left"):
		return Vector2.LEFT
	if Input.is_action_pressed("ui_right"):
		return Vector2.RIGHT
	if Input.is_action_pressed("ui_up"):
		return Vector2.UP
	if Input.is_action_pressed("ui_down"):
		return Vector2.DOWN
	return Vector2.ZERO

func _send_grid_move(direction: Vector2) -> void:
	if room == null or not room.has_joined():
		return

	_predict_local_grid_move(direction)

	room.send("move", {
		"x": int(direction.x),
		"y": int(direction.y),
	})

func _smooth_avatar_positions(delta: float) -> void:
	if avatars.is_empty():
		return

	var transition_speed := WorldGrid.CELL_SIZE / CELL_TRANSITION_DURATION

	for player_id in avatars.keys():
		var avatar: Control = avatars.get(player_id)
		if avatar == null or not avatar_target_positions.has(player_id):
			continue

		var target_position: Vector2 = avatar_target_positions[player_id]
		avatar.position = avatar.position.move_toward(target_position, transition_speed * delta)

		if avatar.position.distance_to(target_position) <= 1.0:
			avatar.position = target_position

func _predict_local_grid_move(direction: Vector2) -> void:
	if local_player_id.is_empty() or not avatars.has(local_player_id):
		return

	var predicted_position := local_position + (direction * WorldGrid.CELL_SIZE)
	predicted_position.x = clampf(predicted_position.x, WorldGrid.WORLD_MIN_X, WorldGrid.WORLD_MAX_X)
	predicted_position.y = clampf(predicted_position.y, WorldGrid.WORLD_MIN_Y, WorldGrid.WORLD_MAX_Y)

	if predicted_position == local_position:
		return

	local_position = predicted_position
	_set_avatar_target(local_player_id, predicted_position)

func _get_players_map(state):
	if state == null:
		return null

	if state.has_method("meta_get"):
		return state.meta_get(0)

	return null

func _world_to_screen(world_position: Vector2) -> Vector2:
	return (world_layer.size * 0.5) + world_position
