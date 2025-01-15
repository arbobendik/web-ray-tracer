#version 300 es
  #define INV_256 0.00390625
  
  precision highp float;
  in vec2 clipSpace;

  uniform sampler2D preRenderColor;
  uniform sampler2D preRenderColorIp;
  uniform sampler2D preRenderOriginalColor;
  uniform sampler2D preRenderId;
  uniform sampler2D preRenderOriginalId;

  layout(location = 0) out vec4 renderColor;
  layout(location = 1) out vec4 renderColorIp;
  layout(location = 2) out vec4 renderOriginalColor;

  void main(){
    // Get texture size
    ivec2 texel = ivec2(vec2(textureSize(preRenderColor, 0)) * clipSpace);
    vec4 centerColor = texelFetch(preRenderColor, texel, 0);
    vec4 centerColorIp = texelFetch(preRenderColorIp, texel, 0);
    vec4 centerOColor = texelFetch(preRenderOriginalColor, texel, 0);
    vec4 centerId = texelFetch(preRenderId, texel, 0);
    vec4 centerOId = texelFetch(preRenderOriginalId, texel, 0);
    vec4 color = centerColor + vec4(centerColorIp.xyz, 0.0) * 256.0;;
    vec4 oColor = centerOColor;
    float ipw = centerColorIp.w;
    float count = 1.0;
    float oCount = 1.0;


    const vec2 stencil2[20] = vec2[20](
                  vec2(-2, -1), vec2(-2, 0), vec2(-2, 1),
    vec2(-1, -2), vec2(-1, -1), vec2(-1, 0), vec2(-1, 1), vec2(-1, 2),
    vec2( 0, -2), vec2( 0, -1),              vec2( 0, 1), vec2( 0, 2),
    vec2( 1, -2), vec2( 1, -1), vec2( 1, 0), vec2( 1, 1), vec2( 1, 2),
                  vec2( 2, -1), vec2( 2, 0), vec2( 2, 1)
    );

    const vec2 stencil3[36] = vec2[36](
                                vec2(-3, -1), vec2(-3, 0), vec2(-3, 1), 
                  vec2(-2, -2), vec2(-2, -1), vec2(-2, 0), vec2(-2, 1), vec2(-2, 2),
    vec2(-1, -3), vec2(-1, -2), vec2(-1, -1), vec2(-1, 0), vec2(-1, 1), vec2(-1, 2), vec2(-1, 3),
    vec2( 0, -3), vec2( 0, -2), vec2( 0, -1),              vec2( 0, 1), vec2( 0, 2), vec2( 0, 3),
    vec2( 1, -3), vec2( 1, -2), vec2( 1, -1), vec2( 1, 0), vec2( 1, 1), vec2( 1, 2), vec2( 1, 3),
                  vec2( 2, -2), vec2( 2, -1), vec2( 2, 0), vec2( 2, 1), vec2( 2, 2),
                                vec2( 3, -1), vec2( 3, 0), vec2( 3, 1)
    );
    
    // Apply blur filter on image
    for (int i = 0; i < 36; i++) {
      ivec2 coord = texel + ivec2(stencil3[i] * (1.0 + 2.0 * tanh(centerOColor.w + centerOId.w * 4.0)));
      vec4 id = texelFetch(preRenderId, coord, 0);
      vec4 nextOId = texelFetch(preRenderOriginalId, coord, 0);
      vec4 nextColor = texelFetch(preRenderColor, coord, 0);
      vec4 nextColorIp = texelFetch(preRenderColorIp, coord, 0);
      vec4 nextOColor = texelFetch(preRenderOriginalColor, coord, 0);

      if (centerOId.xyz == nextOId.xyz) {
        if (min(centerOId.w, nextOId.w) > 0.1 && (id == centerId || max(nextColorIp.w, centerColorIp.w) >= 0.1)) {
            color += nextColor + vec4(nextColorIp.xyz, 0.0) * 256.0;
            count ++;
            ipw += nextColorIp.w;
            oColor += nextOColor;
            oCount ++;
        } else if (id.xyz == centerId.xyz) {
          color += nextColor + vec4(nextColorIp.xyz, 0.0) * 256.0;
          count ++;
        }
      }

      
    }

    float invCount = 1.0 / count;
    renderColor = centerColor.w * vec4(mod(color.xyz * invCount, 1.0), color.w * invCount);
    // Set out color for render texture for the antialiasing filter
    renderColorIp =  centerColor.w * vec4(floor(color.xyz * invCount) * INV_256, ipw);
    renderOriginalColor = centerColor.w * oColor / oCount;
  }