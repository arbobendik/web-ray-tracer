const PI: f32 = 3.141592653589793;
const PHI: f32 = 1.61803398874989484820459;
const SQRT3: f32 = 1.7320508075688772;
const POW32: f32 = 4294967296.0;
const BIAS: f32 = 0.0000152587890625;
const INV_PI: f32 = 0.3183098861837907;
const INV_65535: f32 = 0.000015259021896696422;

struct Transform {
    rotation: mat3x3<f32>,
    shift: vec3f,
};

struct Light {
    position: vec3f,
    strength_variation: vec2f,
}

struct Uniforms {
    view_matrix: mat3x3<f32>,

    camera_position: vec3<f32>,
    ambient: vec3<f32>,

    samples: f32,
    max_reflections: f32,
    min_importancy: f32,
    use_filter: f32,

    is_temporal: f32,
    random_seed: f32,
    texture_size: vec2<f32>,
};

struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) relative_position: vec3f,
    @location(1) absolute_position: vec3f,
    @location(2) uv: vec2f,
    @location(3) clip_space: vec3f,
    @location(4) @interpolate(flat) t_i: i32,
    @location(5) @interpolate(flat) triangle_index: i32,
};

@group(0) @binding(0) var<storage, read> indices: array<i32>;
@group(0) @binding(1) var<storage, read> geometry: array<f32>;
@group(0) @binding(2) var<storage, read> scene: array<f32>;

@group(1) @binding(0) var<uniform> uniforms: Uniforms;
@group(1) @binding(1) var<storage, read> lights: array<Light>;
@group(1) @binding(2) var<storage, read> transforms: array<Transform>;


const base_uvs = array(
    vec2f(1, 0),
    vec2f(0, 1),
    vec2f(0, 0)
);

@vertex
fn vsMain(
    @builtin(vertex_index) vertex_index : u32,
    @builtin(instance_index) instance_index: u32
) -> VertexOut {
    var out: VertexOut;

    let vertex_num: i32 = i32(vertex_index % 3);
    out.triangle_index = indices[instance_index];
    let geometry_index: i32 = out.triangle_index * 12;
    let v_i: i32 = geometry_index + vertex_num * 3;
    // Transform position
    out.relative_position = vec3f(geometry[v_i], geometry[v_i + 1], geometry[v_i + 2]);
    // Get transformation ID
    out.t_i = i32(geometry[geometry_index + 9]) << 1;

    // Trasform position
    let transform: Transform = transforms[out.t_i];
    out.absolute_position = (transform.rotation * out.relative_position) + transform.shift;
    // Set uv to vertex uv and let the vertex interpolation generate the values in between
    out.uv = base_uvs[vertex_num];

    out.clip_space = uniforms.view_matrix * (out.absolute_position - uniforms.camera_position);
    // Set triangle position in clip space
    out.pos = vec4f(out.clip_space.xy, 1.0f / (1.0f + exp(out.clip_space.z * INV_65535)), out.clip_space.z);
    return out;
}

// FRAGMENT SHADER ------------------------------------------------------------------------------------------------------------------------

@group(2) @binding(0) var texture_atlas: texture_2d<f32>;
@group(2) @binding(1) var pbr_atlas: texture_2d<f32>;
@group(2) @binding(2) var translucency_atlas: texture_2d<f32>;

struct Ray {
    origin: vec3f,
    unit_direction: vec3f,
};

struct Material {
    albedo: vec3f,
    rme: vec3f,
    tpo: vec3f
};

struct Hit {
    suv: vec3f,
    transform_id: i32,
    triangle_id: i32
};

// Lookup values for texture atlases
fn fetchTexVal(atlas: texture_2d<f32>, uv: vec2f, tex_num: f32, default_val: vec3f) -> vec3f {
    // Return default value if no texture is set
    if (tex_num == - 1.0) {
        return default_val;
    }
    // Get dimensions of texture atlas
    let atlas_size: vec2f = vec2f(textureDimensions(atlas));
    let width: f32 = tex_num * uniforms.texture_size.x;
    let offset: vec2f = vec2f(
        width % atlas_size.x,
        atlas_size.y - floor(width / atlas_size.x) * uniforms.texture_size.y
    );
    // WebGPU quirk of having upsidedown height for textures
    let atlas_texel: vec2<i32> = vec2<i32>(offset + uv * uniforms.texture_size * vec2f(1, -1));
    // Fetch texel on requested coordinate
    let tex_val: vec3f = textureLoad(atlas, atlas_texel, 0).xyz;
    return tex_val;
}

