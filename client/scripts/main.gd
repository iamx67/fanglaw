extends Control

const colyseus = preload("res://addons/godot_colyseus/lib/colyseus.gd")
const PlayerAvatarScene = preload("res://scenes/player_avatar.tscn")
const PreyAvatarScene = preload("res://scenes/prey_avatar.tscn")
const WorldConfig = preload("res://scripts/world_config.gd")

const DEFAULT_SERVER_ENDPOINT := "ws://localhost:2567"
const DEFAULT_API_BASE_URL := "http://localhost:2567"
const DEFAULT_SITE_URL := "http://localhost:4173"
const SERVER_CONFIG_PATH := "res://server_config.cfg"
const USER_SERVER_CONFIG_PATH := "user://server_config.cfg"
const SERVER_CONFIG_SECTION := "network"
const SERVER_ENDPOINT_KEY := "endpoint"
const ROOM_NAME := "cats"
const PING_INTERVAL := 2.0
const AUTO_CONNECT_RETRY_SECONDS := 3.0
const BASE_GRID_MOVE_REPEAT_SECONDS := 0.13
const BASE_SPRINT_GRID_MOVE_REPEAT_SECONDS := 0.09
const BASE_CELL_TRANSITION_DURATION := 0.13
const BASE_SPRINT_CELL_TRANSITION_DURATION := 0.09
const BASE_GRID_TIMING_CELL_SIZE := 64.0
const GRID_TIMING_SCALE_EXPONENT := 0.8
const VISUAL_STEP_OVERLAP_RATIO := 1.04
const GRID_POSITION_EPSILON := 0.1
const MAX_STAMINA := 100.0
const MIN_STAMINA_TO_SPRINT := 5.0
const RANDOM_NAME_LENGTH := 8
const RANDOM_NAME_ALPHABET := "abcdefghijklmnopqrstuvwxyz"
const SETTINGS_PATH := "user://catlaw_client.cfg"
const SETTINGS_SECTION := "profile"
const SETTINGS_PLAYER_ID_KEY := "player_id"
const SETTINGS_RECONNECT_TOKEN_KEY := "reconnection_token"
const SETTINGS_SESSION_TOKEN_KEY := "session_token"
const SITE_SESSION_STORAGE_KEY := "fanglaw.site.session_token"
const AUTH_LOGIN_PATH := "/api/login"
const MOVE_UP_ACTION := &"move_up"
const MOVE_DOWN_ACTION := &"move_down"
const MOVE_LEFT_ACTION := &"move_left"
const MOVE_RIGHT_ACTION := &"move_right"
const MOVE_UP_LEFT_ACTION := &"move_up_left"
const MOVE_UP_RIGHT_ACTION := &"move_up_right"
const MOVE_DOWN_LEFT_ACTION := &"move_down_left"
const MOVE_DOWN_RIGHT_ACTION := &"move_down_right"
const MOVE_SPRINT_ACTION := &"move_sprint"

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
			colyseus.Field.new("facing", colyseus.STRING),
			colyseus.Field.new("appearanceJson", colyseus.STRING),
			colyseus.Field.new("stamina", colyseus.NUMBER),
			colyseus.Field.new("sprinting", colyseus.BOOLEAN),
			colyseus.Field.new("connected", colyseus.BOOLEAN),
		]

class Prey extends colyseus.Schema:
	static func define_fields():
		return [
			colyseus.Field.new("preyId", colyseus.STRING),
			colyseus.Field.new("kind", colyseus.STRING),
			colyseus.Field.new("state", colyseus.STRING),
			colyseus.Field.new("searchZoneId", colyseus.STRING),
			colyseus.Field.new("x", colyseus.NUMBER),
			colyseus.Field.new("y", colyseus.NUMBER),
		]

class RoomState extends colyseus.Schema:
	static func define_fields():
		return [
			colyseus.Field.new("players", colyseus.MAP, Player),
			colyseus.Field.new("prey", colyseus.MAP, Prey),
		]

@onready var world_view: WorldView = $WorldView
@onready var action_overlay: Control = $ActionLayer/ActionOverlay
@onready var stamina_hud: Control = $ActionLayer/ActionOverlay/TopLeft/StaminaPanel
@onready var stamina_label: Label = $ActionLayer/ActionOverlay/TopLeft/StaminaPanel/Margin/VBox/StaminaLabel
@onready var stamina_bar: ProgressBar = $ActionLayer/ActionOverlay/TopLeft/StaminaPanel/Margin/VBox/StaminaBar
@onready var action_bottom_center: Control = $ActionLayer/ActionOverlay/BottomCenter
@onready var search_prey_button: Button = $ActionLayer/ActionOverlay/BottomCenter/SearchPreyButton
@onready var auth_overlay: Control = $AuthLayer/AuthOverlay
@onready var auth_title_label: Label = $AuthLayer/AuthOverlay/Center/Panel/Margin/VBox/Title
@onready var auth_description_label: Label = $AuthLayer/AuthOverlay/Center/Panel/Margin/VBox/Description
@onready var auth_email_input: LineEdit = $AuthLayer/AuthOverlay/Center/Panel/Margin/VBox/EmailInput
@onready var auth_password_input: LineEdit = $AuthLayer/AuthOverlay/Center/Panel/Margin/VBox/PasswordInput
@onready var auth_login_button: Button = $AuthLayer/AuthOverlay/Center/Panel/Margin/VBox/Buttons/LoginButton
@onready var auth_site_button: Button = $AuthLayer/AuthOverlay/Center/Panel/Margin/VBox/Buttons/OpenSiteButton
@onready var auth_status_label: Label = $AuthLayer/AuthOverlay/Center/Panel/Margin/VBox/StatusLabel
@onready var auth_request: HTTPRequest = $AuthRequest

