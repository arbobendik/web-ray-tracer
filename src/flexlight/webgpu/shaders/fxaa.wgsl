struct FXAAParams {
    edge_threshold_min: f32,
    edge_threshold_max: f32,
    subpix_quality: f32,
    _padding: f32
};

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<uniform> params: FXAAParams;

// Helper function to get luminance from RGB
fn luminance(color: vec3<f32>) -> f32 {
    return dot(color, vec3<f32>(0.299, 0.587, 0.114));
}

@compute @workgroup_size(8, 8)
fn compute(@builtin(global_invocation_id) global_id: vec3<u32>) {
    // Convert global_id to u32 for comparison with texture size
    let screen_pos = vec2<u32>(global_id.xy);
    let texture_size = textureDimensions(input_texture);
    
    // Early exit if outside render bounds
    if (screen_pos.x >= texture_size.x || screen_pos.y >= texture_size.y) {
        return;
    }

    // Convert to i32 for texture loading
    let load_pos = vec2<i32>(screen_pos);
    let texel_size = vec2<f32>(1.0) / vec2<f32>(texture_size);
    
    // Sample the 3x3 neighborhood
    let center = textureLoad(input_texture, load_pos, 0);
    let north = textureLoad(input_texture, load_pos + vec2<i32>(0, 1), 0);
    let south = textureLoad(input_texture, load_pos + vec2<i32>(0, -1), 0);
    let east = textureLoad(input_texture, load_pos + vec2<i32>(1, 0), 0);
    let west = textureLoad(input_texture, load_pos + vec2<i32>(-1, 0), 0);
    
    // Get luminance values
    let luma_center = luminance(center.rgb);
    let luma_north = luminance(north.rgb);
    let luma_south = luminance(south.rgb);
    let luma_east = luminance(east.rgb);
    let luma_west = luminance(west.rgb);
    
    // Find min and max luma in 3x3 neighborhood
    let luma_min = min(luma_center, min(min(luma_north, luma_south), min(luma_east, luma_west)));
    let luma_max = max(luma_center, max(max(luma_north, luma_south), max(luma_east, luma_west)));
    
    // Compute local contrast
    let luma_range = luma_max - luma_min;
    
    // Early exit if contrast is lower than minimum
    if (luma_range < max(params.edge_threshold_min, luma_max * params.edge_threshold_max)) {
        textureStore(output_texture, load_pos, center);
        return;
    }
    
    // Compute horizontal and vertical gradients
    let horizontal = abs(luma_west + luma_east - 2.0 * luma_center) * 2.0 +
                    abs(luma_north + luma_south - 2.0 * luma_center);
    let vertical = abs(luma_north + luma_south - 2.0 * luma_center) * 2.0 +
                  abs(luma_west + luma_east - 2.0 * luma_center);
    
    // Determine edge direction
    let is_horizontal = horizontal >= vertical;
    
    // Choose positive and negative endpoints
    let gradient_step = select(vec2<f32>(0.0, texel_size.y), vec2<f32>(texel_size.x, 0.0), is_horizontal);
    let pos_grad = select(luma_north, luma_east, is_horizontal);
    let neg_grad = select(luma_south, luma_west, is_horizontal);
    
    // Compute local gradient
    let gradient = max(
        abs(pos_grad - luma_center),
        abs(neg_grad - luma_center)
    );
    
    // Calculate blend factor
    let blend_factor = smoothstep(0.0, 1.0, gradient / luma_range);
    let subpix_blend = clamp(blend_factor * params.subpix_quality, 0.0, 1.0);
    
    // Perform anti-aliasing blend
    var result: vec4<f32>;
    if (is_horizontal) {
        let blend_color = mix(west, east, subpix_blend);
        result = mix(center, blend_color, 0.5);
    } else {
        let blend_color = mix(south, north, subpix_blend);
        result = mix(center, blend_color, 0.5);
    }
    
    textureStore(output_texture, load_pos, result);
}
