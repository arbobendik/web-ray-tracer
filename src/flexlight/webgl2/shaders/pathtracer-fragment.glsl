#version 300 es
#define TRIANGLES_PER_ROW_POWER 8
#define TRIANGLES_PER_ROW 256
#define PI 3.141592653589793
#define PHI 1.61803398874989484820459
#define SQRT3 1.7320508075688772
#define POW32 4294967296.0
#define BIAS 0.0000152587890625
#define THIRD 0.3333333333333333
#define INV_PI 0.3183098861837907
#define INV_256 0.00390625
#define INV_255 0.00392156862745098
#define INV_65536 0.0000152587890625

precision highp int;
precision highp float;
precision highp sampler2D;

struct Ray {
    vec3 origin;
    vec3 unitDirection;
};

struct Material {
    vec3 albedo;
    vec3 rme;
    vec3 tpo;
};

struct Hit {
    vec3 suv;
    int transformId;
    int triangleId;
};

in vec3 relativePosition;
in vec3 absolutePosition;
in vec2 uv;
in vec3 clipSpace;

flat in vec3 camera;
flat in int initTriangleId;
flat in int transformationId;

layout (std140) uniform transformMatrix
{
    mat3 rotation[MAX_TRANSFORMS];
    vec3 shift[MAX_TRANSFORMS];
};

// Quality configurators
uniform int samples;
uniform int maxReflections;
uniform float minImportancy;
uniform int hdr;
uniform int isTemporal;

// Get global illumination color, intensity
uniform vec3 ambient;

uniform float randomSeed;
// Textures in parallel for texture atlas
uniform vec2 textureDims;

// Texture with information about all triangles in scene
uniform sampler2D geometryTex;
uniform sampler2D sceneTex;
uniform sampler2D translucencyTex;
uniform sampler2D pbrTex;
uniform sampler2D tex;

// Texture with all primary light sources of scene
uniform sampler2D lightTex;

layout(location = 0) out vec4 renderColor;
layout(location = 1) out vec4 renderColorIp;
layout(location = 2) out vec4 renderId;

const Hit NO_HIT = Hit(vec3(0.0), 0, -1);

// Prevent blur over shadow border or over (close to) perfect reflections
float firstRayLength = 1.0f;
// Accumulate color of mirror reflections
// float glassFilter = 0.0f;
float originalRMEx = 0.0f;
float originalTPOx = 0.0f;
vec3 originalColor;

float to4BitRepresentation(float a, float b) {
    uint aui = uint(a * 255.0f) & uint(240);
    uint bui = (uint(b * 255.0f) & uint(240)) >> 4;
    return float(aui | bui) * INV_255;
}

float normalToSphearical4BitRepresentation(vec3 n) {
    float phi = (atan(n.z, n.x) * INV_PI) * 0.5f + 0.5f;
    float theta = (atan(n.x, n.y) * INV_PI) * 0.5f + 0.5f;
    return to4BitRepresentation(phi, theta);
}

vec3 combineNormalRME(vec3 n, vec3 rme) {
    return vec3(normalToSphearical4BitRepresentation(n), rme.x, to4BitRepresentation(rme.y, rme.z));
}

// Lookup values for texture atlases
vec3 fetchTexVal(sampler2D atlas, vec2 uv, float texNum, vec3 defaultVal) {
    if (texNum == - 1.0) return defaultVal;

    vec2 atlasSize = vec2(textureSize(atlas, 0));
    vec2 offset = vec2(
        mod((textureDims.x * texNum), atlasSize.x),
        floor((textureDims.x * texNum) / atlasSize.x) * textureDims.y
    );
    vec2 atlasCoords = (offset + uv * textureDims) / atlasSize;
    // Return texel on requested location
    return texture(atlas, atlasCoords).xyz;
}

vec4 noise(vec2 n, float seed) {
    return fract(sin(dot(n.xy, vec2(12.9898f, 78.233f)) + vec4(53.0f, 59.0f, 61.0f, 67.0f) * (seed + randomSeed * PHI)) * 43758.5453f) * 2.0f - 1.0f;
    // fract(sin(dot(n.xy, vec2<f32>(12.9898f, 78.233f)) + vec4<f32>(53.0f, 59.0f, 61.0f, 67.0f) * sin(seed + uniforms.temporal_target * PHI)) * 43758.5453f) * 2.0f - 1.0f;
}

