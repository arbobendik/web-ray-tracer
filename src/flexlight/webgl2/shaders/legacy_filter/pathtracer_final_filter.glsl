#version 300 es
  precision highp float;
  in vec2 clipSpace;
  uniform sampler2D preRenderColor;
  uniform sampler2D preRenderColorIp;
  uniform sampler2D preRenderOriginalColor;
  uniform sampler2D preRenderId;
  uniform sampler2D preRenderOriginalId;
  uniform int hdr;
  out vec4 outColor;
  void main(){
    // Get texture size
    ivec2 texel = ivec2(vec2(textureSize(preRenderColor, 0)) * clipSpace);
    vec4 centerColor = texelFetch(preRenderColor, texel, 0);
    vec4 centerColorIp = texelFetch(preRenderColorIp, texel, 0);
    vec4 centerOColor = texelFetch(preRenderOriginalColor, texel, 0);
    vec4 centerId = texelFetch(preRenderId, texel, 0);
    vec4 centerOId = texelFetch(preRenderOriginalId, texel, 0);
    vec4 color = vec4(0);
    vec4 oColor = vec4(0);
    float count = 0.0;
    float oCount = 0.0;

    const vec2 stencil3[37] = vec2[37](
                                vec2(-3, -1), vec2(-3, 0), vec2(-3, 1), 
                  vec2(-2, -2), vec2(-2, -1), vec2(-2, 0), vec2(-2, 1), vec2(-2, 2),
    vec2(-1, -3), vec2(-1, -2), vec2(-1, -1), vec2(-1, 0), vec2(-1, 1), vec2(-1, 2), vec2(-1, 3),
    vec2( 0, -3), vec2( 0, -2), vec2( 0, -1), vec2( 0, 0), vec2( 0, 1), vec2( 0, 2), vec2( 0, 3),
    vec2( 1, -3), vec2( 1, -2), vec2( 1, -1), vec2( 1, 0), vec2( 1, 1), vec2( 1, 2), vec2( 1, 3),
                  vec2( 2, -2), vec2( 2, -1), vec2( 2, 0), vec2( 2, 1), vec2( 2, 2),
                                vec2( 3, -1), vec2( 3, 0), vec2( 3, 1)
    );

    // Apply blur filter on image
    for (int i = 0; i < 37; i++) {
      ivec2 coord = texel + ivec2(stencil3[i] * (0.7 + 2.0 * tanh(centerOColor.w + centerOId.w * 4.0)));
      vec4 id = texelFetch(preRenderId, coord, 0);
      vec4 nextOId = texelFetch(preRenderOriginalId, coord, 0);
      vec4 nextColor = texelFetch(preRenderColor, coord, 0);
      vec4 nextColorIp = texelFetch(preRenderColorIp, coord, 0);
      vec4 nextOColor = texelFetch(preRenderOriginalColor, coord, 0);

      // Test if at least one pixel is translucent and they are pixels of the same object.
      bool blurTranslucent = max(nextColorIp.w, centerColorIp.w) != 0.0 && min(centerOId.w, nextOId.w) > 0.0;
      if (blurTranslucent && centerOId.xyz == nextOId.xyz) {
        oColor += nextOColor;
        oCount ++;
      }
      
      if ((blurTranslucent || centerId.xyz == id.xyz) && centerOId.xyz == nextOId.xyz) {
        color += nextColor + nextColorIp * 255.0;
        count ++;
      }
    }
    
    if (centerColor.w > 0.0) {
      // Set out targetColor for render texture for the antialiasing filter
      vec3 finalColor = color.xyz / count;
      finalColor *= (oCount == 0.0) ? centerOColor.xyz : oColor.xyz / oCount;

      if (hdr == 1) {
        // Apply Reinhard tone mapping
        finalColor = finalColor / (finalColor + vec3(1.0));
        // Gamma correction
        // float gamma = 0.8;
        // finalColor = pow(4.0 * finalColor, vec3(1.0 / gamma)) / 4.0 * 1.3;
      }
      outColor = vec4(finalColor, 1.0);
    } else {
      outColor = vec4(0);
    }
  }