var client = null
var room: colyseus.Room = null
var local_player_id := ""
var local_session_id := ""
var local_position := Vector2.ZERO
var local_authoritative_position := Vector2.ZERO
var has_local_authoritative_position := false
var local_pending_steps: Array[Vector2] = []
var current_player_name := ""
var current_session_token := ""
var current_reconnection_token := ""
var avatars: Dictionary = {}
var avatar_appearance_jsons: Dictionary = {}
var avatar_target_positions: Dictionary = {}
var avatar_world_positions: Dictionary = {}
var avatar_step_distances: Dictionary = {}
var avatar_step_durations: Dictionary = {}
var prey_avatars: Dictionary = {}
var is_connecting := false
var auto_connect_retry_scheduled := false
var ping_elapsed := 0.0
var last_pong_text := "waiting"
var connection_state := ConnectionState.OFFLINE
var status_detail := ""
var server_endpoint := DEFAULT_SERVER_ENDPOINT
var api_base_url := ""
var site_url := DEFAULT_SITE_URL
var held_move_direction := Vector2.ZERO
var last_cardinal_direction := Vector2.ZERO
var move_cooldown_remaining := 0.0
var auth_login_in_progress := false
var active_prey_search_zone = null
var local_facing := "right"
var last_sent_facing := ""
var local_stamina := MAX_STAMINA
var local_is_sprinting := false

func _ready() -> void:
	focus_mode = Control.FOCUS_ALL
	grab_focus()
	_ensure_move_input_actions()
	_configure_action_ui()
	_configure_auth_ui()
	_load_server_endpoint()
	_refresh_auth_copy()
	_load_local_profile()
	_sync_session_token_from_web_storage()
	_set_connection_state(ConnectionState.OFFLINE, "Authentication is required.")
	call_deferred("_begin_auto_connect")

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_IN or what == NOTIFICATION_WM_WINDOW_FOCUS_IN:
		_sync_session_token_from_web_storage()
		if room == null and not is_connecting and _has_session_token():
			call_deferred("_begin_auto_connect")
		call_deferred("_resnap_camera_to_local_avatar")

func _physics_process(delta: float) -> void:
	if room == null or not room.has_joined():
		return

	ping_elapsed += delta
	if ping_elapsed >= PING_INTERVAL:
		ping_elapsed = 0.0
		room.send("ping")

func _process(delta: float) -> void:
	if room != null and room.has_joined():
		move_cooldown_remaining = maxf(0.0, move_cooldown_remaining - delta)
		_handle_grid_movement_input()

	_smooth_avatar_positions(delta)
	_sync_camera_to_local_avatar()
	_update_world_actions()

func _grid_timing_scale() -> float:
	return pow(maxf(WorldConfig.cell_size() / BASE_GRID_TIMING_CELL_SIZE, 0.001), GRID_TIMING_SCALE_EXPONENT)

func _grid_move_repeat_seconds(is_sprinting := false) -> float:
	var base_duration := BASE_SPRINT_GRID_MOVE_REPEAT_SECONDS if is_sprinting else BASE_GRID_MOVE_REPEAT_SECONDS
	return base_duration * _grid_timing_scale()

func _cell_transition_duration(is_sprinting := false) -> float:
	# Slight overlap keeps step-to-step motion continuous instead of briefly stopping
	# between accepted grid moves when the key is held.
	var base_duration := BASE_SPRINT_CELL_TRANSITION_DURATION if is_sprinting else BASE_CELL_TRANSITION_DURATION
	return (base_duration * _grid_timing_scale()) * VISUAL_STEP_OVERLAP_RATIO

func _begin_auto_connect() -> void:
	if _has_reconnection_token():
		await _reconnect_to_world(true)
		if room != null and room.has_joined():
			return

	if _has_session_token():
		await _connect_to_world()
		if room != null and room.has_joined():
			return

	_show_auth_gate("Войдите по почте и паролю. Если аккаунта ещё нет, откройте сайт и зарегистрируйтесь.")

func _connect_to_world() -> void:
	if not _has_session_token():
		_show_auth_gate("Для входа нужен аккаунт.")
		return

	is_connecting = true

	if room == null and not avatars.is_empty():
		_clear_world()

	_show_auth_gate("Подключаемся к игровому серверу...")
	_set_auth_controls_enabled(false)
	_set_connection_state(
		ConnectionState.CONNECTING,
		"Connecting to %s ..." % server_endpoint
	)

	client = colyseus.Client.new(server_endpoint)
	var promise = client.join(RoomState, ROOM_NAME, {
		"sessionToken": current_session_token,
	})

	await promise.completed

	is_connecting = false

	if promise.get_state() == promise.State.Failed:
		var error_text := str(promise.get_error())
		_detach_room_runtime()

		if _is_auth_failure_error(error_text):
			_clear_reconnection_token()
			_clear_session_token()
			_clear_world()
			_set_connection_state(ConnectionState.FAILED, "Authentication required.")
			_show_auth_gate("Сессия истекла или недействительна. Войдите снова.")
			return

		_set_connection_state(ConnectionState.FAILED, "Connect failed: %s. Retrying in %.1fs." % [error_text, AUTO_CONNECT_RETRY_SECONDS])
		_show_auth_gate("Сервер недоступен. Повторяем подключение...")
		_queue_auto_connect_retry()
		return

	_activate_room(promise.get_data(), false)
	_set_connection_state(ConnectionState.CONNECTED, "Connected to %s." % ROOM_NAME)

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
			_set_connection_state(ConnectionState.FAILED, "Reconnect expired.")
			if _has_session_token():
				await _connect_to_world()
			else:
				_show_auth_gate("Войдите снова, чтобы продолжить.")
		elif _is_auth_failure_error(error_text):
			_clear_reconnection_token()
			_clear_session_token()
			_clear_world()
			_set_connection_state(ConnectionState.FAILED, "Authentication required.")
			_show_auth_gate("Сессия истекла или недействительна. Войдите снова.")
		else:
			_set_connection_state(
				ConnectionState.FAILED,
				"Reconnect failed: %s. Retrying in %.1fs." % [error_text, AUTO_CONNECT_RETRY_SECONDS]
			)
			_show_auth_gate("Не удалось восстановить соединение. Повторяем попытку...")
			_queue_auto_connect_retry()

		return

	_activate_room(promise.get_data(), true)
	_set_connection_state(ConnectionState.CONNECTED, "Reconnected to %s as %s." % [ROOM_NAME, _display_player_name_from_id(local_player_id)])