vec3 moellerTrumbore(mat3 t, Ray ray, float l) {
    vec3 edge1 = t[1] - t[0];
    vec3 edge2 = t[2] - t[0];
    vec3 pvec = cross(ray.unitDirection, edge2);
    float det = dot(edge1, pvec);
    if(abs(det) < BIAS) return vec3(0.0f);
    float inv_det = 1.0f / det;
    vec3 tvec = ray.origin - t[0];
    float u = dot(tvec, pvec) * inv_det;
    if(u < BIAS || u > 1.0f) return vec3(0.0f);
    vec3 qvec = cross(tvec, edge1);
    float v = dot(ray.unitDirection, qvec) * inv_det;
    float uvSum = u + v;
    if(v < BIAS || uvSum > 1.0f) return vec3(0.0f);
    float s = dot(edge2, qvec) * inv_det;
    if(s > l || s <= BIAS) return vec3(0.0f);
    return vec3(s, u, v);
}

// Simplified Moeller-Trumbore algorithm for detecting only forward facing triangles
bool moellerTrumboreCull(mat3 t, Ray ray, float l) {
    vec3 edge1 = t[1] - t[0];
    vec3 edge2 = t[2] - t[0];
    vec3 pvec = cross(ray.unitDirection, edge2);
    float det = dot(edge1, pvec);
    float invDet = 1.0f / det;
    if(det < BIAS) return false;
    vec3 tvec = ray.origin - t[0];
    float u = dot(tvec, pvec) * invDet;
    if(u < BIAS || u > 1.0f) return false;
    vec3 qvec = cross(tvec, edge1);
    float v = dot(ray.unitDirection, qvec) * invDet;
    if(v < BIAS || u + v > 1.0f) return false;
    float s = dot(edge2, qvec) * invDet;
    return (s <= l && s > BIAS);
}

// Don't return intersection point, because we're looking for a specific triangle not bounding box
bool rayCuboid(float l, Ray ray, vec3 minCorner, vec3 maxCorner) {
    vec3 v0 = (minCorner - ray.origin) / ray.unitDirection;
    vec3 v1 = (maxCorner - ray.origin) / ray.unitDirection;
    float tmin = max(max(min(v0.x, v1.x), min(v0.y, v1.y)), min(v0.z, v1.z));
    float tmax = min(min(max(v0.x, v1.x), max(v0.y, v1.y)), max(v0.z, v1.z));
    return tmax >= max(tmin, BIAS) && tmin < l;
}

// Test for closest ray triangle intersection
// return intersection position in world space and index of target triangle in geometryTex
// plus triangle and transformation Id
Hit rayTracer(Ray ray) {
    // Cache transformed ray attributes
    Ray tR = Ray(ray.origin, ray.unitDirection);
    int cachedTI = 0;
    // Latest intersection which is now closest to origin
    Hit hit = NO_HIT;
    // Length to latest intersection
    float minLen = POW32;
    // Get texture size as max iteration value
    ivec2 geometryTexSize = textureSize(geometryTex, 0).xy;
    int size = geometryTexSize.y * TRIANGLES_PER_ROW;
    // Iterate through lines of texture
    for(int i = 0; i < size; i++) {
        // Get position of current triangle/vertex in geometryTex
        int triangleColumn = i >> TRIANGLES_PER_ROW_POWER;
        ivec2 index = ivec2((i - triangleColumn * TRIANGLES_PER_ROW) * 3, triangleColumn);
        // Fetch triangle coordinates from scene graph
        vec4 t0 = texelFetch(geometryTex, index, 0);
        vec4 t1 = texelFetch(geometryTex, index + ivec2(1, 0), 0);
        vec4 t2 = texelFetch(geometryTex, index + ivec2(2, 0), 0);

        int tI = int(t2.y) << 1;
        // Test if cached transformed variables are still valid
        if (tI != cachedTI) {
            int iI = tI + 1;
            mat3 rotationII = rotation[iI];
            cachedTI = tI;
            tR = Ray(
                rotationII * (ray.origin + shift[iI]),
                rotationII * ray.unitDirection
            );
        }
        // Three cases:
        // t2.z = 0        => end of list: stop loop
        // t2.z = 1        => is bounding volume: do AABB intersection test
        // t2.z = 2        => is triangle: do triangle intersection test
        if (t2.z == 0.0) return hit;

        if (t2.z == 1.0) {
            if (!rayCuboid(minLen, tR, t0.xyz, vec3(t0.w, t1.xy))) i += int(t1.z);
        } else {
            mat3 triangle = mat3 (t0, t1, t2.x);
            // Test if triangle intersects ray
            vec3 intersection = moellerTrumbore(triangle, tR, minLen);
            // Test if ray even intersects
            if(intersection.x != 0.0) {
                // Calculate intersection point
                hit = Hit(intersection, tI, i);
                // Update maximum object distance for future rays
                minLen = intersection.x;
            }
        }
    }
    // Return ray hit with all required information
    return hit;
}


