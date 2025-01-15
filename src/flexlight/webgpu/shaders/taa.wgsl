struct Uniforms {
    frame_index: f32,
    frames: f32,
    random_vecs: vec2<f32>
};

@group(0) @binding(0) var input_texture: texture_2d_array<f32>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// Helper function to calculate color variance
fn calculate_neighborhood_bounds(center_pos: vec2<i32>) -> mat2x3<f32> {
    var min_color = vec3<f32>(1.0f);
    var max_color = vec3<f32>(0.0f);
    var mean_color = vec3<f32>(0.0f);
    var mean_sq_color = vec3<f32>(0.0f);
    var sample_count = 0.0f;

    // Sample 3x3 neighborhood with gaussian weights
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
            let sample_pos = center_pos + vec2<i32>(x, y);
            let weight = (1.0f - abs(f32(x)) * 0.5f) * (1.0f - abs(f32(y)) * 0.5f);
            let sample = textureLoad(input_texture, sample_pos, u32(uniforms.frame_index), 0).xyz;
            
            mean_color += sample * weight;
            mean_sq_color += sample * sample * weight;
            min_color = min(min_color, sample);
            max_color = max(max_color, sample);
            sample_count += weight;
        }
    }

    mean_color /= sample_count;
    mean_sq_color /= sample_count;
    
    // Calculate variance and adjust bounds
    let variance = max(mean_sq_color - mean_color * mean_color, vec3<f32>(0.0));
    let std_dev = sqrt(variance);
    
    // Expand the color bounds based on local variance
    let gamma = 1.25f;
    min_color = max(min_color, mean_color - std_dev * gamma);
    max_color = min(max_color, mean_color + std_dev * gamma);
    
    return mat2x3<f32>(min_color, max_color);
}

@compute @workgroup_size(8, 8)
fn compute(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let screen_pos = global_id.xy;
    let texture_size = textureDimensions(input_texture);
    
    if (screen_pos.x >= texture_size.x || screen_pos.y >= texture_size.y) {
        return;
    }

    let center_pos = vec2<i32>(screen_pos);
    let current_color = textureLoad(input_texture, center_pos, u32(uniforms.frame_index), 0).xyz;
    
    // Calculate color bounds
    let bounds = calculate_neighborhood_bounds(center_pos);
    let min_color = bounds[0];
    let max_color = bounds[1];

    // Accumulate history samples with improved clamping
    var final_color = current_color;
    var weight_sum = 1.0f;
    
    for (var i = 0; i < i32(uniforms.frames); i++) {
        if (i == i32(uniforms.frame_index)) {
            continue;
        }
        
        let history_color = textureLoad(input_texture, center_pos, u32(i), 0).xyz;
        
        // Clamp history color to neighborhood bounds
        let clamped_color = clamp(history_color, min_color, max_color);
        
        // Calculate confidence weight based on how much clamping was needed
        let clamp_amount = length(history_color - clamped_color);
        let confidence = 1.0f - smoothstep(0.0f, 0.1f, clamp_amount);
        
        final_color += clamped_color * confidence;
        weight_sum += confidence;
    }

    final_color /= weight_sum;
    textureStore(output_texture, screen_pos, vec4<f32>(final_color, 1.0f));
}