func _activate_room(next_room: colyseus.Room, is_reconnect: bool) -> void:
	room = next_room
	local_session_id = room.session_id
	local_authoritative_position = Vector2.ZERO
	has_local_authoritative_position = false
	local_pending_steps.clear()
	ping_elapsed = 0.0
	last_pong_text = "reconnected" if is_reconnect else "waiting"
	held_move_direction = Vector2.ZERO
	last_cardinal_direction = Vector2.ZERO
	move_cooldown_remaining = 0.0
	local_facing = "right"
	last_sent_facing = ""

	_store_reconnection_token(room.reconnection_token)
	_bind_room_events()
	world_view.grab_world_focus()
	_hide_auth_gate()

func _bind_room_events() -> void:
	var state = room.get_state()

	room.on_error.on(Callable(self, "_on_room_error"))
	room.on_leave.on(Callable(self, "_on_room_leave"))
	room.on_state_change.on(Callable(self, "_on_state_change"))
	room.on_message("pong").on(Callable(self, "_on_pong"))
	room.on_message("search-prey-result").on(Callable(self, "_on_search_prey_result"))
	room.on_message("prey-captured").on(Callable(self, "_on_prey_captured"))
	room.on_message("prey-picked-up").on(Callable(self, "_on_prey_picked_up"))

	state.listen("players:add").on(Callable(self, "_on_player_added"))
	state.listen("players:remove").on(Callable(self, "_on_player_removed"))
	state.listen("players:clear").on(Callable(self, "_on_players_cleared"))
	state.listen("prey:add").on(Callable(self, "_on_prey_added"))
	state.listen("prey:remove").on(Callable(self, "_on_prey_removed"))
	state.listen("prey:clear").on(Callable(self, "_on_prey_cleared"))
	_sync_all_players()
	_sync_all_prey()

func _on_room_error(code: int, message: String) -> void:
	var error_text := "Room error %d: %s" % [code, message]
	if room != null and room.has_joined() and _has_reconnection_token():
		_set_connection_state(ConnectionState.RECONNECTING, error_text)
	else:
		_set_connection_state(ConnectionState.FAILED, "%s. Retrying in %.1fs." % [error_text, AUTO_CONNECT_RETRY_SECONDS])
		_queue_auto_connect_retry()

func _on_room_leave() -> void:
	_detach_room_runtime()

	if _has_reconnection_token():
		_set_connection_state(ConnectionState.RECONNECTING, "Connection lost. Reconnecting...")
		call_deferred("_auto_reconnect_after_drop")
	else:
		_clear_world()
		_set_connection_state(ConnectionState.FAILED, "Connection lost. Retrying in %.1fs." % AUTO_CONNECT_RETRY_SECONDS)
		_queue_auto_connect_retry()

func _auto_reconnect_after_drop() -> void:
	if is_connecting or room != null or not _has_reconnection_token():
		return

	await _reconnect_to_world(true)

func _on_state_change(_state) -> void:
	_sync_all_players()
	_sync_all_prey()
	_refresh_debug_info()

func _on_pong(data: Dictionary) -> void:
	last_pong_text = "pong %s" % str(data.get("serverTime", "ok"))
	_refresh_debug_info()

func _on_search_prey_result(data: Dictionary) -> void:
	var ok := bool(data.get("ok", false))
	var spawned := bool(data.get("spawned", false))
	var zone_id := str(data.get("searchZoneId", "")).strip_edges()
	var spawn_x := float(data.get("x", 0.0))
	var spawn_y := float(data.get("y", 0.0))

	if ok and spawned:
		print("[hunt] Prey spawned in zone %s at (%.0f, %.0f)." % [
			zone_id if not zone_id.is_empty() else "<unnamed>",
			spawn_x,
			spawn_y,
		])
		return

	if ok:
		print("[hunt] Search finished in zone %s, but no prey appeared." % (zone_id if not zone_id.is_empty() else "<unnamed>"))
		return

	print("[hunt] Search failed: %s" % str(data.get("error", "unknown error")))

func _on_prey_captured(data: Dictionary) -> void:
	print("[hunt] Prey %s was captured at (%.0f, %.0f)." % [
		str(data.get("preyId", "")),
		float(data.get("x", 0.0)),
		float(data.get("y", 0.0)),
	])

func _on_prey_picked_up(data: Dictionary) -> void:
	print("[hunt] Carcass %s was picked up." % str(data.get("preyId", "")))

func _on_player_added(_target, player: Player, player_id: String) -> void:
	_register_player(player_id, player)
	_refresh_debug_info()

func _on_player_removed(_target, _player: Player, player_id: String) -> void:
	_remove_avatar(player_id)
	_refresh_debug_info()

func _on_players_cleared(_target) -> void:
	_clear_world()
	_refresh_debug_info()

func _on_prey_added(_target, prey: Prey, prey_id: String) -> void:
	_register_prey(prey_id, prey)
	print("[hunt] Prey %s visible at (%.0f, %.0f)." % [prey_id, prey.x, prey.y])

func _on_prey_removed(_target, _prey: Prey, prey_id: String) -> void:
	_remove_prey_avatar(prey_id)

func _on_prey_cleared(_target) -> void:
	_clear_prey()

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

func _sync_all_prey() -> void:
	if room == null:
		return

	var state = room.get_state()
	var prey_map = _get_prey_map(state)
	if prey_map == null:
		return

	for prey_id in prey_map.keys():
		var prey = prey_map.at(prey_id)
		_register_prey(prey_id, prey)