// Simplified rayTracer to only test if ray intersects anything
bool shadowTest(Ray ray, float l) {
    // Cache transformed ray attributes
    Ray tR = Ray(ray.origin, ray.unitDirection);
    int cachedTI = 0;
    // Precompute max length
    float minLen = l;
    // Get texture size as max iteration value
    int size = textureSize(geometryTex, 0).y * TRIANGLES_PER_ROW;
    // Iterate through lines of texture
    for(int i = 0; i < size; i++) {
        // Get position of current triangle/vertex in geometryTex
        int triangleColumn = i >> TRIANGLES_PER_ROW_POWER;
        ivec2 index = ivec2((i - triangleColumn * TRIANGLES_PER_ROW) * 3, triangleColumn);
        // Fetch triangle coordinates from scene graph
        vec4 t0 = texelFetch(geometryTex, index, 0);
        vec4 t1 = texelFetch(geometryTex, index + ivec2(1, 0), 0);
        vec4 t2 = texelFetch(geometryTex, index + ivec2(2, 0), 0);

        int tI = int(t2.y) << 1;
        // Test if cached transformed variables are still valid
        if (tI != cachedTI) {
            int iI = tI + 1;
            mat3 rotationII = rotation[iI];
            cachedTI = tI;
            tR = Ray(
                rotationII * (ray.origin + shift[iI]),
                normalize(rotationII * ray.unitDirection)
            );
        }
        // Three cases:
        // t2.z = 0        => end of list: stop loop
        // t2.z = 1        => is bounding volume: do AABB intersection test
        // t2.z = 2        => is triangle: do triangle intersection test
        if (t2.z == 0.0) return false;

        if (t2.z == 1.0) {
            if (!rayCuboid(minLen, tR, t0.xyz, vec3(t0.w, t1.xy))) i += int(t1.z);
        } else {
            mat3 triangle = mat3 (t0, t1, t2.x);
            // Test for triangle intersection in positive light ray direction
            if (moellerTrumboreCull(triangle, tR, minLen)) return true;
        }
    }
    // Tested all triangles, but there is no intersection
    return false;
}

float trowbridgeReitz(float alpha, float NdotH) {
    float numerator = alpha * alpha;
    float denom = NdotH * NdotH * (numerator - 1.0f) + 1.0f;
    return numerator / max(PI * denom * denom, BIAS);
}

float schlickBeckmann(float alpha, float NdotX) {
    float k = alpha * 0.5f;
    float denominator = NdotX * (1.0f - k) + k;
    denominator = max(denominator, BIAS);
    return NdotX / denominator;
}

float smith(float alpha, float NdotV, float NdotL) {
    return schlickBeckmann(alpha, NdotV) * schlickBeckmann(alpha, NdotL);
}

vec3 fresnel(vec3 F0, float theta) {
    // Use Schlick approximation
    return F0 + (1.0f - F0) * pow(1.0f - theta, 5.0f);
}