fn noise(n: vec2f, seed: f32) -> vec4f {
    return fract(sin(dot(n.xy, vec2f(12.9898f, 78.233f)) + vec4f(53.0f, 59.0f, 61.0f, 67.0f) * (seed + uniforms.random_seed * PHI)) * 43758.5453f) * 2.0f - 1.0f;
}

fn moellerTrumbore(t: mat3x3<f32>, ray: Ray, l: f32) -> vec3f {
    let edge1: vec3f = t[1] - t[0];
    let edge2: vec3f = t[2] - t[0];
    let pvec: vec3f = cross(ray.unit_direction, edge2);
    let det: f32 = dot(edge1, pvec);
    if(abs(det) < BIAS) {
        return vec3f(0.0f);
    }
    let inv_det: f32 = 1.0f / det;
    let tvec: vec3f = ray.origin - t[0];
    let u: f32 = dot(tvec, pvec) * inv_det;
    if(u < BIAS || u > 1.0f) {
        return vec3f(0.0f);
    }
    let qvec: vec3f = cross(tvec, edge1);
    let v: f32 = dot(ray.unit_direction, qvec) * inv_det;
    let uv_sum: f32 = u + v;
    if(v < BIAS || uv_sum > 1.0f) {
        return vec3f(0.0f);
    }
    let s: f32 = dot(edge2, qvec) * inv_det;
    if(s > l || s <= BIAS) {
        return vec3f(0.0f);
    }
    return vec3f(s, u, v);
}

// Simplified Moeller-Trumbore algorithm for detecting only forward facing triangles
fn moellerTrumboreCull(t: mat3x3<f32>, ray: Ray, l: f32) -> bool {
    let edge1 = t[1] - t[0];
    let edge2 = t[2] - t[0];
    let pvec = cross(ray.unit_direction, edge2);
    let det = dot(edge1, pvec);
    let inv_det = 1.0f / det;
    if(det < BIAS) { 
        return false;
    }
    let tvec = ray.origin - t[0];
    let u: f32 = dot(tvec, pvec) * inv_det;
    if(u < BIAS || u > 1.0f) {
        return false;
    }
    let qvec: vec3f = cross(tvec, edge1);
    let v: f32 = dot(ray.unit_direction, qvec) * inv_det;
    if(v < BIAS || u + v > 1.0f) {
        return false;
    }
    let s: f32 = dot(edge2, qvec) * inv_det;
    return (s <= l && s > BIAS);
}

// Don't return intersection point, because we're looking for a specific triangle
fn rayCuboid(min_corner: vec3f, max_corner: vec3f, ray: Ray, l: f32) -> bool {
    let v0: vec3f = (min_corner - ray.origin) / ray.unit_direction;
    let v1: vec3f = (max_corner - ray.origin) / ray.unit_direction;
    let tmin: f32 = max(max(min(v0.x, v1.x), min(v0.y, v1.y)), min(v0.z, v1.z));
    let tmax: f32 = min(min(max(v0.x, v1.x), max(v0.y, v1.y)), max(v0.z, v1.z));
    return tmax >= max(tmin, BIAS) && tmin < l;
}