func _register_player(player_id: String, player: Player) -> void:
	if player == null:
		return

	var avatar = avatars.get(player_id)
	var is_new_avatar := avatar == null
	if avatar == null:
		avatar = PlayerAvatarScene.instantiate()
		avatar.name = "PlayerAvatar_%s" % player_id
		world_view.players_layer.add_child(avatar)
		avatars[player_id] = avatar

	var is_local_avatar := _is_local_player(player_id, player)
	avatar.configure(_display_player_name(player), is_local_avatar)
	avatar.modulate = Color(1, 1, 1, 1.0 if player.connected else 0.55)
	_apply_player_appearance(player_id, avatar, player)
	if avatar.has_method("set_facing"):
		avatar.set_facing(_normalize_player_facing(player))

	var position := Vector2(player.x, player.y)
	if is_local_avatar:
		_store_local_player_identity(player_id, player, is_new_avatar)
	else:
		_set_avatar_target(player_id, position, is_new_avatar, _transition_duration_for_player(player))

func _apply_player_appearance(player_id: String, avatar, player: Player) -> void:
	if avatar == null or player == null or not avatar.has_method("apply_appearance_json"):
		return

	var appearance_json := str(player.appearanceJson).strip_edges()
	var previous_json := str(avatar_appearance_jsons.get(player_id, ""))
	if appearance_json == previous_json:
		return

	avatar_appearance_jsons[player_id] = appearance_json
	avatar.apply_appearance_json(appearance_json)

func _set_avatar_target(player_id: String, world_position: Vector2, snap_to_target := false, transition_duration := -1.0) -> void:
	var avatar = avatars.get(player_id)
	if avatar == null:
		return

	avatar_world_positions[player_id] = world_position
	var current_target: Vector2 = avatar_target_positions.get(player_id, avatar.position)
	if snap_to_target:
		avatar_step_distances[player_id] = 0.0
	elif current_target != world_position:
		var step_distance := current_target.distance_to(world_position)
		if step_distance <= 1.0:
			step_distance = avatar.position.distance_to(world_position)
		avatar_step_distances[player_id] = maxf(step_distance, WorldConfig.cell_size())

	avatar_target_positions[player_id] = world_position
	avatar_step_durations[player_id] = transition_duration if transition_duration > 0.0 else _cell_transition_duration()
	if avatar.has_method("set_moving"):
		avatar.set_moving(not snap_to_target and avatar.position.distance_to(world_position) > 1.0)

	if snap_to_target:
		avatar.position = world_position

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
	avatar_appearance_jsons.erase(player_id)
	avatar_target_positions.erase(player_id)
	avatar_world_positions.erase(player_id)
	avatar_step_distances.erase(player_id)
	avatar_step_durations.erase(player_id)
	avatar.queue_free()

func _register_prey(prey_id: String, prey: Prey) -> void:
	if prey == null:
		return

	var prey_avatar = prey_avatars.get(prey_id)
	if prey_avatar == null:
		prey_avatar = PreyAvatarScene.instantiate()
		prey_avatar.name = "PreyAvatar_%s" % prey_id
		var prey_preview = world_view.npc_layer.get_node_or_null("PreyPreview")
		if prey_preview != null and prey_avatar.has_method("copy_visual_from"):
			prey_avatar.copy_visual_from(prey_preview)
		world_view.npc_layer.add_child(prey_avatar)
		prey_avatars[prey_id] = prey_avatar

	if prey_avatar.has_method("configure"):
		prey_avatar.configure(str(prey.kind), str(prey.state))

	prey_avatar.position = Vector2(prey.x, prey.y)

func _remove_prey_avatar(prey_id: String) -> void:
	var prey_avatar = prey_avatars.get(prey_id)
	if prey_avatar == null:
		return

	prey_avatars.erase(prey_id)
	prey_avatar.queue_free()

func _clear_prey() -> void:
	for prey_id in prey_avatars.keys():
		var prey_avatar = prey_avatars[prey_id]
		if prey_avatar != null:
			prey_avatar.queue_free()

	prey_avatars.clear()

func _clear_world() -> void:
	for player_id in avatars.keys():
		var avatar = avatars[player_id]
		if avatar != null:
			avatar.queue_free()

	avatars.clear()
	avatar_appearance_jsons.clear()
	avatar_target_positions.clear()
	avatar_world_positions.clear()
	avatar_step_distances.clear()
	avatar_step_durations.clear()
	_clear_prey()
	local_player_id = ""
	local_position = Vector2.ZERO
	local_authoritative_position = Vector2.ZERO
	has_local_authoritative_position = false
	local_pending_steps.clear()
	current_player_name = ""
	active_prey_search_zone = null
	local_facing = "right"
	last_sent_facing = ""
	local_stamina = MAX_STAMINA
	local_is_sprinting = false
	world_view.reset_camera()
	_update_stamina_ui()
	_update_action_ui()
	_refresh_debug_info()

func _detach_room_runtime() -> void:
	room = null
	client = null
	local_session_id = ""
	local_authoritative_position = Vector2.ZERO
	has_local_authoritative_position = false
	local_pending_steps.clear()
	ping_elapsed = 0.0
	last_pong_text = "waiting"
	held_move_direction = Vector2.ZERO
	last_cardinal_direction = Vector2.ZERO
	move_cooldown_remaining = 0.0
	local_stamina = MAX_STAMINA
	local_is_sprinting = false
	_update_stamina_ui()
	_update_action_ui()

func _set_connection_state(next_state: int, detail: String = "") -> void:
	connection_state = next_state
	status_detail = detail
	print("[network] %s" % _format_status_text())

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
	pass

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
	else:
		if not OS.has_feature("web") and not OS.has_feature("editor"):
			var bundled_config := ConfigFile.new()
			if bundled_config.load(SERVER_CONFIG_PATH) == OK:
				server_endpoint = _sanitize_server_endpoint(str(
					bundled_config.get_value(SERVER_CONFIG_SECTION, SERVER_ENDPOINT_KEY, server_endpoint)
				))

	api_base_url = _build_runtime_api_base_url()
	site_url = _build_runtime_site_url()

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