vec3 forwardTrace(Material material, vec3 lightDir, float strength, vec3 N, vec3 V) {
    float lenP1 = 1.0f + length(lightDir);
    // Apply inverse square law
    float brightness = strength / (lenP1 * lenP1);

    vec3 L = normalize(lightDir);
    vec3 H = normalize(V + L);

    float VdotH = max(dot(V, H), 0.0f);
    float NdotL = max(dot(N, L), 0.0f);
    float NdotH = max(dot(N, H), 0.0f);
    float NdotV = max(dot(N, V), 0.0f);

    float alpha = material.rme.x * material.rme.x;
    float BRDF = mix(1.0f, NdotV, material.rme.y);
    vec3 F0 = material.albedo * BRDF;

    vec3 Ks = fresnel(F0, VdotH);
    vec3 Kd = (1.0f - Ks) * (1.0f - material.rme.y);
    vec3 lambert = material.albedo * INV_PI;

    vec3 cookTorranceNumerator = Ks * trowbridgeReitz(alpha, NdotH) * smith(alpha, NdotV, NdotL);
    float cookTorranceDenominator = 4.0f * NdotV * NdotL;
    cookTorranceDenominator = max(cookTorranceDenominator, BIAS);

    vec3 cookTorrance = cookTorranceNumerator / cookTorranceDenominator;
    vec3 radiance = Kd * lambert + cookTorrance;

    // Outgoing light to camera
    return radiance * NdotL * brightness;
}

/*
vec3 referenceSample (sampler2D lightTex, vec4 randomVec, vec3 N, vec3 target, vec3 V, Material material, bool dontFilter, int triangleId, int i) {
    vec3 localColor = vec3(0);
    int lights = textureSize(lightTex, 0).y;

    for (int j = 0; j < lights; j++) {
        // Read light position
        vec3 light = texelFetch(lightTex, ivec2(0, j), 0).xyz;
        // Read light strength from texture
        vec2 strengthVariation = texelFetch(lightTex, ivec2(1, j), 0).xy;
        // Skip if strength is negative or zero
        // if (strengthVariation.x <= 0.0) continue;
        // Alter light source position according to variation.
        light = randomVec.xyz * strengthVariation.y + light;
        vec3 lightDir = light - target;
        vec3 lightColor = forwardTrace(lightDir, N, V, material, strengthVariation.x);
        // Compute quick exit criterion to potentially skip expensive shadow test
        bool quickExitCriterion = dot(lightDir, N) <= BIAS;
        Ray lightRay = Ray(light, target, lightDir, normalize(lightDir));
        // Test if in shadow
        if (quickExitCriterion || shadowTest(lightRay, triangleId)) {
            if (dontFilter || i == 0) renderId.w = float(((j % 128) << 1) + 1) * INV_255;
        } else {
            if (dontFilter || i == 0) renderId.w = float((j % 128) << 1) * INV_255;
            // localColor *= (totalWeight / reservoirLength) / reservoirWeight;
            localColor += lightColor;
        }
    }

    return localColor + material.rme.z + ambient * material.rme.y;
}


vec3 randomSample (vec4 randomVec, vec3 N, vec3 smoothNormal, vec3 target,  vec3 V, Material material, bool dontFilter, int triangleId, int i) {
    int lights = textureSize(lightTex, 0).y;

    int randIndex = int(floor(abs(randomVec.y) * float(lights)));

    
    // Read light position
    vec3 light = texelFetch(lightTex, ivec2(0, randIndex), 0).xyz;
    // Read light strength from texture
    vec2 strengthVariation = texelFetch(lightTex, ivec2(1, randIndex), 0).xy;
    // Skip if strength is negative or zero
    // if (strengthVariation.x <= 0.0) continue;
    // Alter light source position according to variation.
    light = randomVec.xyz * strengthVariation.y + light;
    vec3 lightDir = light - target;
    vec3 lightColor = forwardTrace(material, lightDir, strengthVariation.x, N, V);
    // Compute quick exit criterion to potentially skip expensive shadow test
    bool quickExitCriterion = dot(lightDir, N) <= BIAS;
    // Ray lightRay = Ray(light, target, lightDir, normalize(lightDir));
    Ray lightRay = Ray(target, light, lightDir, normalize(lightDir));
    // Test if in shadow
    if (quickExitCriterion || shadowTest(lightRay, triangleId)) {
        if (dontFilter || i == 0) renderId.w = float(((randIndex % 128) << 1) + 1) * INV_255;
        return vec3(material.rme.z);
    } else {
        if (dontFilter || i == 0) renderId.w = float((randIndex % 128) << 1) * INV_255;
        return lightColor * float(lights) + material.rme.z;
    }
}
*/