// Test for closest ray triangle intersection
// return intersection position in world space and index of target triangle in geometryTex
// plus triangle and transformation Id
fn rayTracer(ray: Ray) -> Hit {
    // Cache transformed ray attributes
    var t_ray: Ray = Ray(ray.origin, ray.unit_direction);
    // Inverse of transformed normalized ray
    var cached_t_i: i32 = 0;
    // Latest intersection which is now closest to origin
    var hit: Hit = Hit(vec3(0.0f), 0, - 1);
    // Precomput max length
    var min_len: f32 = POW32;
    // Get texture size as max iteration value
    let size: i32 = i32(arrayLength(&geometry)) / 12;
    // Iterate through lines of texture
    for (var i: i32 = 0; i < size; i++) {
        // Get position of current triangle/vertex in geometryTex
        let index: i32 = i * 12;
        // Fetch triangle coordinates from scene graph
        let a = vec3f(geometry[index    ], geometry[index + 1], geometry[index + 2]);
        let b = vec3f(geometry[index + 3], geometry[index + 4], geometry[index + 5]);
        let c = vec3f(geometry[index + 6], geometry[index + 7], geometry[index + 8]);

        let t_i: i32 = i32(geometry[index + 9]) << 1;
        // Test if cached transformed variables are still valid
        if (t_i != cached_t_i) {
            let i_i: i32 = t_i + 1;
            cached_t_i = t_i;
            let i_transform = transforms[i_i];
            t_ray = Ray(
                i_transform.rotation * (ray.origin + i_transform.shift),
                i_transform.rotation * ray.unit_direction
            );
        }
        // Three cases:
        // indicator = 0        => end of list: stop loop
        // indicator = 1        => is bounding volume: do AABB intersection test
        // indicator = 2        => is triangle: do triangle intersection test
        switch i32(geometry[index + 10]) {
            case 0 {
                return hit;
            }
            case 1: {
                if(!rayCuboid(a, b, t_ray, min_len)) {
                    i += i32(c.x);
                }
            }
            case 2: {
                let triangle: mat3x3<f32> = mat3x3<f32>(a, b, c);
                 // Test if triangle intersects ray
                let intersection: vec3f = moellerTrumbore(triangle, t_ray, min_len);
                // Test if ray even intersects
                if(intersection.x != 0.0) {
                    // Calculate intersection point
                    hit = Hit(intersection, t_i, i);
                    // Update maximum object distance for future rays
                    min_len = intersection.x;
                }
            }
            default: {
                continue;
            }
        }
    }
    // Tested all triangles, but there is no intersection
    return hit;
}

// Simplified rayTracer to only test if ray intersects anything
fn shadowTest(ray: Ray, l: f32) -> bool {
    // Cache transformed ray attributes
    var t_ray: Ray = Ray(ray.origin, ray.unit_direction);
    // Inverse of transformed normalized ray
    var cached_t_i: i32 = 0;
    // Precomput max length
    let min_len: f32 = l;
    // Get texture size as max iteration value
    let size: i32 = i32(arrayLength(&geometry)) / 12;
    // Iterate through lines of texture
    for (var i: i32 = 0; i < size; i++) {
        // Get position of current triangle/vertex in geometryTex
        let index: i32 = i * 12;
        // Fetch triangle coordinates from scene graph
        let a = vec3f(geometry[index    ], geometry[index + 1], geometry[index + 2]);
        let b = vec3f(geometry[index + 3], geometry[index + 4], geometry[index + 5]);
        let c = vec3f(geometry[index + 6], geometry[index + 7], geometry[index + 8]);

        let t_i: i32 = i32(geometry[index + 9]) << 1;
        // Test if cached transformed variables are still valid
        if (t_i != cached_t_i) {
            let i_i: i32 = t_i + 1;
            cached_t_i = t_i;
            let i_transform = transforms[i_i];
            t_ray = Ray(
                i_transform.rotation * (ray.origin + i_transform.shift),
                normalize(i_transform.rotation * ray.unit_direction)
            );
        }
        // Three cases:
        // indicator = 0        => end of list: stop loop
        // indicator = 1        => is bounding volume: do AABB intersection test
        // indicator = 2        => is triangle: do triangle intersection test
        switch i32(geometry[index + 10]) {
            case 0 {
                return false;
            }
            case 1: {
                if(!rayCuboid(a, b, t_ray, min_len)) {
                    i += i32(c.x);
                }
            }
            case 2: {
                let triangle: mat3x3<f32> = mat3x3<f32>(a, b, c);
                // Test for triangle intersection in positive light ray direction
                if(moellerTrumboreCull(triangle, t_ray, min_len)) {
                    return true;
                }
            }
            default: {
                continue;
            }
        }
    }
    // Tested all triangles, but there is no intersection
    return false;
}