func _build_runtime_api_base_url() -> String:
	if OS.has_feature("web"):
		var browser_host := str(JavaScriptBridge.eval("window.location.host"))
		var browser_protocol := str(JavaScriptBridge.eval("window.location.protocol"))
		if not browser_host.is_empty():
			return ("%s//%s" % [browser_protocol, browser_host]).trim_suffix("/")

	if server_endpoint.begins_with("wss://"):
		return "https://" + server_endpoint.trim_prefix("wss://")
	if server_endpoint.begins_with("ws://"):
		return "http://" + server_endpoint.trim_prefix("ws://")
	return DEFAULT_API_BASE_URL

func _build_runtime_site_url() -> String:
	if OS.has_feature("web"):
		var browser_host := str(JavaScriptBridge.eval("window.location.host"))
		var browser_protocol := str(JavaScriptBridge.eval("window.location.protocol"))
		if not browser_host.is_empty():
			return ("%s//%s" % [browser_protocol, browser_host]).trim_suffix("/")
	return DEFAULT_SITE_URL

func _load_local_profile() -> void:
	var config := ConfigFile.new()
	if config.load(SETTINGS_PATH) == OK:
		current_reconnection_token = str(config.get_value(SETTINGS_SECTION, SETTINGS_RECONNECT_TOKEN_KEY, ""))
		current_session_token = str(config.get_value(SETTINGS_SECTION, SETTINGS_SESSION_TOKEN_KEY, ""))

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

func _generate_random_player_name() -> String:
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var result := ""

	for _i in RANDOM_NAME_LENGTH:
		var char_index := rng.randi_range(0, RANDOM_NAME_ALPHABET.length() - 1)
		result += RANDOM_NAME_ALPHABET[char_index]

	return _sanitize_name(result)

func _is_local_player(player_id: String, player: Player) -> bool:
	if player_id == local_player_id:
		return true

	return str(player.sessionId) == local_session_id

func _store_local_player_identity(player_id: String, player: Player, is_new_avatar: bool) -> void:
	local_player_id = player_id

	local_session_id = str(player.sessionId)
	local_facing = _normalize_player_facing(player)
	last_sent_facing = local_facing
	local_stamina = _normalize_player_stamina(player)
	local_is_sprinting = _normalize_player_sprinting(player)
	_update_stamina_ui()
	var server_position := Vector2(player.x, player.y)
	current_player_name = _display_player_name(player)

	if is_new_avatar or not has_local_authoritative_position:
		has_local_authoritative_position = true
		local_authoritative_position = server_position
		local_pending_steps.clear()
		local_position = server_position
		_set_avatar_target(player_id, server_position, true, _transition_duration_for_player(player))
		world_view.set_camera_target(server_position, true)
		return

	_reconcile_local_authoritative_position(player_id, player, server_position)

func _display_player_name_from_id(player_id: String) -> String:
	var avatar = avatars.get(player_id)
	if avatar != null and avatar.has_method("get_display_name"):
		return str(avatar.get_display_name())
	return current_player_name

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

func _handle_grid_movement_input() -> void:
	var held_direction := _read_current_grid_direction()
	if held_direction == Vector2.ZERO:
		held_move_direction = Vector2.ZERO
		local_is_sprinting = false
		return

	held_move_direction = held_direction
	_apply_facing_from_direction(held_direction)
	var wants_sprint := _wants_sprint()

	if move_cooldown_remaining > 0.0:
		return

	_send_grid_move(held_direction, wants_sprint)
	move_cooldown_remaining = _grid_move_repeat_seconds(wants_sprint)

func _read_current_grid_direction() -> Vector2:
	var diagonal_direction := _read_explicit_diagonal_direction()
	if diagonal_direction != Vector2.ZERO:
		return diagonal_direction

	return _read_cardinal_direction()

func _read_explicit_diagonal_direction() -> Vector2:
	if Input.is_action_pressed(MOVE_UP_LEFT_ACTION):
		return Vector2(-1, -1)
	if Input.is_action_pressed(MOVE_UP_RIGHT_ACTION):
		return Vector2(1, -1)
	if Input.is_action_pressed(MOVE_DOWN_LEFT_ACTION):
		return Vector2(-1, 1)
	if Input.is_action_pressed(MOVE_DOWN_RIGHT_ACTION):
		return Vector2(1, 1)
	return Vector2.ZERO

func _read_cardinal_direction() -> Vector2:
	var just_pressed_direction := _read_just_pressed_cardinal_direction()
	if just_pressed_direction != Vector2.ZERO:
		last_cardinal_direction = just_pressed_direction
		return just_pressed_direction

	var held_cardinal_directions: Array[Vector2] = []
	if Input.is_action_pressed(MOVE_LEFT_ACTION):
		held_cardinal_directions.append(Vector2.LEFT)
	if Input.is_action_pressed(MOVE_RIGHT_ACTION):
		held_cardinal_directions.append(Vector2.RIGHT)
	if Input.is_action_pressed(MOVE_UP_ACTION):
		held_cardinal_directions.append(Vector2.UP)
	if Input.is_action_pressed(MOVE_DOWN_ACTION):
		held_cardinal_directions.append(Vector2.DOWN)

	if held_cardinal_directions.is_empty():
		last_cardinal_direction = Vector2.ZERO
		return Vector2.ZERO

	for direction in held_cardinal_directions:
		if direction == last_cardinal_direction:
			return direction

	last_cardinal_direction = held_cardinal_directions[0]
	return last_cardinal_direction