vec3 reservoirSample (Material material, Ray ray, vec4 randomVec, vec3 N, vec3 smoothNormal, float geometryOffset, bool dontFilter, int i) {
    vec3 localColor = vec3(0);
    float reservoirLength = 0.0f;
    float totalWeight = 0.0f;
    int reservoirNum = 0;
    float reservoirWeight = 0.0f;
    vec3 reservoirLight;
    vec3 reservoirLightDir;
    vec2 lastRandom = noise(randomVec.zw, BIAS).xy;

    int size = textureSize(lightTex, 0).y;
    for (int j = 0; j < size; j++) {
      // Read light strength from texture
      vec2 strengthVariation = texelFetch(lightTex, ivec2(1, j), 0).xy;
      // Skip if strength is negative or zero
      if (strengthVariation.x <= 0.0) continue;
      // Increment light weight
      reservoirLength ++;
      // Alter light source position according to variation.
      vec3 light = texelFetch(lightTex, ivec2(0, j), 0).xyz + randomVec.xyz * strengthVariation.y;
      vec3 dir = light - ray.origin;
    
      vec3 colorForLight = forwardTrace(material, dir, strengthVariation.x, N, - ray.unitDirection);
      localColor += colorForLight;
      float weight = length(colorForLight);
      totalWeight += weight;
      if (abs(lastRandom.y) * totalWeight <= weight) {
        reservoirNum = j;
        reservoirWeight = weight;
        reservoirLight = light;
        reservoirLightDir = dir;
      }
      // Update pseudo random variable.
      lastRandom = noise(lastRandom, BIAS).zw;
    }

    vec3 unitLightDir = normalize(reservoirLightDir);
    // Compute quick exit criterion to potentially skip expensive shadow test
    bool showColor = reservoirLength == 0.0 || reservoirWeight == 0.0;
    bool showShadow = dot(smoothNormal, unitLightDir) <= BIAS;
    // Apply emissive texture and ambient light
    vec3 baseLuminance = vec3(material.rme.z) * material.albedo;
    // Update filter
    if (dontFilter || i == 0) renderId.w = float((reservoirNum % 128) << 1) * INV_255;
    // Test if in shadow
    if (showColor) return localColor + baseLuminance;

    if (showShadow) {
        if (dontFilter || i == 0) renderId.w += INV_255;
        return baseLuminance;
    }
    // Apply geometry offset
    vec3 offsetTarget = ray.origin + geometryOffset * smoothNormal;
    Ray lightRay = Ray(offsetTarget, unitLightDir);

    if (shadowTest(lightRay, length(reservoirLightDir))) {
        if (dontFilter || i == 0) renderId.w += INV_255;
        return baseLuminance;
    } else {
        return localColor + baseLuminance;
    }
}


