#version 300 es
#define TRIANGLES_PER_ROW_POWER 8
#define TRIANGLES_PER_ROW 256
#define INV_65535 0.000015259021896696422

precision highp int;
precision highp float;
precision highp sampler2D;

in int triangleId;
in int vertexId;

layout (std140) uniform transformMatrix
{
    mat3 rotation[MAX_TRANSFORMS];
    vec3 shift[MAX_TRANSFORMS];
};

uniform vec3 cameraPosition;
uniform mat3 viewMatrix;

// Texture with vertex information about all triangles in scene
uniform sampler2D geometryTex;

out vec3 relativePosition;
out vec3 absolutePosition;
out vec2 uv;
out vec3 clipSpace;

flat out vec3 camera;
flat out int initTriangleId;
flat out int transformationId;

const vec2 baseUVs[3] = vec2[3](
    vec2(1, 0), 
    vec2(0, 1), 
    vec2(0, 0)
);

void main() {
    // Calculate vertex position in texture
    int triangleColumn = triangleId >> TRIANGLES_PER_ROW_POWER;
    ivec2 index = ivec2((triangleId - triangleColumn * TRIANGLES_PER_ROW) * 3, triangleColumn);

    vec4 t0 = texelFetch(geometryTex, index, 0);
    vec4 t1 = texelFetch(geometryTex, index + ivec2(1, 0), 0);
    vec4 t2 = texelFetch(geometryTex, index + ivec2(2, 0), 0);

    transformationId = int(t2.y);
    // Apply local geometry transform
    int tI = transformationId << 1;
    // Combine vertex position
    switch (vertexId) {
        case 0:
            relativePosition = t0.xyz;
            break;
        case 1:
            relativePosition = vec3(t0.w, t1.xy);
            break;
        case 2:
            relativePosition = vec3(t1.zw, t2.x);
            break;
    }
    // Transform position
    absolutePosition = rotation[tI] * relativePosition + shift[tI];
    clipSpace = viewMatrix * (absolutePosition - cameraPosition);
    // Set triangle position in clip space
    gl_Position = vec4(clipSpace.xy, - 1.0f / (1.0f + exp(clipSpace.z * INV_65535)), clipSpace.z);

    uv = baseUVs[vertexId];
    camera = cameraPosition;
    initTriangleId = triangleId;
}