func _read_just_pressed_cardinal_direction() -> Vector2:
	if Input.is_action_just_pressed(MOVE_LEFT_ACTION):
		return Vector2.LEFT
	if Input.is_action_just_pressed(MOVE_RIGHT_ACTION):
		return Vector2.RIGHT
	if Input.is_action_just_pressed(MOVE_UP_ACTION):
		return Vector2.UP
	if Input.is_action_just_pressed(MOVE_DOWN_ACTION):
		return Vector2.DOWN
	return Vector2.ZERO

func _send_grid_move(direction: Vector2, is_sprinting := false) -> void:
	if room == null or not room.has_joined():
		return

	_predict_local_grid_move(direction, is_sprinting)

	room.send("move", {
		"x": int(direction.x),
		"y": int(direction.y),
		"sprint": is_sprinting,
	})

func _smooth_avatar_positions(delta: float) -> void:
	if avatars.is_empty():
		return

	for player_id in avatars.keys():
		var avatar: Node2D = avatars.get(player_id)
		if avatar == null or not avatar_target_positions.has(player_id):
			continue

		var target_position: Vector2 = avatar_target_positions[player_id]
		var step_distance: float = avatar_step_distances.get(player_id, WorldConfig.cell_size())
		var transition_duration: float = avatar_step_durations.get(player_id, _cell_transition_duration())
		var transition_speed := step_distance / maxf(transition_duration, 0.001)
		var is_moving := avatar.position.distance_to(target_position) > 1.0
		avatar.position = avatar.position.move_toward(target_position, transition_speed * delta)

		if avatar.position.distance_to(target_position) <= 1.0:
			avatar.position = target_position
			is_moving = false

		if avatar.has_method("set_moving"):
			avatar.set_moving(is_moving)

func _predict_local_grid_move(direction: Vector2, is_sprinting := false) -> void:
	if local_player_id.is_empty() or not avatars.has(local_player_id):
		return

	_apply_facing_from_direction(direction)
	var predicted_position := local_position + (direction * WorldConfig.cell_size())
	if not WorldConfig.is_walkable_position(predicted_position):
		return

	local_pending_steps.append(direction)
	local_position = predicted_position
	local_is_sprinting = is_sprinting
	_set_avatar_target(local_player_id, predicted_position, false, _cell_transition_duration(is_sprinting))

func _sync_camera_to_local_avatar() -> void:
	if local_player_id.is_empty():
		return

	var avatar := avatars.get(local_player_id) as Node2D
	if avatar == null:
		return

	world_view.set_camera_target(avatar.global_position)

func _resnap_camera_to_local_avatar() -> void:
	if local_player_id.is_empty():
		return

	var avatar := avatars.get(local_player_id) as Node2D
	if avatar == null:
		return

	world_view.set_camera_target(avatar.global_position, true)

func _get_players_map(state):
	if state == null:
		return null

	if state.has_method("meta_get"):
		return state.meta_get(0)

	return null

func _get_prey_map(state):
	if state == null:
		return null

	if state.has_method("meta_get"):
		return state.meta_get(1)

	return null

func _queue_auto_connect_retry() -> void:
	if auto_connect_retry_scheduled:
		return

	auto_connect_retry_scheduled = true
	call_deferred("_run_auto_connect_retry")

func _run_auto_connect_retry() -> void:
	await get_tree().create_timer(AUTO_CONNECT_RETRY_SECONDS).timeout
	auto_connect_retry_scheduled = false

	if is_connecting or (room != null and room.has_joined()):
		return

	if _has_reconnection_token():
		await _reconnect_to_world(true)
	elif _has_session_token():
		await _connect_to_world()
	else:
		_show_auth_gate("Войдите по почте и паролю.")

func _reconcile_local_authoritative_position(player_id: String, player: Player, server_position: Vector2) -> void:
	if not has_local_authoritative_position:
		has_local_authoritative_position = true
		local_authoritative_position = server_position
		local_pending_steps.clear()
		local_position = server_position
		_set_avatar_target(player_id, server_position, true, _transition_duration_for_player(player))
		return

	if _is_same_grid_position(server_position, local_authoritative_position):
		return

	var cursor := local_authoritative_position
	var consumed_steps := 0
	var found_match := false

	for pending_step in local_pending_steps:
		cursor += pending_step * WorldConfig.cell_size()
		consumed_steps += 1
		if _is_same_grid_position(cursor, server_position):
			found_match = true
			break

	local_authoritative_position = server_position

	if found_match:
		for _i in consumed_steps:
			local_pending_steps.remove_at(0)

		local_position = _build_predicted_local_position()
		_set_avatar_target(player_id, local_position, false, _transition_duration_for_player(player))
		return

	local_pending_steps.clear()
	local_position = server_position
	_set_avatar_target(player_id, server_position, false, _transition_duration_for_player(player))

func _build_predicted_local_position() -> Vector2:
	var predicted_position := local_authoritative_position
	for pending_step in local_pending_steps:
		predicted_position += pending_step * WorldConfig.cell_size()
	return predicted_position

func _is_same_grid_position(a: Vector2, b: Vector2) -> bool:
	return a.distance_to(b) <= GRID_POSITION_EPSILON

func _normalize_player_stamina(player: Player) -> float:
	if player == null:
		return MAX_STAMINA

	return clampf(float(player.stamina), 0.0, MAX_STAMINA)

func _normalize_player_sprinting(player: Player) -> bool:
	return player != null and bool(player.sprinting) and _normalize_player_stamina(player) > 0.0

func _transition_duration_for_player(player: Player) -> float:
	return _cell_transition_duration(_normalize_player_sprinting(player))

func _wants_sprint() -> bool:
	return Input.is_action_pressed(MOVE_SPRINT_ACTION) and local_stamina >= MIN_STAMINA_TO_SPRINT