fn trowbridgeReitz(alpha: f32, n_dot_h: f32) -> f32 {
    let numerator: f32 = alpha * alpha;
    let denom: f32 = n_dot_h * n_dot_h * (numerator - 1.0f) + 1.0f;
    return numerator / max(PI * denom * denom, BIAS);
}

fn schlickBeckmann(alpha: f32, n_dot_x: f32) -> f32 {
    let k: f32 = alpha * 0.5f;
    let denom: f32 = max(n_dot_x * (1.0f - k) + k, BIAS);
    return n_dot_x / denom;
}

fn smith(alpha: f32, n_dot_v: f32, n_dot_l: f32) -> f32 {
    return schlickBeckmann(alpha, n_dot_v) * schlickBeckmann(alpha, n_dot_l);
}

fn fresnel(f0: vec3f, theta: f32) -> vec3f {
    // Use Schlick approximation
    return f0 + (1.0f - f0) * pow(1.0f - theta, 5.0f);
}


fn forwardTrace(material: Material, light_dir: vec3f, strength: f32, n: vec3f, v: vec3f) -> vec3f {
    let len_p1: f32 = 1.0f + length(light_dir);
    // Apply inverse square law
    let brightness: f32 = strength / (len_p1 * len_p1);

    let l: vec3f = normalize(light_dir);
    let h: vec3f = normalize(v + l);

    let v_dot_h: f32 = max(dot(v, h), 0.0f);
    let n_dot_l: f32 = max(dot(n, l), 0.0f);
    let n_dot_h: f32 = max(dot(n, h), 0.0f);
    let n_dot_v: f32 = max(dot(n, v), 0.0f);

    let alpha: f32 = material.rme.x * material.rme.x;
    let brdf: f32 = mix(1.0f, n_dot_v, material.rme.y);
    let f0: vec3f = material.albedo * brdf;

    let ks: vec3f = fresnel(f0, v_dot_h);
    let kd: vec3f = (1.0f - ks) * (1.0f - material.rme.y);
    let lambert: vec3f = material.albedo * INV_PI;

    let cook_torrance_numerator: vec3f = ks * trowbridgeReitz(alpha, n_dot_h) * smith(alpha, n_dot_v, n_dot_l);
    let cook_torrance_denominator: f32 = max(4.0f * n_dot_v * n_dot_l, BIAS);

    let cook_torrance: vec3f = cook_torrance_numerator / cook_torrance_denominator;
    let radiance: vec3f = kd * lambert + cook_torrance;

    // Outgoing light to camera
    return radiance * n_dot_l * brightness;
}

