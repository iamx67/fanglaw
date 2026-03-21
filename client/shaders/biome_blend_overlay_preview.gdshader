shader_type canvas_item;
render_mode unshaded, blend_mix;

uniform sampler2D noise_texture : repeat_enable, filter_linear_mipmap;

uniform float blend_angle_degrees = 0.0;
uniform float blend_center : hint_range(0.0, 1.0) = 0.5;
uniform float blend_width : hint_range(0.01, 1.0) = 0.28;
uniform float edge_softness : hint_range(0.0, 0.5) = 0.16;
uniform float outer_fade : hint_range(0.0, 0.45) = 0.06;
uniform float noise_scale : hint_range(0.1, 32.0) = 4.0;
uniform float noise_strength : hint_range(0.0, 0.5) = 0.16;
uniform vec4 overlay_tint : source_color = vec4(0.42, 0.44, 0.30, 0.36);
uniform vec4 overlay_tint_secondary : source_color = vec4(0.30, 0.34, 0.22, 0.26);
uniform float tint_noise_scale : hint_range(0.1, 16.0) = 2.2;
uniform float alpha_noise_strength : hint_range(0.0, 0.8) = 0.28;

void fragment() {
	float angle = radians(blend_angle_degrees);
	vec2 axis = vec2(cos(angle), sin(angle));
	vec2 centered_uv = UV - vec2(0.5);
	float band_position = dot(centered_uv, axis) + 0.5;

	float sampled_noise = texture(noise_texture, UV * noise_scale).r - 0.5;
	float threshold = blend_center + sampled_noise * noise_strength;
	float half_width = max(blend_width * 0.5, 0.001);
	float softness = max(edge_softness, 0.001);
	float band_distance = abs(band_position - threshold);
	float band_alpha = 1.0 - smoothstep(half_width, half_width + softness, band_distance);

	vec2 edge_uv = min(UV, vec2(1.0) - UV);
	float outer_alpha = 1.0;
	if (outer_fade > 0.0) {
		float edge_distance = min(edge_uv.x, edge_uv.y);
		outer_alpha = smoothstep(0.0, outer_fade, edge_distance);
	}

	float tint_mix = texture(noise_texture, UV * tint_noise_scale + vec2(11.7, 4.1)).r;
	float alpha_noise = mix(
		1.0 - alpha_noise_strength,
		1.0,
		texture(noise_texture, UV * (noise_scale * 0.65) + vec2(23.1, 17.4)).r
	);

	vec4 color = mix(overlay_tint, overlay_tint_secondary, tint_mix);
	color.a *= band_alpha * outer_alpha * alpha_noise;
	COLOR = color;
}