func _update_stamina_ui() -> void:
	if stamina_hud == null or stamina_label == null or stamina_bar == null:
		return

	var clamped_stamina := clampf(local_stamina, 0.0, MAX_STAMINA)
	stamina_bar.min_value = 0.0
	stamina_bar.max_value = MAX_STAMINA
	stamina_bar.value = clamped_stamina
	stamina_label.text = "Stamina %d%%" % int(round(clamped_stamina))

	if clamped_stamina <= 20.0:
		stamina_bar.modulate = Color(0.96, 0.45, 0.38, 1.0)
	elif clamped_stamina <= 45.0:
		stamina_bar.modulate = Color(0.94, 0.77, 0.39, 1.0)
	else:
		stamina_bar.modulate = Color(0.78, 0.91, 0.67, 1.0)

func _ensure_move_input_actions() -> void:
	_ensure_move_input_action(MOVE_UP_ACTION, [Key.KEY_W])
	_ensure_move_input_action(MOVE_DOWN_ACTION, [Key.KEY_S])
	_ensure_move_input_action(MOVE_LEFT_ACTION, [Key.KEY_A])
	_ensure_move_input_action(MOVE_RIGHT_ACTION, [Key.KEY_D])
	_ensure_move_input_action(MOVE_UP_LEFT_ACTION, [Key.KEY_Q])
	_ensure_move_input_action(MOVE_UP_RIGHT_ACTION, [Key.KEY_E])
	_ensure_move_input_action(MOVE_DOWN_LEFT_ACTION, [Key.KEY_Z])
	_ensure_move_input_action(MOVE_DOWN_RIGHT_ACTION, [Key.KEY_X])
	_ensure_modifier_input_action(MOVE_SPRINT_ACTION, [Key.KEY_SHIFT])

func _ensure_move_input_action(action_name: StringName, physical_keys: Array) -> void:
	if not InputMap.has_action(action_name):
		InputMap.add_action(action_name)

	var existing_keys := {}
	for event in InputMap.action_get_events(action_name):
		if event is InputEventKey:
			existing_keys[int(event.physical_keycode)] = true

	for physical_key in physical_keys:
		if existing_keys.has(int(physical_key)):
			continue

		var input_event := InputEventKey.new()
		input_event.physical_keycode = int(physical_key)
		InputMap.action_add_event(action_name, input_event)

func _ensure_modifier_input_action(action_name: StringName, key_codes: Array) -> void:
	if not InputMap.has_action(action_name):
		InputMap.add_action(action_name)

	var existing_keys := {}
	for event in InputMap.action_get_events(action_name):
		if event is InputEventKey:
			existing_keys[int(event.keycode)] = true

	for key_code in key_codes:
		if existing_keys.has(int(key_code)):
			continue

		var input_event := InputEventKey.new()
		input_event.keycode = int(key_code)
		InputMap.action_add_event(action_name, input_event)

func _configure_auth_ui() -> void:
	auth_overlay.visible = false
	auth_title_label.text = "Вход в игру"
	auth_email_input.placeholder_text = "Email"
	auth_password_input.placeholder_text = "Пароль"
	auth_password_input.secret = true
	auth_login_button.text = "Войти"
	auth_site_button.text = "Регистрация"
	auth_status_label.text = ""
	auth_login_button.pressed.connect(_perform_auth_login)
	auth_site_button.pressed.connect(_open_site_registration)
	auth_email_input.text_submitted.connect(_on_auth_email_submitted)
	auth_password_input.text_submitted.connect(_on_auth_password_submitted)

func _configure_action_ui() -> void:
	action_overlay.visible = false
	action_bottom_center.visible = false
	stamina_hud.visible = false
	stamina_label.text = "Stamina 100%"
	stamina_bar.show_percentage = false
	stamina_bar.value = MAX_STAMINA
	_update_stamina_ui()
	search_prey_button.text = "Искать дичь"
	search_prey_button.pressed.connect(_on_search_prey_pressed)

func _update_world_actions() -> void:
	active_prey_search_zone = _find_active_prey_search_zone()
	_update_action_ui()

func _update_action_ui() -> void:
	var has_world_runtime := room != null and room.has_joined() and not auth_overlay.visible
	var can_show_search := has_world_runtime and active_prey_search_zone != null
	var can_show_stamina := has_world_runtime and not local_player_id.is_empty()
	action_bottom_center.visible = can_show_search
	stamina_hud.visible = can_show_stamina
	action_overlay.visible = can_show_search or can_show_stamina

	if not can_show_search:
		search_prey_button.tooltip_text = ""
		return

	search_prey_button.text = "Искать дичь"
	var zone_id := _get_active_prey_search_zone_id()
	search_prey_button.tooltip_text = "" if zone_id.is_empty() else "Зона: %s" % zone_id

func _find_active_prey_search_zone():
	if local_player_id.is_empty():
		return null

	var avatar := avatars.get(local_player_id) as Node2D
	if avatar == null:
		return null

	for child in world_view.prey_search_zones_layer.get_children():
		if not child.has_method("contains_world_position"):
			continue

		if child.contains_world_position(avatar.global_position):
			return child

	return null

func _on_search_prey_pressed() -> void:
	if active_prey_search_zone == null:
		return

	var zone_id := _get_active_prey_search_zone_id()
	if zone_id.is_empty():
		return

	if room == null or not room.has_joined():
		return

	room.send("search-prey", {
		"searchZoneId": zone_id,
	})
	print("[hunt] Search prey requested in zone %s." % zone_id)

func _get_active_prey_search_zone_id() -> String:
	if active_prey_search_zone == null:
		return ""

	return str(active_prey_search_zone.get("search_zone_id")).strip_edges()

func _apply_facing_from_direction(direction: Vector2) -> void:
	if direction.x == 0:
		return

	var next_facing := "left" if direction.x < 0 else "right"
	if local_facing == next_facing and last_sent_facing == next_facing:
		return

	local_facing = next_facing

	var avatar := avatars.get(local_player_id) as Node
	if avatar != null and avatar.has_method("set_facing"):
		avatar.set_facing(local_facing)

	if room != null and room.has_joined() and last_sent_facing != local_facing:
		room.send("face", {
			"x": int(sign(direction.x)),
		})
		last_sent_facing = local_facing