vec3 lightTrace(Hit hit, vec3 target, vec3 camera, float cosSampleN, int bounces) {
    // Set bool to false when filter becomes necessary
    bool dontFilter = true;
    // Use additive color mixing technique, so start with black
    vec3 finalColor = vec3(0);
    vec3 importancyFactor = vec3(1);
    vec3 filterFactor = vec3(1);
    originalColor = vec3(1);

    Ray ray = Ray(camera, normalize(target - camera));
    vec3 lastHitPoint = camera;
    // Iterate over each bounce and modify color accordingly
    for (int i = 0; i < bounces && length(filterFactor) >= minImportancy * SQRT3; i++) {
        float fi = float(i);
        mat3 rTI = rotation[hit.transformId];
        vec3 sTI = shift[hit.transformId];
        // Transform hit point
        ray.origin = hit.suv.x * ray.unitDirection + ray.origin;
        // Calculate barycentric coordinates
        vec3 uvw = vec3(1.0 - hit.suv.y - hit.suv.z, hit.suv.y, hit.suv.z);

        // Get position of current triangle/vertex in sceneTex
        int triangleColumn = hit.triangleId >> TRIANGLES_PER_ROW_POWER;
        // Fetch triangle coordinates from scene graph texture
        ivec2 indexGeometry = ivec2((hit.triangleId - triangleColumn * TRIANGLES_PER_ROW) * 3, triangleColumn);
        vec4 g0 = texelFetch(geometryTex, indexGeometry, 0);
        vec4 g1 = texelFetch(geometryTex, indexGeometry + ivec2(1, 0), 0);
        vec4 g2 = texelFetch(geometryTex, indexGeometry + ivec2(2, 0), 0);

        mat3 triangle = rTI * mat3(g0, g1, g2.x);
        vec3 offsetRayTarget = ray.origin - sTI;

        vec3 geometryNormal = normalize(cross(triangle[0] - triangle[1], triangle[0] - triangle[2]));
        vec3 diffs = vec3(
            distance(offsetRayTarget, triangle[0]),
            distance(offsetRayTarget, triangle[1]),
            distance(offsetRayTarget, triangle[2])
        );
        // Fetch scene texture data
        ivec2 indexScene = ivec2((hit.triangleId - triangleColumn * TRIANGLES_PER_ROW) * 7, triangleColumn);
        // Fetch texture data
        vec4 t0 = texelFetch(sceneTex, indexScene, 0);
        vec4 t1 = texelFetch(sceneTex, indexScene + ivec2(1, 0), 0);
        vec4 t2 = texelFetch(sceneTex, indexScene + ivec2(2, 0), 0);
        vec4 t3 = texelFetch(sceneTex, indexScene + ivec2(3, 0), 0);
        vec4 t4 = texelFetch(sceneTex, indexScene + ivec2(4, 0), 0);
        vec4 t5 = texelFetch(sceneTex, indexScene + ivec2(5, 0), 0);
        vec4 t6 = texelFetch(sceneTex, indexScene + ivec2(6, 0), 0);
        // Pull normals
        mat3 normals = rTI * mat3(t0, t1, t2.x);
        // Interpolate smooth normal
        vec3 smoothNormal = normalize(normals * uvw);
        // to prevent unnatural hard shadow / reflection borders due to the difference between the smooth normal and geometry
        vec3 angles = acos(abs(geometryNormal * normals));
        vec3 angleTan = clamp(tan(angles), 0.0, 1.0);
        float geometryOffset = dot(diffs * angleTan, uvw);
        // Interpolate final barycentric texture coordinates between UV's of the respective vertices
        vec2 barycentric = mat3x2(t2.yzw, t3.xyz) * uvw;
        // Gather material attributes (albedo, roughness, metallicity, emissiveness, translucency, partical density and optical density aka. IOR) out of world texture
        Material material = Material(
            fetchTexVal(tex, barycentric, t3.w, vec3(t4.zw, t5.x)),
            fetchTexVal(pbrTex, barycentric, t4.x, t5.yzw),
            fetchTexVal(translucencyTex, barycentric, t4.y, t6.xyz)
        );
        
        ray = Ray(ray.origin, normalize(ray.origin - lastHitPoint));
        // If ray reflects from inside or onto an transparent object,
        // the surface faces in the opposite direction as usual
        float signDir = sign(dot(ray.unitDirection, smoothNormal));
        smoothNormal *= - signDir;

        // Generate pseudo random vector
        vec4 randomVec = noise(clipSpace.xy * length(ray.origin - lastHitPoint), fi + cosSampleN * PHI);
        vec3 randomSpheareVec = normalize(smoothNormal + normalize(randomVec.xyz));
        float BRDF = mix(1.0f, abs(dot(smoothNormal, ray.unitDirection)), material.rme.y);

        // Alter normal according to roughness value
        float roughnessBRDF = material.rme.x * BRDF;
        vec3 roughNormal = normalize(mix(smoothNormal, randomSpheareVec, roughnessBRDF));

        vec3 H = normalize(roughNormal - ray.unitDirection);
        float VdotH = max(dot(- ray.unitDirection, H), 0.0f);
        vec3 F0 = material.albedo * BRDF;
        vec3 f = fresnel(F0, VdotH);

        float fresnelReflect = max(f.x, max(f.y, f.z));
        // object is solid or translucent by chance because of the fresnel effect
        bool isSolid = material.tpo.x * fresnelReflect <= abs(randomVec.w);

        // Determine local color considering PBR attributes and lighting
        vec3 localColor = reservoirSample(material, ray, randomVec, - signDir * roughNormal, - signDir * smoothNormal, geometryOffset, dontFilter, i);
        // Calculate primary light sources for this pass if ray hits non translucent object
        finalColor += localColor * importancyFactor;
        // Multiply albedo with either absorption value or filter colo
        if (dontFilter) {
            originalColor *= (material.albedo + INV_255);
            finalColor /= (material.albedo + INV_255);
            
            // importancyFactor /= material.albedo;
            // importancyFactor *= material.albedo;
            // Update last used tpo.x value
            originalTPOx = material.tpo.x;
            // Add filtering intensity for respective surface
            originalRMEx += material.rme.x;
            // Update render id
            vec4 renderIdUpdate = pow(2.0f, - fi) * vec4(combineNormalRME(smoothNormal, material.rme), 0.0f);

            renderId += renderIdUpdate;
            // if (i == 0) renderOriginalId += renderIdUpdate;
            // Test if filter is already necessary
            dontFilter = (material.rme.x < 0.01f && isSolid) || !isSolid;

            if(isSolid && material.tpo.x > 0.01f) {
                // glassFilter += 1.0f;
                dontFilter = false;
            }
            
        } else {
            importancyFactor *= material.albedo;
        }

        filterFactor *= material.albedo;
        // Update length of first fector to control blur intensity
        if (i == 1) firstRayLength = min(length(ray.origin - lastHitPoint) / length(lastHitPoint - camera), firstRayLength);

        // Handle translucency and skip rest of light calculation
        if(isSolid) {
            // Calculate reflecting ray
            ray.unitDirection = normalize(mix(reflect(ray.unitDirection, smoothNormal), randomSpheareVec, roughnessBRDF));
        } else {
            float eta = mix(1.0f / material.tpo.z, material.tpo.z, max(signDir, 0.0f));
            // Refract ray depending on IOR (material.tpo.z)
            ray.unitDirection = normalize(mix(refract(ray.unitDirection, smoothNormal, eta),randomSpheareVec, roughnessBRDF));
        }
        // Calculate next intersection
        hit = rayTracer(ray);
        // Stop loop if there is no intersection and ray goes in the void
        if (hit.triangleId == - 1) break;
        // Update other parameters
        lastHitPoint = ray.origin;
    }
    // Return final pixel color
    return finalColor + importancyFactor * ambient;
}

