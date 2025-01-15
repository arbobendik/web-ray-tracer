const POW32U: u32 = 4294967295u;
const POW23M1: f32 = 8388607.0;
const INV_255: f32 = 1.0f / 255.0f;

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

@group(0) @binding(0) var accumulated: texture_2d_array<f32>;
@group(0) @binding(1) var shift_out: texture_storage_2d_array<rgba32float, write>;
@group(0) @binding(2) var<storage, read_write> shift_lock: array<atomic<u32>>;

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
    
    // Extract color value from old position
    let fine_color_acc: vec4<f32> = textureLoad(accumulated, screen_pos, 0, 0);
    let coarse_color_acc: vec4<f32> = textureLoad(accumulated, screen_pos, 1, 0);
    let fine_color_low_variance_acc: vec4<f32> = textureLoad(accumulated, screen_pos, 2, 0);
    let coarse_color_low_variance_acc: vec4<f32> = textureLoad(accumulated, screen_pos, 3, 0);
    // Extract 3d position value
    let position_old: vec4<f32> = textureLoad(accumulated, screen_pos, 4, 0);
    
    // Map postion according to current camera positon and view matrix to clip space
    let relative_position: vec3<f32> = position_old.xyz - uniforms.camera_position;
    let clip_space: vec3<f32> = uniforms.view_matrix * relative_position;
    // Project onto screen and shift origin to the corner
    let screen_space: vec2<f32> = (clip_space.xy / clip_space.z) * 0.5 + 0.5;
    // Translate to texel value
    let coord: vec2<u32> = vec2<u32>(
        u32((uniforms.render_size.x * screen_space.x)),
        u32((uniforms.render_size.y * (1.0f - screen_space.y)))
    );

    let last_frame = position_old.w == uniforms.temporal_count;
    // Skip if data is not from last frame
    if (!last_frame) {
        return;
    }

    let buffer_index: u32 = coord.x + u32(uniforms.render_size.x) * coord.y;
    // Attempt to acquire lock.
    let lock: u32 = atomicOr(&shift_lock[buffer_index], 1u);
    if (lock == 1u) {
        // If lock is already set then another thread is already working on this pixel
        return;
    }
    
    // Write to shift buffer
    textureStore(shift_out, coord, 0, fine_color_acc);
    textureStore(shift_out, coord, 1, coarse_color_acc);
    textureStore(shift_out, coord, 2, fine_color_low_variance_acc);
    textureStore(shift_out, coord, 3, coarse_color_low_variance_acc);
    textureStore(shift_out, coord, 4, position_old);


    // Release lock.
    atomicStore(&shift_lock[buffer_index], 0u);
}