fn reservoirSample(material: Material, ray: Ray, random_vec: vec4f, rough_n: vec3f, smooth_n: vec3f, geometry_offset: f32, dont_filter: bool, i: i32) -> vec3f {
    var local_color: vec3f = vec3f(0.0f);
    var reservoir_length: f32 = 0.0f;
    var total_weight: f32 = 0.0f;
    var reservoir_num: i32 = 0;
    var reservoir_weight: f32 = 0.0f;
    var reservoir_light_pos: vec3f;
    var reservoir_light_dir: vec3f;
    var last_random: vec2f = noise(random_vec.zw, BIAS).xy;

    let size: i32 = i32(arrayLength(&lights));
    for (var j: i32 = 0; j < size; j++) {
        // Read light from storage buffer
        var light: Light = lights[j];
        // Skip if strength is negative or zero
        if (light.strength_variation.x <= 0.0f) {
            continue;
        }
        // Increment light weight
        reservoir_length += 1.0f;
        // Alter light source position according to variation.
        light.position += random_vec.xyz * light.strength_variation.y;
        let dir: vec3f = light.position - ray.origin;

        let color_for_light: vec3f = forwardTrace(material, dir, light.strength_variation.x, rough_n, - ray.unit_direction);

        local_color += color_for_light;
        let weight: f32 = length(color_for_light);

        total_weight += weight;
        if (abs(last_random.y) * total_weight <= weight) {
            reservoir_num = j;
            reservoir_weight = weight;
            reservoir_light_pos = light.position;
            reservoir_light_dir = dir;
        }
        // Update pseudo random variable.
        last_random = noise(last_random, BIAS).zw;
    }

    let unit_light_dir: vec3<f32> = normalize(reservoir_light_dir);
    // Compute quick exit criterion to potentially skip expensive shadow test
    let show_color: bool = reservoir_length == 0.0f || reservoir_weight == 0.0f;
    let show_shadow: bool = dot(smooth_n, unit_light_dir) <= BIAS;
    // Apply emissive texture and ambient light
    let base_luminance: vec3<f32> = vec3f(material.rme.z);
    // Update filter
    // if (dont_filter || i == 0) renderId.w = float((reservoirNum % 128) << 1) * INV_255;
    // Test if in shadow
    if (show_color) {
        return local_color + base_luminance;
    }

    if (show_shadow) {
        // if (dontFilter || i == 0) renderId.w += INV_255;
        return base_luminance;
    }
    // Apply geometry offset
    let offset_target: vec3<f32> = ray.origin + geometry_offset * smooth_n;
    let light_ray: Ray = Ray(offset_target, unit_light_dir);

    if (shadowTest(light_ray, length(reservoir_light_dir))) {
        // if (dontFilter || i == 0) renderId.w += INV_255;
        return base_luminance;
    } else {
        return local_color + base_luminance;
    }
}

