#version 300 es
precision highp float;
in vec2 clipSpace;
uniform sampler2D cache0;
uniform sampler2D cache1;
uniform sampler2D cache2;
uniform sampler2D cache3;
uniform sampler2D cache4;
uniform sampler2D cache5;
uniform sampler2D cache6;
uniform sampler2D cache7;
uniform sampler2D cache8;
out vec4 outColor;

void main () {
    ivec2 texel = ivec2(vec2(textureSize(cache0, 0)) * clipSpace);

    mat4 c0 = mat4(
        texelFetch(cache1, texel, 0), 
        texelFetch(cache2, texel, 0),
        texelFetch(cache3, texel, 0),
        texelFetch(cache4, texel, 0)
    );

    mat4 c1 = mat4(
        texelFetch(cache5, texel, 0), 
        texelFetch(cache6, texel, 0),
        texelFetch(cache7, texel, 0),
        texelFetch(cache8, texel, 0)
    );

    vec4 minRGB = vec4(1.0);
    vec4 maxRGB = vec4(0.0);
    
    for (int i = 0; i < 3; i++) {
        for (int j = 0; j < 3; j++) {
            vec4 p = texelFetch(cache0, texel + ivec2(i - 1, j - 1), 0);
            minRGB = min(minRGB, p);
            maxRGB = max(maxRGB, p);
        }
    }
    
    outColor = texelFetch(cache0, texel, 0);
    for (int i = 0; i < 4; i++) outColor += min(max(c0[i], minRGB), maxRGB);
    for (int i = 0; i < 4; i++) outColor += min(max(c1[i], minRGB), maxRGB);
    outColor /= 9.0;
}