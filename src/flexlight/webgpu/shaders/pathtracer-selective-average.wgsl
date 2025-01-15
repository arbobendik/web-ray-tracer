const PI: f32 = 3.141592653589793;
const POW32U: u32 = 4294967295u;
const SQRT3: f32 = 1.7320508075688772;
const BIAS: f32 = 0.0000152587890625;
const INV_1023: f32 = 0.0009775171065493646;

/*
const YUV_MATRIX: mat3x3<f32> = mat3x3<f32>(
    0.299,      0.587,     0.114,
  - 0.14713,  - 0.28886,   0.436,
    0.615,    - 0.51499, - 0.10001
);
*/

struct Uniforms {
    view_matrix: mat3x3<f32>,
    view_matrix_jitter: mat3x3<f32>,

    camera_position: vec3<f32>,
    ambient: vec3<f32>,

    texture_size: vec2<f32>,
    render_size: vec2<f32>,

    samples: f32,
    max_reflections: f32,
    min_importancy: f32,
    use_filter: f32,

    tonemapping_operator: f32,
    is_temporal: f32,
    temporal_count: f32,
    temporal_max: f32
};

@group(0) @binding(0) var compute_out: texture_2d_array<f32>;
@group(0) @binding(1) var shift_out: texture_2d_array<f32>;
@group(0) @binding(2) var accumulated: texture_storage_2d_array<rgba32float, write>;

@group(1) @binding(0) var<uniform> uniforms: Uniforms;

@compute
@workgroup_size(8, 8)
fn compute(
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_id) local_invocation_id : vec3<u32>,
    @builtin(global_invocation_id) global_invocation_id : vec3<u32>,
    @builtin(local_invocation_index) local_invocation_index: u32,
    @builtin(num_workgroups) num_workgroups: vec3<u32>
) {
    // Get texel position of screen
    let screen_pos: vec2<u32> = global_invocation_id.xy;
    if (screen_pos.x > u32(uniforms.render_size.x) || screen_pos.y > u32(uniforms.render_size.y)) {
        return;
    }

    // Get current color and position.
    let color_cur: vec4<f32> = textureLoad(compute_out, screen_pos, 0, 0);
    let position_cur: vec4<f32> = textureLoad(compute_out, screen_pos, 1, 0);

    // Map postion according to current camera positon and view matrix to clip space
    let clip_space: vec3<f32> = uniforms.view_matrix * (position_cur.xyz - uniforms.camera_position);
    // Project onto screen and shift origin to the corner
    let screen_space: vec2<f32> = (clip_space.xy / clip_space.z) * 0.5 + 0.5;
    // Translate to texel value
    var coord: vec2<u32> = vec2<u32>(
        u32((uniforms.render_size.x * screen_space.x)),
        u32((uniforms.render_size.y * (1.0f - screen_space.y)))
    );

    // Extract 3d position value
    let fine_color_acc: vec4<f32> = textureLoad(shift_out, coord, 0, 0);
    let coarse_color_acc: vec4<f32> = textureLoad(shift_out, coord, 1, 0);
    let fine_color_low_variance_acc: vec4<f32> = textureLoad(shift_out, coord, 2, 0);
    let coarse_color_low_variance_acc: vec4<f32> = textureLoad(shift_out, coord, 3, 0);
    let position_old: vec4<f32> = textureLoad(shift_out, coord, 4, 0);
    
    // If absolute position is all zeros then there is nothing to do
    let dist: f32 = distance(position_cur.xyz, position_old.xyz);
    let cur_depth: f32 = distance(position_cur.xyz, uniforms.camera_position.xyz);
    // let norm_color_diff = dot(normalize(current_color.xyz), normalize(accumulated_color.xyz));

    let croped_cur_color: vec3<f32> = min(color_cur.xyz, vec3<f32>(1.0f));

    var fine_color: vec4<f32> = color_cur;
    var fine_color_low_variance: vec3<f32> = croped_cur_color;
    var fine_count: f32 = 0.0f;

    var coarse_color: vec4<f32> = color_cur;
    var coarse_color_low_variance: vec3<f32> = croped_cur_color;
    var coarse_count: f32 = 0.0f;

    let is_pos = position_cur.x != 0.0f || position_cur.y != 0.0f || position_cur.z != 0.0f || position_cur.w != 0.0f;

    
    let last_frame = position_old.w == uniforms.temporal_count;
    
    if (
        dist <= cur_depth * 8.0f / uniforms.render_size.x
        && last_frame 
        && is_pos 
    ) {
        // Add color to total and increase counter by one
        fine_count = min(fine_color_low_variance_acc.w + 1.0f, 32.0f);
        fine_color = mix(fine_color_acc, color_cur, 1.0f / fine_count);
        fine_color_low_variance = mix(fine_color_low_variance_acc.xyz, croped_cur_color, 1.0f / fine_count);
        coarse_count = min(coarse_color_low_variance_acc.w + 1.0f, 4.0f);
        coarse_color = mix(coarse_color_acc, color_cur, 1.0f / coarse_count);
        coarse_color_low_variance = mix(coarse_color_low_variance_acc.xyz, croped_cur_color, 1.0f / coarse_count);


        let low_variance_color_length: f32 = (length(fine_color_low_variance) + length(coarse_color_low_variance)) * 0.5f;

        // If the color is not stable enough, use the coarse color
        if (
            dot(normalize(fine_color_low_variance + BIAS), normalize(coarse_color_low_variance + BIAS)) < cos(PI * 0.125)
            || abs(length(fine_color_low_variance) - length(coarse_color_low_variance)) > low_variance_color_length
        ) {
            // If the color is not stable enough, use the coarse color
            fine_color = coarse_color;
            fine_color_low_variance = coarse_color_low_variance;
            fine_count = coarse_count;
        }
        
        
    }

    // Write to accumulated buffer
    textureStore(accumulated, coord, 0, fine_color);
    textureStore(accumulated, coord, 1, coarse_color);
    textureStore(accumulated, coord, 2, vec4<f32>(fine_color_low_variance, fine_count));
    textureStore(accumulated, coord, 3, vec4<f32>(coarse_color_low_variance, coarse_count));
    textureStore(accumulated, coord, 4, vec4<f32>(position_cur.xyz, (uniforms.temporal_count + 1.0f) % uniforms.temporal_max));
}