void main() {
    // Transform normal according to object transform
    int tI = transformationId << 1;
    vec3 uvw = vec3(uv, 1.0f - uv.x - uv.y);
    // Generate hit struct for pathtracer
    Hit hit = Hit(vec3(distance(absolutePosition, camera), uvw.yz), tI, initTriangleId);
    // vec3 finalColor = material.rme;
    vec3 finalColor = vec3(0);
    // Generate multiple samples
    for(int i = 0; i < samples; i++) {
        // Use cosine as noise in random coordinate picker
        float cosSampleN = cos(float(i));
        finalColor += lightTrace(hit, absolutePosition, camera, cosSampleN, maxReflections);
    }
    // Average ray colors over samples.
    float invSamples = 1.0f / float(samples);
    finalColor *= invSamples;

    /*if(useFilter == 1) {
        // Render all relevant information to 4 textures for the post processing shader
        renderColor = vec4(fract(finalColor), 1.0f);
        // 16 bit HDR for improved filtering
        renderColorIp = vec4(floor(finalColor) * INV_255, glassFilter);
    } else {
    */
    finalColor *= originalColor;

    if (isTemporal == 0 && hdr == 1) {
        // Apply Reinhard tone mapping
        finalColor = finalColor / (finalColor + vec3(1.0f));
        // Gamma correction
        // float gamma = 0.8f;
        // finalColor = pow(4.0f * finalColor, vec3(1.0f / gamma)) / 4.0f * 1.3f;
    }


    if (isTemporal == 1) {
        renderColor = vec4(fract(finalColor), 1.0f);
        // 16 bit HDR for improved filtering
        renderColorIp = vec4(floor(finalColor) * INV_255, 1.0f);
    } else {
        renderColor = vec4(finalColor, 1.0f);
    }
    //}
    /*
    
    */
    // render normal (last in transparency)
    renderId += vec4(0.0f, 0.0f, 0.0f, INV_255);
    // render modulus of absolute position (last in transparency)´
    // renderColor = vec4(smoothNormal, 1.0);
    // renderColorIp = vec4(0.0);
}