fn lightTrace(init_hit: Hit, origin: vec3<f32>, camera: vec3<f32>, clip_space: vec3<f32>, cos_sample_n: f32, bounces: i32) -> vec3<f32> {
    // Set bool to false when filter becomes necessary
    var dont_filter: bool = false;
    // Use additive color mixing technique, so start with black
    var final_color: vec3<f32> = vec3f(0.0f);
    var importancy_factor: vec3<f32> = vec3(1.0f);
    // originalColor = vec3(1.0f);
    var hit: Hit = init_hit;
    var ray: Ray = Ray(camera, normalize(origin - camera));
    var last_hit_point: vec3<f32> = camera;
    // Iterate over each bounce and modify color accordingly
    for (var i: i32 = 0; i < bounces && length(importancy_factor/* * originalColor*/) >= uniforms.min_importancy * SQRT3; i++) {
        let fi: f32 = f32(i);

        let transform: Transform = transforms[hit.transform_id];
        // Transform hit point
        ray.origin = hit.suv.x * ray.unit_direction + ray.origin;
        // Calculate barycentric coordinates
        let uvw: vec3<f32> = vec3(1.0 - hit.suv.y - hit.suv.z, hit.suv.y, hit.suv.z);

        // Fetch triangle coordinates from scene graph texture
        let index_g: i32 = hit.triangle_id * 12;

        let a: vec3<f32> = transform.rotation * vec3<f32>(geometry[index_g    ], geometry[index_g + 1], geometry[index_g + 2]);
        let b: vec3<f32> = transform.rotation * vec3<f32>(geometry[index_g + 3], geometry[index_g + 4], geometry[index_g + 5]);
        let c: vec3<f32> = transform.rotation * vec3<f32>(geometry[index_g + 6], geometry[index_g + 7], geometry[index_g + 8]);

        let offset_ray_target: vec3<f32> = ray.origin - transform.shift;

        let geometry_n: vec3<f32> = normalize(cross(a - b, a - c));
        let diffs: vec3<f32> = vec3<f32>(
            distance(offset_ray_target, a),
            distance(offset_ray_target, b),
            distance(offset_ray_target, c)
        );
        // Fetch scene texture data
        let index_s: i32 = hit.triangle_id * 28;
        // Pull normals
        let normals: mat3x3<f32> = transform.rotation * mat3x3<f32>(
            scene[index_s    ], scene[index_s + 1], scene[index_s + 2],
            scene[index_s + 3], scene[index_s + 4], scene[index_s + 5],
            scene[index_s + 6], scene[index_s + 7], scene[index_s + 8]
        );
        // Interpolate smooth normal
        var smooth_n: vec3<f32> = normalize(normals * uvw);
        // to prevent unnatural hard shadow / reflection borders due to the difference between the smooth normal and geometry
        let angles: vec3<f32> = acos(abs(geometry_n * normals));
        let angle_tan: vec3<f32> = clamp(tan(angles), vec3<f32>(0.0f), vec3<f32>(1.0f));
        let geometry_offset: f32 = dot(diffs * angle_tan, uvw);
        // Interpolate final barycentric texture coordinates between UV's of the respective vertices
        let barycentric: vec2<f32> = mat3x2<f32>(
            scene[index_s + 9 ], scene[index_s + 10], scene[index_s + 11],
            scene[index_s + 12], scene[index_s + 13], scene[index_s + 14]
        ) * uvw;
        // Gather material attributes (albedo, roughness, metallicity, emissiveness, translucency, partical density and optical density aka. IOR) out of world texture
        let tex_num: vec3<f32>          = vec3<f32>(scene[index_s + 15], scene[index_s + 16], scene[index_s + 17]);

        let albedo_default: vec3<f32>   = vec3<f32>(scene[index_s + 18], scene[index_s + 19], scene[index_s + 20]);
        let rme_default: vec3<f32>      = vec3<f32>(scene[index_s + 21], scene[index_s + 22], scene[index_s + 23]);
        let tpo_default: vec3<f32>      = vec3<f32>(scene[index_s + 24], scene[index_s + 25], scene[index_s + 26]);

        let material: Material = Material (
            fetchTexVal(texture_atlas, barycentric, tex_num.x, albedo_default),
            fetchTexVal(pbr_atlas, barycentric, tex_num.y, rme_default),
            fetchTexVal(translucency_atlas, barycentric, tex_num.z, tpo_default),
        );
        
        ray = Ray(ray.origin, normalize(ray.origin - last_hit_point));
        // If ray reflects from inside or onto an transparent object,
        // the surface faces in the opposite direction as usual
        var sign_dir: f32 = sign(dot(ray.unit_direction, smooth_n));
        smooth_n *= - sign_dir;

        // Generate pseudo random vector
        let random_vec: vec4<f32> = noise(clip_space.xy / clip_space.z, fi + cos_sample_n);
        let random_spheare_vec: vec3<f32> = normalize(smooth_n + normalize(random_vec.xyz));
        let brdf: f32 = mix(1.0f, abs(dot(smooth_n, ray.unit_direction)), material.rme.y);

        // Alter normal according to roughness value
        let roughness_brdf: f32 = material.rme.x * brdf;
        let rough_n: vec3<f32> = normalize(mix(smooth_n, random_spheare_vec, roughness_brdf));

        let h: vec3<f32> = normalize(rough_n - ray.unit_direction);
        let v_dot_h = max(dot(- ray.unit_direction, h), 0.0f);
        let f0: vec3<f32> = material.albedo * brdf;
        let f: vec3<f32> = fresnel(f0, v_dot_h);

        let fresnel_reflect: f32 = max(f.x, max(f.y, f.z));
        // object is solid or translucent by chance because of the fresnel effect
        let is_solid: bool = material.tpo.x * fresnel_reflect <= abs(random_vec.w);

        // Multiply albedo with either absorption value or filter color
        /*if (dont_filter) {
            // Update last used tpo.x value
            originalTPOx = material.tpo.x;
            originalColor *= material.albedo;
            // Add filtering intensity for respective surface
            originalRMEx += material.rme.x;
            // Update render id
            vec4 renderIdUpdate = pow(2.0f, - fi) * vec4(combineNormalRME(smoothNormal, material.rme), 0.0f);

            renderId += renderIdUpdate;
            if (i == 0) renderOriginalId += renderIdUpdate;
            // Update dontFilter variable
            dontFilter = (material.rme.x < 0.01f && isSolid) || !isSolid;

            if(isSolid && material.tpo.x > 0.01f) {
                glassFilter += 1.0f;
                dontFilter = false;
            }
        } else {
            */
        importancy_factor = importancy_factor * material.albedo;
            /*
        }
        */

        // Test if filter is already necessary
        // if (i == 1) firstRayLength = min(length(ray.origin - lastHitPoint) / length(lastHitPoint - camera), firstRayLength);
        // Determine local color considering PBR attributes and lighting
        let local_color: vec3f = reservoirSample(material, ray, random_vec, - sign_dir * rough_n, - sign_dir * smooth_n, geometry_offset, dont_filter, i);
        // Calculate primary light sources for this pass if ray hits non translucent object
        final_color += local_color * importancy_factor;
        // Handle translucency and skip rest of light calculation
        if(is_solid) {
            // Calculate reflecting ray
            ray.unit_direction = normalize(mix(reflect(ray.unit_direction, smooth_n), random_spheare_vec, roughness_brdf));
        } else {
            let eta: f32 = mix(1.0f / material.tpo.z, material.tpo.z, max(sign_dir, 0.0f));
            // Refract ray depending on IOR (material.tpo.z)
            ray.unit_direction = normalize(mix(refract(ray.unit_direction, smooth_n, eta), random_spheare_vec, roughness_brdf));
        }
        // Calculate next intersection
        hit = rayTracer(ray);
        // Stop loop if there is no intersection and ray goes in the void
        if (hit.triangle_id == - 1) {
            break;
            // return final_color + importancy_factor * uniforms.ambient;
        }
        // Update other parameters
        last_hit_point = ray.origin;
    }
    // Return final pixel color
    return final_color + importancy_factor * uniforms.ambient;
}