func _normalize_player_facing(player: Player) -> String:
	if player == null:
		return "right"

	var facing := str(player.facing).strip_edges().to_lower()
	return "left" if facing == "left" else "right"

func _refresh_auth_copy() -> void:
	auth_description_label.text = "Если аккаунта ещё нет, откройте сайт и зарегистрируйтесь."

func _show_auth_gate(message := "") -> void:
	auth_overlay.visible = true
	_update_action_ui()
	_set_auth_controls_enabled(not auth_login_in_progress and not is_connecting and room == null)
	if not message.is_empty():
		_set_auth_status(message)
	if auth_email_input.text.strip_edges().is_empty():
		auth_email_input.grab_focus()
	else:
		auth_password_input.grab_focus()

func _hide_auth_gate() -> void:
	auth_overlay.visible = false
	auth_status_label.text = ""
	_update_action_ui()

func _set_auth_controls_enabled(is_enabled: bool) -> void:
	auth_email_input.editable = is_enabled
	auth_password_input.editable = is_enabled
	auth_login_button.disabled = not is_enabled
	auth_site_button.disabled = false

func _set_auth_status(text: String, is_error := false) -> void:
	auth_status_label.text = text
	auth_status_label.modulate = Color("ffb4ab") if is_error else Color("f4e7d7")

func _has_session_token() -> bool:
	return not current_session_token.strip_edges().is_empty()

func _store_session_token(token: String, sync_to_web := true) -> void:
	current_session_token = token.strip_edges()
	local_player_id = ""
	current_player_name = ""
	_save_profile_value(SETTINGS_SESSION_TOKEN_KEY, current_session_token)
	if sync_to_web and OS.has_feature("web"):
		var script := "window.localStorage.setItem(%s, %s);" % [
			JSON.stringify(SITE_SESSION_STORAGE_KEY),
			JSON.stringify(current_session_token),
		]
		JavaScriptBridge.eval(script)

func _clear_session_token() -> void:
	current_session_token = ""
	local_player_id = ""
	current_player_name = ""
	_save_profile_value(SETTINGS_SESSION_TOKEN_KEY, "")
	if OS.has_feature("web"):
		var script := "window.localStorage.removeItem(%s);" % JSON.stringify(SITE_SESSION_STORAGE_KEY)
		JavaScriptBridge.eval(script)

func _sync_session_token_from_web_storage() -> void:
	if not OS.has_feature("web"):
		return

	var script := "window.localStorage.getItem(%s) || '';" % JSON.stringify(SITE_SESSION_STORAGE_KEY)
	var stored_token := str(JavaScriptBridge.eval(script)).strip_edges()
	if stored_token.is_empty() or stored_token == current_session_token:
		return

	_clear_reconnection_token()
	_store_session_token(stored_token, false)

func _perform_auth_login() -> void:
	if auth_login_in_progress or is_connecting:
		return

	var email := auth_email_input.text.strip_edges()
	var password := auth_password_input.text
	if email.is_empty() or password.is_empty():
		_set_auth_status("Введите email и пароль.", true)
		return

	auth_login_in_progress = true
	_set_auth_controls_enabled(false)
	_set_auth_status("Проверяем данные...")

	var request_error := auth_request.request(
		api_base_url + AUTH_LOGIN_PATH,
		PackedStringArray([
			"Content-Type: application/json",
			"Accept: application/json",
		]),
		HTTPClient.METHOD_POST,
		JSON.stringify({
			"email": email,
			"password": password,
		})
	)

	if request_error != OK:
		auth_login_in_progress = false
		_set_auth_controls_enabled(true)
		_set_auth_status("Не удалось отправить запрос на вход.", true)
		return

	var response = await auth_request.request_completed
	auth_login_in_progress = false

	var result: int = response[0]
	var response_code: int = response[1]
	var body: PackedByteArray = response[3]

	if result != HTTPRequest.RESULT_SUCCESS:
		_set_auth_controls_enabled(true)
		_set_auth_status("Сайт или API сейчас недоступны.", true)
		return

	var payload = JSON.parse_string(body.get_string_from_utf8())
	if payload == null or typeof(payload) != TYPE_DICTIONARY:
		_set_auth_controls_enabled(true)
		_set_auth_status("Сервер вернул некорректный ответ.", true)
		return

	var response_data: Dictionary = payload
	if response_code < 200 or response_code >= 300 or not bool(response_data.get("ok", false)):
		var error_text := str(response_data.get("error", "Не удалось войти."))
		_set_auth_controls_enabled(true)
		_set_auth_status(error_text, true)
		return

	var session_token := str(response_data.get("sessionToken", "")).strip_edges()
	if session_token.is_empty():
		_set_auth_controls_enabled(true)
		_set_auth_status("Сервер не вернул session token.", true)
		return

	_clear_reconnection_token()
	_store_session_token(session_token)
	auth_password_input.text = ""
	_set_auth_status("Вход выполнен. Подключаемся...")
	await _connect_to_world()

func _on_auth_email_submitted(_text: String) -> void:
	auth_password_input.grab_focus()

func _on_auth_password_submitted(_text: String) -> void:
	_perform_auth_login()

func _open_site_registration() -> void:
	if OS.has_feature("web"):
		var script := "window.open(%s, '_blank');" % JSON.stringify(site_url)
		JavaScriptBridge.eval(script)
		return

	OS.shell_open(site_url)

func _is_auth_failure_error(error_text: String) -> bool:
	var lowered := error_text.to_lower()
	return (
		lowered.contains("auth")
		or lowered.contains("session token")
		or lowered.contains("unauthorized")
		or lowered.contains("forbidden")
		or lowered.contains("authentication required")
		or lowered.contains("[401]")
	)
