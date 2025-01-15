#version 300 es
  #define INV_256 0.00390625

  precision highp float;
  in vec2 clipSpace;
  
  uniform sampler2D preRenderColor;
  uniform sampler2D preRenderColorIp;
  uniform sampler2D preRenderNormal;
  uniform sampler2D preRenderOriginalColor;
  uniform sampler2D preRenderId;
  uniform sampler2D preRenderOriginalId;

  layout(location = 0) out vec4 renderColor;
  layout(location = 1) out vec4 renderColorIp;
  layout(location = 2) out vec4 renderId;

  void main() {
    // Get texture size
    ivec2 texel = ivec2(vec2(textureSize(preRenderColor, 0)) * clipSpace);
    vec4 centerColor = texelFetch(preRenderColor, texel, 0);
    vec4 centerColorIp = texelFetch(preRenderColorIp, texel, 0);
    vec4 centerOColor = texelFetch(preRenderOriginalColor, texel, 0);
    vec4 centerId = texelFetch(preRenderId, texel, 0);

    int centerIdw = int(centerId.w * 255.0);
    int centerLightNum = centerIdw / 2;
    int centerShadow = centerIdw % 2;

    renderId = centerId;

    vec4 centerOId = texelFetch(preRenderOriginalId, texel, 0);
    vec4 color = vec4(0);
    float count = 0.0;

    const ivec2 stencil1[4] = ivec2[4](
                     ivec2(-1, 0), 
      ivec2( 0, -1),              ivec2( 0, 1),
                     ivec2( 1, 0)
    );
    
    const vec2 stencil2[21] = vec2[21](
                  vec2(-2, -1), vec2(-2, 0), vec2(-2, 1),
    vec2(-1, -2), vec2(-1, -1), vec2(-1, 0), vec2(-1, 1), vec2(-1, 2),
    vec2( 0, -2), vec2( 0, -1), vec2( 0, 0), vec2( 0, 1), vec2( 0, 2),
    vec2( 1, -2), vec2( 1, -1), vec2( 1, 0), vec2( 1, 1), vec2( 1, 2),
                  vec2( 2, -1), vec2( 2, 0), vec2( 2, 1)
    );

    const vec2 stencil3[37] = vec2[37](
                                  vec2(-3, -1), vec2(-3, 0), vec2(-3, 1), 
                    vec2(-2, -2), vec2(-2, -1), vec2(-2, 0), vec2(-2, 1), vec2(-2, 2),
      vec2(-1, -3), vec2(-1, -2), vec2(-1, -1), vec2(-1, 0), vec2(-1, 1), vec2(-1, 2), vec2(-1, 3),
      vec2( 0, -3), vec2( 0, -2), vec2( 0, -1), vec2( 0, 0), vec2( 0, 1), vec2( 0, 2), vec2( 0, 3),
      vec2( 1, -3), vec2( 1, -2), vec2( 1, -1), vec2( 1, 0), vec2( 1, 1), vec2( 1, 2), vec2( 1, 3),
                    vec2( 2, -2), vec2( 2, -1), vec2( 2, 0), vec2( 2, 1), vec2( 2, 2),
                                  vec2( 3, -1), vec2( 3, 0), vec2( 3, 1)
    );
    
    if (centerOId.w != 0.0 && centerColorIp.w != 0.0) {
      vec4 id = centerId;

      mat4 ids = mat4(0);
      mat4 oIds = mat4(0);

      vec4 ipws = vec4(0);
      for (int i = 0; i < 4; i++) {
        ids[i] = texelFetch(preRenderId, texel + stencil1[i], 0);
        oIds[i] = texelFetch(preRenderOriginalId, texel + stencil1[i], 0);
        ipws[i] = texelFetch(preRenderColorIp, texel + stencil1[i], 0).w;
      }

      ivec4 vote = ivec4(0);
      for (int i = 0; i < 4; i++) {
        if (ipws[i] == 0.0) {
          vote[i] = 1;
          if (ids[i].xyz == id.xyz && oIds[i] == centerOId) vote[i] ++;
          for (int j = i + 1; j < 4; j++) if (ids[i].xyz == ids[j].xyz && oIds[i] == oIds[j]) vote[i] ++;
        }
      }

      int maxVote = vote[0];
      int idNumber = 0;

      for (int i = 1; i < 4; i++) {
        if (vote[i] >= maxVote) {
          maxVote = vote[i];
          idNumber = i;
        }
      }
      
      renderId = ids[idNumber];
      renderColorIp.w = max(1.0 - sign(float(maxVote)), 0.0);
    }

    if (centerOColor.w == 0.0) {
      color = centerColor;
      count = 1.0;
    } else {
      for (int i = 0; i < 37; i++) {
        ivec2 coord = texel + ivec2(stencil3[i] * (1.0 + centerOColor.w) * (1.0 + centerOColor.w) * 3.5);
        
        vec4 id = texelFetch(preRenderId, coord, 0);
        vec4 originalId = texelFetch(preRenderOriginalId, coord, 0);

        int idW = int(id.w * 255.0);
        int lightNum = idW / 2;
        int shadow = idW % 2;    

        vec4 nextColor = texelFetch(preRenderColor, coord, 0);
        vec4 nextColorIp = texelFetch(preRenderColorIp, coord, 0);
        if (centerId.xyz == id.xyz && centerOId == originalId && (centerLightNum != lightNum || centerShadow == shadow)) {
          color += nextColor + nextColorIp * 256.0;
          count ++;
        }
      }
    }
    
    
    float invCount = 1.0 / count;
    renderColor = sign(centerColor.w) * vec4(mod(color.xyz * invCount, 1.0), centerColor.w);
    // Set out color for render texture for the antialiasing filter
    renderColorIp = sign(centerColor.w) * vec4(floor(color.xyz * invCount) * INV_256, renderColorIp.w);
  }