@fragment
fn fsMain(
    @location(0) relative_position: vec3<f32>,
    @location(1) absolute_position: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) clip_space: vec3<f32>,
    @location(4) @interpolate(flat) t_i: i32,
    @location(5) @interpolate(flat) triangle_index: i32
) -> @location(0) vec4f {
    let uvw: vec3<f32> = vec3<f32>(uv, 1.0f - uv.x - uv.y);
    // Generate hit struct for pathtracer
    let init_hit: Hit = Hit(vec3<f32>(distance(absolute_position, uniforms.camera_position), uvw.yz), t_i, triangle_index);

    var final_color = vec3<f32>(0.0f);

    // lightTrace(init_hit: Hit, origin: vec3<f32>, camera: vec3<f32>, clip_space: vec3<f32>, cos_sample_n: f32, bounces: i32)
    // Generate multiple samples
    for(var i: i32 = 0; i < i32(uniforms.samples); i++) {
        // Use cosine as noise in random coordinate picker
        let cos_sample_n = cos(f32(i));
        final_color += lightTrace(init_hit, absolute_position, uniforms.camera_position, clip_space, cos_sample_n, i32(uniforms.max_reflections));
    }
    // Average ray colors over samples.
    let inv_samples: f32 = 1.0f / uniforms.samples;
    final_color *= inv_samples;

    return vec4<f32>(final_color, 1.0f);

    /*
    if(use_filter == 1) {
        // Render all relevant information to 4 textures for the post processing shader
        render_color = vec4(fract(finalColor), 1.0f);
        // 16 bit HDR for improved filtering
        renderColorIp = vec4(floor(finalColor) * INV_256, glassFilter);
    } else {
        finalColor *= originalColor;
        if(isTemporal == 1) {
            renderColor = vec4(fract(finalColor), 1.0f);
            // 16 bit HDR for improved filtering
            // renderColorIp = vec4(floor(finalColor) * INV_256, 1.0f);
        } else {
            renderColor = vec4(finalColor, 1.0f);
        }
    }

    renderOriginalColor = vec4(originalColor, min(originalRMEx, firstRayLength) + INV_255);
    // render normal (last in transparency)
    renderId += vec4(0.0f, 0.0f, 0.0f, INV_255);
    // render material (last in transparency)
    renderOriginalId = vec4(0.0f, 0.0f, 0.0f, originalTPOx + INV_255);
    // render modulus of absolute position (last in transparency)
    float div = 2.0f * distance(relativePosition, camera);
    renderLocationId = vec4(mod(relativePosition, div) / div, INV_255);
    */
}