"use strict";

const RayTracer = (target_canvas) => {
  const RT = {
    // Initialize Gl context variable.
    GL: target_canvas.getContext("webgl2"),
    // Small internal Math library.
    Math: {
      // Cross product.
      cross: (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]],
      // Calculate difference between 2 vectors.
      vec_diff: (a, b) => a.map((item, i) => b[i] - item),
    },
    // Configurable runtime properties of the Raytracer.
    QUEUE: [],
    LIGHT: [[0, 10, 0]],
    SKYBOX: [0, 0, 0],
    TEXTURE: [],
    PBR_TEXTURE: [],
    TRANSLUCENCY_TEXTURE: [],
    TEXTURE_SIZES: [64, 64],
    // Quality settings.
    SAMPLES: 1,
    SCALE: 1,
    MAX_REFLECTIONS: 5,
    MIN_IMPORTANCY: 0.3,
    FILTER: true,
    ANTIALIASING: true,
    MOBILE: true,
    // Camera and frustrum settings.
    FOV: Math.PI,
    X: 0, Y: 0, Z: 0,
    FX: 0, FY: 0,
    // Movement settings.
    MOUSE_ROTATION: true,
    MOVEMENT: true,
    MOVEMENT_SPEED: 0.01,
    MOUSE_Y: 1 / 500, MOUSE_X: 1 / 500,
    KEYMAP: [["w", 0, 0, 1], ["s", 0, 0, -1], ["a", 1, 0, 0], ["d", -1, 0, 0], [" ", 0, 1, 0], ["shift", 0, -1, 0]],
    // Performance metric.
    FPS: 0,
    // Init scene state GL textures.
    WorldTexture:null, PbrTexture: null, TranslucencyTexture: null, ColorTexture: null, LightTexture: null,
    // Generate texture from rgba array.
    GENERATE_TEX: async (array, width, height) => {
      var partCanvas = document.createElement('canvas');
      var partCtx = partCanvas.getContext('2d');
      partCanvas.width = width;
      partCanvas.height = height;
      // Convert texel data to uint8.
      let imgArray = new Uint8ClampedArray(array);
      // Create Image element.
      let imgData = partCtx.createImageData(width, height);
      // Set imgArray as image source.
      imgData.data.set(imgArray, 0);
      // Set image data in canvas.
      partCtx.putImageData(imgData, 0, 0);
      // Disable image smoothing to get non-blury pixel values.
      partCtx.imageSmoothingEnabled = false;
      // Set part canvas as image source.
      let image = new Image();
      image.src = await partCanvas.toDataURL();
      return await image;
    },
    // Generate pbr texture (pbr metallic)
    GENERATE_PBR_TEX: async (array, width, height) => {
      var partCanvas = document.createElement('canvas');
      var partCtx = partCanvas.getContext('2d');
      partCanvas.width = width;
      partCanvas.height = height;
      // Create new array.
      let texelArray = [];
      // Convert image to rgba.
      for (let i = 0; i < array.length; i+=3) texelArray.push([array[i] * 255, array[i+1] * 255, array[i+2] * 255, 255]);
      // Convert texel data to uint8.
      let imgArray = new Uint8ClampedArray(texelArray.flat());
      // Create Image element.
      let imgData = partCtx.createImageData(width, height);
      // Set imgArray as image source.
      imgData.data.set(imgArray, 0);
      // Set image data in canvas.
      partCtx.putImageData(imgData, 0, 0);
      // Disable image smoothing to get non-blury pixel values.
      partCtx.imageSmoothingEnabled = false;
      // Set part canvas as image source.
      let image = new Image();
      image.src = await partCanvas.toDataURL();
      return await image;
    },
    // Generate translucency texture (translucency, particle density, optical density)
    // Pbr images are generated the same way.
    GENERATE_TRANSLUCENCY_TEX: async (array, width, height) => await RT.GENERATE_PBR_TEX(array, width, height),
    // Functions to update scene states.
    UPDATE_PBR_TEXTURE: () => {
      RT.GL.bindTexture(RT.GL.TEXTURE_2D, RT.PbrTexture);
      RT.GL.pixelStorei(RT.GL.UNPACK_ALIGNMENT, 1);
      // Set data texture details and tell webgl, that no mip maps are required.
      RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MIN_FILTER, RT.GL.NEAREST);
      RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MAG_FILTER, RT.GL.NEAREST);
      // Test if there is even a texture.
      if (RT.PBR_TEXTURE.length === 0){
        RT.GL.texImage2D(RT.GL.TEXTURE_2D, 0, RT.GL.RGBA, 1, 1, 0, RT.GL.RGBA, RT.GL.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
        return;
      }
      let [width, height] = RT.TEXTURE_SIZES;
      let textureWidth = Math.floor(512 / RT.TEXTURE_SIZES[0]);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      canvas.width = width * textureWidth;
      canvas.height = height * RT.PBR_TEXTURE.length;
      RT.PBR_TEXTURE.forEach(async (item, i) => {
        // Draw element on atlas canvas.
        ctx.drawImage(item, width*(i%textureWidth), height*Math.floor(i/textureWidth), width, height);
      });
      RT.GL.texImage2D(RT.GL.TEXTURE_2D, 0, RT.GL.RGBA, canvas.width, canvas.height, 0, RT.GL.RGBA, RT.GL.UNSIGNED_BYTE, Uint8Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data));
    },
    // Functions to update scene states.
    UPDATE_TRANSLUCENCY_TEXTURE: () => {
      RT.GL.bindTexture(RT.GL.TEXTURE_2D, RT.TranslucencyTexture);
      RT.GL.pixelStorei(RT.GL.UNPACK_ALIGNMENT, 1);
      // Set data texture details and tell webgl, that no mip maps are required.
      RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MIN_FILTER, RT.GL.NEAREST);
      RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MAG_FILTER, RT.GL.NEAREST);
      // Test if there is even a texture.
      if (RT.TRANSLUCENCY_TEXTURE.length === 0){
        RT.GL.texImage2D(RT.GL.TEXTURE_2D, 0, RT.GL.RGBA, 1, 1, 0, RT.GL.RGBA, RT.GL.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
        return;
      }
      let [width, height] = RT.TEXTURE_SIZES;
      let textureWidth = Math.floor(512 / RT.TEXTURE_SIZES[0]);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      canvas.width = width * textureWidth;
      canvas.height = height * RT.TRANSLUCENCY_TEXTURE.length;
      RT.TRANSLUCENCY_TEXTURE.forEach(async (item, i) => {
        // Draw element on atlas canvas.
        ctx.drawImage(item, width*(i%textureWidth), height*Math.floor(i/textureWidth), width, height);
      });
      RT.GL.texImage2D(RT.GL.TEXTURE_2D, 0, RT.GL.RGBA, canvas.width, canvas.height, 0, RT.GL.RGBA, RT.GL.UNSIGNED_BYTE, Uint8Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data));
    },
    // Regenerate texture after change.
    UPDATE_TEXTURE: () => {
      RT.GL.bindTexture(RT.GL.TEXTURE_2D, RT.ColorTexture);
      RT.GL.pixelStorei(RT.GL.UNPACK_ALIGNMENT, 1);
      // Set data texture details and tell webgl, that no mip maps are required.
      RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MIN_FILTER, RT.GL.NEAREST);
      RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MAG_FILTER, RT.GL.NEAREST);
      RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_WRAP_S, RT.GL.CLAMP_TO_EDGE);
      RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_WRAP_T, RT.GL.CLAMP_TO_EDGE);

      // Test if there is even a texture.
      if (RT.TEXTURE.length === 0){
        RT.GL.texImage2D(RT.GL.TEXTURE_2D, 0, RT.GL.RGBA, 1, 1, 0, RT.GL.RGBA, RT.GL.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
        return;
      }

      let [width, height] = RT.TEXTURE_SIZES;
      let textureWidth = Math.floor(512 / RT.TEXTURE_SIZES[0]);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      canvas.width = width * textureWidth;
      canvas.height = height * RT.TEXTURE.length;

      RT.TEXTURE.forEach(async (item, i) => {
          ctx.drawImage(item, width*(i%textureWidth), height*Math.floor(i/3), width, height);
      });
      RT.GL.texImage2D(RT.GL.TEXTURE_2D, 0, RT.GL.RGBA, canvas.width, canvas.height, 0, RT.GL.RGBA, RT.GL.UNSIGNED_BYTE, new Uint8Array(Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data)));
    },

    UPDATE_LIGHT: () => {
      RT.GL.bindTexture(RT.GL.TEXTURE_2D, RT.LightTexture);
      RT.GL.pixelStorei(RT.GL.UNPACK_ALIGNMENT, 1);
      // Set data texture details and tell webgl, that no mip maps are required.
      RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MIN_FILTER, RT.GL.NEAREST);
      RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MAG_FILTER, RT.GL.NEAREST);
      RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_WRAP_S, RT.GL.CLAMP_TO_EDGE);
      RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_WRAP_T, RT.GL.CLAMP_TO_EDGE);

      var LightTexArray = [];
      // Iterate over light sources and default strength value if not set.
      for (let i = 0; i < RT.LIGHT.length; i++)
      {
        // Set default value.
        let strength = 200;
        // Overwrite default if set.
        if (typeof(RT.LIGHT[i].strength) !== "undefined") strength = RT.LIGHT[i].strength;
        // Push light location to Texture.
        LightTexArray.push(RT.LIGHT[i][0], RT.LIGHT[i][1], RT.LIGHT[i][2]);
        // Push strength and 0, 0 to texture, because RGB texture format needs 3x values per row.
        LightTexArray.push(strength, 0, 0);
      }
      if (RT.LIGHT.length !== 0){
        RT.GL.texImage2D(RT.GL.TEXTURE_2D, 0, RT.GL.RGB32F, 2, RT.LIGHT.length, 0, RT.GL.RGB, RT.GL.FLOAT, new Float32Array(LightTexArray));
      }else{
        RT.GL.texImage2D(RT.GL.TEXTURE_2D, 0, RT.GL.RGB32F, 1, 1, 0, RT.GL.RGB, RT.GL.FLOAT, new Float32Array([0, 0, 0]));
      }
    },
    UPDATE_SCENE: () => {
      let id = 0
      // Set data variable for texels in world space texture.
      var Data = [];
      // Build simple AABB tree (Axis aligned bounding box).
      var fillData = async (item) => {
        if (Array.isArray(item)){
          let b = item[0];
          // Save position of len variable in array.
          let len_pos = Data.length;
          // Begin bounding volume array.
          Data.push(b[0],b[1],b[2],b[3],b[4],b[5],0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);
          id++;
          // Iterate over all sub elements and skip bounding (item[0]).
          for (let i = 1; i < item.length; i++){
            // Push sub elements in QUEUE.
            fillData(item[i]);
          }
          let len = Math.floor((Data.length - len_pos) / 24);
          // Set now calculated vertices length of bounding box
          // to skip if ray doesn't intersect with it.
          Data[len_pos + 6] = len;
        }else{
          // Alias object properties to simplify data texture assembly.
          let v = item.vertices;
          let c = item.colors;
          let n = item.normals;
          let t = item.textureNums;
          let uv = item.uvs;
          let len = item.arrayLength;
          // Test if bounding volume is set.
          if (item.bounding !== undefined){
            // Declare bounding volume of object.
            let b = item.bounding;
            Data.push(b[0],b[1],b[2],b[3],b[4],b[5],len/3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);
            id++;
          }else if (item.arrayLength > 3){
            // Warn if length is greater than 3.
            console.warn(item);
            // A single triangle needs no bounding voume, so nothing happens in this case.
          }

          item.ids = [];
          for (let i = 0; i < len * 3; i += 9){
            let j = i/3*2;
            // 1 vertex = 1 line in world texture.
            // a, b, c, color, normal, texture_nums, UVs1, UVs2.
            Data.push(v[i],v[i+1],v[i+2],v[i+3],v[i+4],v[i+5],v[i+6],v[i+7],v[i+8],c[i/3],c[i/3+1],c[i/3+2],n[i],n[i+1],n[i+2],t[j],t[j+1],t[j+2],uv[j],uv[j+1],uv[j+2],uv[j+3],uv[j+4],uv[j+5]);
            item.ids.push(Math.floor(id / 65535), id % 65535, Math.floor(id / 65535), id % 65535, Math.floor(id / 65535), id % 65535);
            id++;
          }
        }
      }
      // Fill texture with data pixels.
      for (let i = 0; i < RT.QUEUE.length; i++) fillData(RT.QUEUE[i]);
      // Round up data to next higher multiple of 6144.
      Data.push(new Array(1536 - Data.length % 1536).fill(0));
      Data = Data.flat();
      // Calculate DataHeight by dividing value count through 6144 (8 pixels * 3 values * 64 vertecies per line).
      var DataHeight = Data.length / 1536;
      // Manipulate actual webgl texture.
      RT.GL.bindTexture(RT.GL.TEXTURE_2D, RT.WorldTexture);
      // Tell webgl to use 4 bytes per value for the 32 bit floats.
      RT.GL.pixelStorei(RT.GL.UNPACK_ALIGNMENT, 4);
      // Set data texture details and tell webgl, that no mip maps are required.
      RT.GL.texImage2D(RT.GL.TEXTURE_2D, 0, RT.GL.RGB32F, 512, DataHeight, 0, RT.GL.RGB, RT.GL.FLOAT, new Float32Array(Data));
      RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MIN_FILTER, RT.GL.NEAREST);
      RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MAG_FILTER, RT.GL.NEAREST);
    },
    // Start function for engine.
    START: async () => {
      const vertex_glsl = `#version 300 es

      precision highp float;

      in vec3 position_3d;
      in vec4 id;
      in vec2 tex_pos;
      in vec3 color_3d;
      in vec3 normal_3d;
      in vec3 texture_nums_3d;

      uniform vec3 camera_position;
      uniform vec2 perspective;
      uniform vec4 conf;

      out vec3 position;
      out vec2 tex_coord;
      out vec3 clip_space;

      flat out vec4 vertex_id;
      flat out vec3 color;
      flat out vec3 normal;
      flat out vec3 player;
      flat out vec3 texture_nums;

      void main(){
        vec3 move_3d = position_3d + vec3(camera_position.x, - camera_position.yz);
        vec2 translate_px = vec2(
          move_3d.x * cos(perspective.x) + move_3d.z * sin(perspective.x),
          move_3d.z * cos(perspective.x) - move_3d.x * sin(perspective.x)
        );
        vec2 translate_py = vec2(
          move_3d.y * cos(perspective.y) + translate_px.y * sin(perspective.y),
          translate_px.y * cos(perspective.y) - move_3d.y * sin(perspective.y)
        );
        vec2 translate_2d = conf.x * vec2(translate_px.x / conf.y, translate_py.x);
        // Set final clip space position.
        gl_Position = vec4(translate_2d, - 0.99999999 / (1.0 + exp(- length(move_3d / 1048576.0))), translate_py.y);
        position = position_3d;
        tex_coord = tex_pos;
        clip_space = vec3(translate_2d, translate_py.y);
        vertex_id = id;
        player = camera_position * vec3(-1.0, 1.0, 1.0);
        color = color_3d;
        normal = normalize(normal_3d);
        texture_nums = texture_nums_3d;
      }
      `;
      const fragment_glsl = `

      #define SQRT3 1.7320508075688772

      precision highp float;
      precision highp sampler2D;

      in vec3 position;
      in vec2 tex_coord;
      in vec3 clip_space;

      flat in vec4 vertex_id;
      flat in vec3 player;

      #if (MOBILE == 0)
      flat in vec3 color;
      flat in vec3 normal;
      flat in vec3 texture_nums;
      #endif

      // Quality configurators.
      uniform int samples;
      uniform int max_reflections;
      uniform float min_importancy;
      uniform int use_filter;
      // Get global illumination color, intensity.
      uniform vec3 sky_box;


      // Textures in parallel for texture atlas.
      uniform int texture_width;
      // Texture with information about all triangles in scene.
      uniform sampler2D world_tex;
      // Random texture to multiply with normal map to simulate rough surfaces.
      uniform sampler2D random;

      uniform sampler2D translucency_tex;
      uniform sampler2D normal_tex;
      uniform sampler2D tex;
      // Texture with all primary light sources of scene.
      uniform sampler2D light_tex;

      layout(location = 0) out vec4 render_color;
      layout(location = 1) out vec4 render_color_ip;
      layout(location = 2) out vec4 render_original_color;
      layout(location = 3) out vec4 render_id;

      // Global constants.
      // Declare null vector as constant.
      const vec3 null = vec3(0.0);
      const float shadow_bias = 0.00001;

      // Prevent blur over shadow border or over (close to) perfect reflections.
      float first_in_shadow = 0.0;
      float first_ray_length = 1.0;

      // Lookup values for texture atlases.
      vec4 lookup(sampler2D atlas, vec3 coords){
        float atlas_height_factor = float(textureSize(atlas, 0).x) / float(textureSize(atlas, 0).y) / float(texture_width);
        float atlas_width_factor = 1.0 / float(texture_width);
        vec2 atlas_coords = vec2(
          (coords.x + mod(coords.z, float(texture_width))) * atlas_width_factor,
          (coords.y + floor(coords.z / float(texture_width))) * atlas_height_factor
        );
        // Return texel on requested location.
        return texture(atlas, atlas_coords);
      }

      float triangleSurface(mat3 vertices){
        vec3 ab = vertices[1] - vertices[0];
        vec3 ac = vertices[2] - vertices[0];
        return 0.5 * length(cross(ab, ac));
      }

      // Test if ray intersects triangle and return intersection.
      vec4 rayTriangle(float l, vec3 r, vec3 p, vec3 a, vec3 b, vec3 c, vec3 n, vec3 on){
        // Can't intersect with triangle with the same normal as the origin.
        if (n == on) return vec4(0.0);
        // Get distance to intersection point.
        float s = dot(n, a - p) / dot(n, r);
        // Ensure that ray triangle intersection is between light source and texture.
        if (s > l || s <= shadow_bias) return vec4(0.0);
        // Calculate intersection point.
        vec3 d = (s * r) + p;
        // Test if point on plane is in Triangle by looking for each edge if point is in or outside.
        vec3 v0 = c - a;
        vec3 v1 = b - a;
        vec3 v2 = d - a;
        // Precalculate dot products.
        float d00 = dot(v0, v0);
        float d01 = - dot(v0, v1);
        float d02 = dot(v0, v2);
        float d11 = dot(v1, v1);
        float d12 = dot(v1, v2);
        // Compute coordinates with optemized dot products.
        float i = dot(vec2(d11, d01), vec2(d00, - d01));
        float u = dot(vec2(d11, d01), vec2(d02, d12)) / i;
        float v = dot(vec2(d12, d01), vec2(d00, d02)) / i;
        // Return if ray intersects triangle or not.
        if ((u > shadow_bias) && (v > shadow_bias) && (u + v < 1.0 - shadow_bias)){
          return vec4(d, s);
        }else{
          return vec4(0.0);
        }
      }

      // Don't return intersection point, because we're looking for a specific triangle.
      bool rayCuboid(vec3 inv_ray, vec3 p, vec3 min_corner, vec3 max_corner){
        vec2 v1 = (vec2(min_corner.x, max_corner.x) - p.x) * inv_ray.x;
        vec2 v2 = (vec2(min_corner.y, max_corner.y) - p.y) * inv_ray.y;
        vec2 v3 = (vec2(min_corner.z, max_corner.z) - p.z) * inv_ray.z;
        float lowest = max(max(min(v1.x, v1.y), min(v2.x, v2.y)), min(v3.x, v3.y));
        float highest = min(min(max(v1.x, v1.y), max(v2.x, v2.y)), max(v3.x, v3.y));
        // Cuboid is behind ray.
        if (highest < 0.0) return false;
        // Ray points in cuboid direction, but doesn't intersect.
        if (lowest > highest) return false;
        return true;
      }

      // Test for closest ray triangle intersection.
      // Return intersection position in world space (rayTracer.xyz).
      // Return index of target triangle in world_tex (rayTracer.w).
      vec4 rayTracer(vec3 ray, vec3 origin, vec3 origin_normal){
        // Precompute inverse of ray for AABB cuboid intersection test.
        vec3 inv_ray = 1.0 / ray;
        // Which triangle (number) reflects ray.
        int target_triangle = -1;
        // Latest intersection which is now closest to origin.
        vec3 intersection = vec3(0.0);
        // Length to latest intersection.
        float min_len = 1.0 / 0.0;
        // Get texture size as max iteration value.
        int size = textureSize(world_tex, 0).y * 64;
        // Iterate through lines of texture.
        for (int i = 0; i < size; i++){
          // Get position of current triangle/vertex in world_tex.
          ivec2 index = ivec2(mod(float(i), 64.0) * 8.0, i / 64);
          // Read point a and normal from traingle.
          vec3 n = texelFetch(world_tex, index + ivec2(4, 0), 0).xyz;
          vec3 a = texelFetch(world_tex, index, 0).xyz;
          vec3 b = texelFetch(world_tex, index + ivec2(1, 0), 0).xyz;
          // Break if all values are zero and texture already ended.
          if (mat3(n,a,b) == mat3(vec3(0.0),vec3(0.0),vec3(0.0))) break;
          // Fetch triangle coordinates from world texture.
          //  Two cases:
          //   - normal is not 0 0 0 --> normal vertex
          //   - normal is 0 0 0 --> beginning of new bounding volume
          if (n != vec3(0.0)){
            vec3 c = texelFetch(world_tex, index + ivec2(2, 0), 0).xyz;
            // Test if triangle intersects ray.
            vec4 current_intersection = rayTriangle(min_len, ray, origin, a, b, c, n, origin_normal);
            // Test if ray even intersects.
            if (current_intersection != vec4(0.0)){
              min_len = current_intersection.w;
              target_triangle = i;
              intersection = current_intersection.xyz;
            }
          }else{
            // Test if Ray intersects bounding volume.
            // a = x x2 y
            // b = y2 z z2
            if (!rayCuboid(inv_ray, origin, vec3(a.x, a.z, b.y), vec3(a.y, b.x, b.z))){
              vec3 c = texelFetch(world_tex, index + ivec2(2, 0), 0).xyz;
              // If it doesn't intersect, skip shadow test for all elements in bounding volume.
              i += int(c.x);
            }
          }
        }
        // Return if pixel is in shadow or not.
        return vec4(intersection, float(target_triangle));
      }

      // Simplified rayTracer test only if ray intersects anything.
      bool shadowTest(vec3 ray, vec3 light, vec3 origin, vec3 origin_normal){
        // Precompute inverse of ray for AABB cuboid intersection test.
        vec3 inv_ray = 1.0 / ray;
        // Get texture size as max iteration value.
        int size = textureSize(world_tex, 0).y * 64;
        // Iterate through lines of texture.
        for (int i = 0; i < size; i++){
          // Get position of current triangle/vertex in world_tex.
          ivec2 index = ivec2(mod(float(i), 64.0) * 8.0, i / 64);
          // Read point a and normal from traingle.
          vec3 n = texelFetch(world_tex, index + ivec2(4, 0), 0).xyz;
          vec3 a = texelFetch(world_tex, index, 0).xyz;
          vec3 b = texelFetch(world_tex, index + ivec2(1, 0), 0).xyz;
          // Break if all values are zero and texture already ended.
          if (mat3(n, a, b) == mat3(vec3(0.0),vec3(0.0),vec3(0.0))) break;
          // Fetch triangle coordinates from world texture.
          //  Three cases:
          //   - normal is not 0 0 0 --> normal vertex
          //   - normal is 0 0 0 --> beginning of new bounding volume
          if (n != vec3(0.0)){
            vec3 c = texelFetch(world_tex, index + ivec2(2, 0), 0).xyz;
            // Test if triangle intersects ray and return true if there is shadow.
            if (rayTriangle(length(light - origin), ray, origin, a, b, c, n, origin_normal).xyz != vec3(0.0)) return true;
          }else if (!rayCuboid(inv_ray, origin, vec3(a.x, a.z, b.y), vec3(a.y, b.x, b.z))){
            // Test if Ray intersects bounding volume.
            // a = x x2 y
            // b = y2 z z2
            vec3 c = texelFetch(world_tex, index + ivec2(2, 0), 0).xyz;
            // If it doesn't intersect, skip ahadow test for all elements in bounding volume.
            i += int(c.x);
          }
        }
        // Tested all triangles, but there is no intersection.
        return false;
      }

      float forwardTrace(vec3 normal, vec3 light_ray, vec3 origin, vec3 position, float metallicity, float strength){
        // Calculate intensity of light reflection, which decreases squared over distance.
        float intensity = strength / pow(1.0 + length(light_ray),2.0);
        // Process specularity of ray in view from origin's perspective.
        vec3 halfVector = normalize(normalize(light_ray) + normalize(origin - position));
        float light = abs(dot(normalize(light_ray), normal)) * (1.0 - metallicity);
        float specular = pow(dot(normal, halfVector), 300.0 / intensity) * 10.0 * metallicity;
        // Determine final color and return it.
        if (specular > 0.0) return light * intensity + specular * intensity;
        // Return just light if specular is negative.
        return light * intensity;
      }

      float fresnel(vec3 normal, vec3 lightDir) {
        // Apply fresnel effect.
        return dot(normal, normalize(lightDir));
      }

      vec3 lightTrace(sampler2D world_tex, sampler2D light_tex, vec3 origin, vec3 position, vec3 rough_normal, vec3 normal, vec3 rme, vec3 tpo, int sample_n, int bounces){
        // Set bool to false when filter becomes necessary
        bool dont_filter = true;
        // Use additive color mixing technique, so start with black.
        vec3 final_color = vec3(0.0);
        vec3 importancy_factor = vec3(1.0);
        // Ray currently traced.
        vec3 active_ray = normalize(position - origin);
        // Ray from last_position to light source.
        vec3 last_origin = origin;
        // Triangle ray lastly intersected with is last_position.w.
        vec3 last_position = position;
        vec3 last_normal = normal;
        vec3 last_rough_normal = rough_normal;
        // Remember color of triangle ray intersected lastly.
        // Start with white instead of original triangle color to seperate raytracing from texture, combine both results in filter.
        vec3 last_color = vec3(1.0);
        // Pack roughness, metallicity and emissiveness in one vector for simplicity.
        vec3 last_rme = rme;
        // Pack all translucency related values in one vector.
        vec3 last_tpo = tpo;
        // Iterate over each bounce and modify color accordingly.
        for (int i = 0; i < bounces && length(importancy_factor) >= min_importancy / SQRT3; i++){

          // Generate pseudo random vector.
          vec2 random_coord = mod(((clip_space.xy / clip_space.z) + 1.0) * (sin(float(i)) + cos(float(sample_n))), 1.0);
          vec3 random_vec = (texture(random, random_coord).xyz - 0.5) * 2.0;
          // Handle fresnel reflection.
          bool fresnel_reflect = abs(fresnel(last_normal, active_ray)) <= abs(random_vec.y);;
          // object is solid by chance or because of the fresnel effect.
          bool is_solid = last_tpo.x <= abs(random_vec.x) || fresnel_reflect;

          // Handle translucency and skip rest of light calculation
          if (is_solid){
            // If ray fresnel reflects from inside an transparent object,
            // the surface faces in the opposite direction as usual.
            if (dot(active_ray, last_normal) > 0.0) last_normal = - last_normal;
            //  Calculate primary light sources for this pass if ray hits non translucent object.
            for (int j = 0; j < textureSize(light_tex, 0).y; j++){
              // Read light position.
              vec3 light = texture(light_tex, vec2(0.0, float(j))).xyz * vec3(-1.0, 1.0, 1.0);
              // Read light strength from texture.
              float strength = texture(light_tex, vec2(1.0, float(j))).x;
              // Skip if strength is negative or zero.
              if (strength <= 0.0) continue;
              // Recalculate position -> light vector.
              vec3 active_light_ray = texture(light_tex, vec2(0.0, float(j))).xyz - last_position;
              // Update pixel color if coordinate is not in shadow.
              if (!shadowTest(normalize(active_light_ray), light, last_position, last_normal)){
                final_color += forwardTrace(last_rough_normal, active_light_ray, last_origin, last_position, last_rme.y, strength) * last_color * importancy_factor;
              }else if(dont_filter && last_tpo.x == 0.0){
                first_in_shadow += pow(2.0, - float(i + 3));
              }
            }
          }
          // Break out of the loop after color is calculated if i was the last iteration.
          if (i == bounces - 1) break;
          if(is_solid) {
            // Calculate reflecting ray.
            active_ray = normalize(mix(reflect(active_ray, last_normal), random_vec, last_rme.x));
            if (dot(active_ray, last_normal) <= 0.0) active_ray = - active_ray;
          }else{
            float ratio = last_tpo.z * 4.0;

            if (dot(active_ray, last_normal) <= 0.0){
              active_ray = normalize(active_ray + 1.0 * refract(normalize(active_ray), last_rough_normal, 1.0 / ratio));
            }else{
              active_ray = normalize(active_ray + 1.0 * refract(normalize(active_ray), - last_rough_normal, ratio));
            }
          }
          // Calculate next intersection.
          vec4 intersection = rayTracer(active_ray, last_position, last_normal);
          // Get position of current triangle/vertex in world_tex.
          ivec2 index = ivec2(mod(intersection.w, 64.0) * 8.0, intersection.w / 64.0);
          // Stop loop if there is no intersection and ray goes in the void.
          if (intersection.xyz == null) {
           // Stop loop if there is no intersection and ray goes in the void.
           if(!is_solid){
             last_origin = 2.0 * last_position - last_origin;
             for (int j = 0; j < textureSize(light_tex, 0).y; j++){
               // Read light position.
               vec3 light = texture(light_tex, vec2(0.0, float(j))).xyz * vec3(-1.0, 1.0, 1.0);
               // Read light strength from texture.
               float strength = texture(light_tex, vec2(1.0, float(j))).x;
               // Skip if strength is negative or zero.
               if (strength <= 0.0) continue;
               // Recalculate position -> light vector.
               vec3 active_light_ray = texture(light_tex, vec2(0.0, float(j))).xyz - last_position;
               // Update pixel color if coordinate is not in shadow.
               if (!shadowTest(normalize(active_light_ray), light, last_position, last_normal)){
                 final_color += forwardTrace(last_rough_normal, active_light_ray, last_origin, last_position, last_rme.y, strength) * importancy_factor;
               }
             }
           }
           break;
         }
          // Calculate barycentric coordinates to map textures.
          // Read UVs of vertices.
          vec3 v_uvs_1 = texelFetch(world_tex, index + ivec2(6, 0), 0).xyz;
          vec3 v_uvs_2 = texelFetch(world_tex, index + ivec2(7, 0), 0).xyz;

          mat3x2 vertex_uvs = mat3x2(vec2(v_uvs_1.xy), vec2(v_uvs_1.z, v_uvs_2.x), vec2(v_uvs_2.yz));
          // Get vertices of triangle.
          mat3 vertices = mat3(
            texelFetch(world_tex, index, 0).xyz,
            texelFetch(world_tex, index + ivec2(1, 0), 0).xyz,
            texelFetch(world_tex, index + ivec2(2, 0), 0).xyz
          );
          // Calculate sub surfaces of triangles.
          vec3 sub_surfaces = vec3(
            triangleSurface(mat3(intersection.xyz, vertices[1], vertices[2])),
            triangleSurface(mat3(intersection.xyz, vertices[2], vertices[0])),
            triangleSurface(mat3(intersection.xyz, vertices[0], vertices[1]))
          );

          float surface_sum = sub_surfaces.x + sub_surfaces.y + sub_surfaces.z;
          sub_surfaces = sub_surfaces / surface_sum;
          // Interpolate final barycentric coordinates.
          vec2 barycentric = vertex_uvs * sub_surfaces;
          // Read triangle normal.
          vec3 tex_nums = texelFetch(world_tex, index + ivec2(5, 0), 0).xyz;
          // Default last_color to color of target triangle.
          last_color = texelFetch(world_tex, index + ivec2(3, 0), 0).xyz;
          // Multiply with texture value if available.
          if (tex_nums.x != -1.0) last_color *= lookup(tex, vec3(barycentric, tex_nums.x)).xyz;
          // Default roughness, metallicity and emissiveness.
          last_rme.x = 0.5;
          rme.y = 0.5;
          rme.z = 0.0;
          // Set roughness to texture value if texture is defined.
          if (tex_nums.y != -1.0){
            last_rme.x = lookup(normal_tex, vec3(barycentric, tex_nums.y)).x;
            last_rme.y = lookup(normal_tex, vec3(barycentric, tex_nums.y)).y;
            rme.z = lookup(normal_tex, vec3(barycentric, tex_nums.y)).z * 4.0;
          }
          // Update parameters.
          last_origin = last_position;
          last_position = intersection.xyz;
          last_normal = normalize(texelFetch(world_tex, index + ivec2(4, 0), 0).xyz);
          // Apply emissive texture.
          final_color += rme.z * last_color * importancy_factor;
          // Fresnel effect.
          last_rme.x *= mix(1.0, fresnel(last_normal, last_origin - last_position), last_rme.y);
          last_rough_normal = normalize(mix(last_normal, random_vec, last_rme.x));
          // Lock filter ids if surface isn't perfectly reflective.
          if(rme.x < 0.01 && last_tpo.x == 0.0 && dont_filter){
            render_id += pow(2.0, - float(i + 1)) * vec4(vec2(int(intersection.w)/65535, int(intersection.w)/255), last_rme.xy);
          }else{
            dont_filter = false;
          }
          if (i==0) first_ray_length = length(last_position - last_origin) / length(position - origin);
          // Precalculate importancy_factor for next iteration.
          // (a multiplicator vec3, that indicates how much the calculated values influence the final_color)
          importancy_factor *= last_color;
          if (is_solid) importancy_factor *= rme.y;
          // Update tpo for next pass.

          if (tex_nums.z == -1.0){
            last_tpo = vec3(0.0, 1.0, 0.25);
          }else{
            last_tpo = lookup(translucency_tex, vec3(barycentric, tex_nums.z)).xyz;
          }
        }
        // Apply global illumination.
        final_color += sky_box * importancy_factor;
        // Return final pixel color.
        return final_color;
      }

      void main(){
      #if (MOBILE == 1)
        float id = vertex_id.x * 65535.0 + vertex_id.y;
        ivec2 index = ivec2(mod(id, 64.0) * 8.0, id / 64.0);

        vec3 color = texelFetch(world_tex, index + ivec2(3, 0), 0).xyz;
        vec3 normal = normalize(texelFetch(world_tex, index + ivec2(4, 0), 0).xyz);
        vec3 texture_nums = texelFetch(world_tex, index + ivec2(5, 0), 0).xyz;
      #endif
        // Test if pixel is in frustum or not.
        if (clip_space.z < 0.0) return;
        // Alter normal and color according to texture and normal texture.
        // Test if textures are even set otherwise default to 0.5 / color.
        // Default tex_color to color.
        vec3 tex_color = color;
        // Multiply with texture value if texture is defined.
        if (texture_nums.x != -1.0) tex_color *= lookup(tex, vec3(tex_coord, texture_nums.x)).xyz;
        // Skip path tracing if random value determines that this pixel shouldn't be fully calculated
        // to enable lower pathtracing resolutions than native.
        vec2 random_coord = vec2(0.0);
        vec3 random_vec = vec3(0.0);
        // Default roughness and metallicity.
        // Pack fresnel_roughness, metallicity and emissiveness in one vector (roughness, metallicity, emissiveness) => rme.
        vec3 rme = vec3(0.5, 0.5, 0.0);
        if (texture_nums.y != -1.0){
          rme = lookup(normal_tex, vec3(tex_coord, texture_nums.y)).xyz;
          rme.z = rme.z * 4.0;
        }
        // Default to non translucent object (translucency, particle density, optical density) => tpo.
        vec3 tpo = vec3(0.0);
        // Get translucency variables.
        if (texture_nums.z != -1.0) tpo = lookup(translucency_tex, vec3(tex_coord, texture_nums.z)).xyz;
        // Preserve original roughness for filter pass
        float filter_roughness = rme.x;
        // Fresnel effect.
        rme.x = rme.x * mix(1.0, fresnel(normal, player - position), rme.y);
        // Start hybrid ray tracing on a per light source base.
        // Directly add emissive light of original surface to final_color.
        vec3 final_color = vec3(0.0);
        // Addapt outer loop iterations depending on how many light sources there are.
        int samples = samples;
        // Generate multiple samples.
        for (int i = 0; i < samples; i++){
          if (mod(float(i), 2.0) == 0.0){
            random_coord = mod(((clip_space.xy / clip_space.z) + 1.0) * cos(float(i)), 1.0);
            random_vec = (texture(random, random_coord).xyz - 0.5) * 2.0;
          }else{
            // Invert vector every second sample instead of getting a new one.
            // --> smoother image.
            random_vec = - random_vec;
          }
          // Decide if ray will go through object or reflect.
          if (0.0 >= tpo.x) {
            // Set color of object itself.
            final_color += rme.z * tex_color.xyz;
            // Alter normal and color according to texture and normal texture.
            vec3 rough_normal = normalize(mix(normal, random_vec, rme.x));
            // Calculate pixel for specific normal.
            final_color += lightTrace(world_tex, light_tex, player, position, rough_normal, normal, rme, tpo, i, max_reflections);
          }else{
            // Alter normal and color according to texture and normal texture.
            vec3 rough_normal = normalize(mix(normal, random_vec, rme.x));
            // Next position
            vec3 next_position = rayTracer(normalize(position - player), position, normal).xyz;
            // Calculate pixel for specific normal.
            final_color += lightTrace(world_tex, light_tex, player, position, rough_normal, normal, rme, tpo, i, max_reflections);
          }
        }
        // Render all relevant information to 4 textures for the post processing shader.
        if (use_filter == 0){
          render_color = vec4(final_color / float(samples) * tex_color.xyz, 1.0);
          return;
        }
        render_color = vec4(mod(final_color / float(samples), 1.0), 1.0);
        // 16 bit HDR for improved filtering.
        render_color_ip = vec4(floor(final_color / float(samples)) / 255.0, 1.0);
        render_original_color = vec4(tex_color.xyz, rme.x * first_ray_length + 0.1);
        render_id += vec4(vertex_id.zw, first_in_shadow, 0.5 * (filter_roughness + rme.y));
      }
      `;
      const post_vertex_glsl = `#version 300 es

      in vec2 position_2d;
      // Pass clip space position to fragment shader.
      out vec2 clip_space;

      void main(){
        vec2 pos = position_2d * 2.0 - 1.0;
        // Set final clip space position.
        gl_Position = vec4(pos, 0, 1);
        clip_space = position_2d;
      }
      `;
      const post_fragment_glsl = `#version 300 es

      precision highp float;
      in vec2 clip_space;

      uniform sampler2D pre_render_color;
      uniform sampler2D pre_render_color_ip;
      uniform sampler2D pre_render_normal;
      uniform sampler2D pre_render_original_color;
      uniform sampler2D pre_render_id;

      layout(location = 0) out vec4 render_color;
      layout(location = 1) out vec4 render_color_ip;

      void main(){
        // Get texture size.
        ivec2 texel = ivec2(vec2(textureSize(pre_render_color, 0)) * clip_space);

        vec4 center_color = texelFetch(pre_render_color, texel, 0);
        vec4 center_color_ip = texelFetch(pre_render_color_ip, texel, 0);
        vec4 center_original_color = texelFetch(pre_render_original_color, texel, 0);
        vec4 center_id = texelFetch(pre_render_id, texel, 0);

        vec4 color = center_color + center_color_ip * 255.0;

        float count = 1.0;
        int radius = int(sqrt(float(textureSize(pre_render_color, 0).x * textureSize(pre_render_color, 0).y) * center_original_color.w));
        // Force max radius.
        if (radius > 3) radius = 3;

        // Apply blur filter on image.
        for (int i = 0; i < radius; i++){
          for (int j = 0; j < radius; j++){
            ivec2 coords = ivec2(
              vec2(texel) + (vec2(i, j) - floor(float(radius) * 0.5)) * pow(1.0 + center_original_color.w, 2.0) * float(i + j + radius)
            );
            vec4 id = texelFetch(pre_render_id, coords, 0);
            vec4 next_color = texelFetch(pre_render_color, coords, 0);
            vec4 next_color_ip = texelFetch(pre_render_color_ip, coords, 0);

            if (id == center_id){
              color += next_color + next_color_ip * 255.0;
              count ++;
            }
          }
        }
        if (center_color.w > 0.0){
          // Set out color for render texture for the antialiasing filter.
          render_color = vec4(mod(color.xyz / count, 1.0), 1.0);
          render_color_ip = vec4(floor(color.xyz / count) / 255.0, 1.0);;
        }else{
          render_color = vec4(0.0);
          render_color_ip = vec4(0.0);
        }
      }
      `;
      const post_fragment_2_glsl = `#version 300 es

      precision highp float;
      in vec2 clip_space;

      uniform sampler2D pre_render_color;
      uniform sampler2D pre_render_color_ip;
      uniform sampler2D pre_render_original_color;
      uniform sampler2D pre_render_id;

      out vec4 out_color;

      void main(){

        // Get texture size.
        ivec2 texel = ivec2(vec2(textureSize(pre_render_color, 0)) * clip_space);

        vec4 center_color = texelFetch(pre_render_color, texel, 0);
        vec4 center_color_ip = texelFetch(pre_render_color_ip, texel, 0);
        vec4 center_original_color = texelFetch(pre_render_original_color, texel, 0);
        vec4 center_id = texelFetch(pre_render_id, texel, 0);

        vec4 color = center_color + center_color_ip * 255.0;

        float count = 1.0;
        int radius = int(sqrt(float(textureSize(pre_render_color, 0).x * textureSize(pre_render_color, 0).y) * center_original_color.w));
        // Force max radius.
        if (radius > 5) radius = 5;

        // Apply blur filter on image.
        for (int i = 0; i < radius; i++){
          for (int j = 0; j < radius; j++){
            ivec2 coords = ivec2(vec2(texel) + (vec2(i, j) - floor(float(radius) * 0.5)) * 3.0);
            vec4 id = texelFetch(pre_render_id, coords, 0);
            vec4 next_color = texelFetch(pre_render_color, coords, 0);
            vec4 next_color_ip = texelFetch(pre_render_color_ip, coords, 0);
            if (id == center_id){
              color += next_color + next_color_ip * 255.0;
              count ++;
            }
          }
        }
        if (center_color.w > 0.0){
          // Set out target_color for render texture for the antialiasing filter.
          vec3 hdr_color = color.xyz * center_original_color.xyz / count;
          // Apply Reinhard tone mapping.
          hdr_color = hdr_color / (hdr_color + vec3(1.0));
          // Gamma correction.
          float gamma = 0.8;
          hdr_color = pow(4.0 * hdr_color, vec3(1.0 / gamma)) / 4.0 * 1.3;
          // Set tone mapped color as out_color.
          out_color = vec4(hdr_color, 1.0);
        }else{
          out_color = vec4(0.0, 0.0, 0.0, 0.0);
        }
      }
      `;
      const kernel_glsl = `#version 300 es

      // Define FXAA constants.
      #define FXAA_EDGE_THRESHOLD_MIN 1.0 / 32.0
      #define FXAA_EDGE_THRESHOLD 1.0 / 4.0

      #define FXAA_SUBPIX_TRIM 0.0
      #define FXAA_SUBPIX_TRIM_SCALE 1.0
      #define FXAA_SUBPIX_CAP 7.0 / 8.0

      #define FXAA_SEARCH_STEPS 6

      precision highp float;

      in vec2 clip_space;
      uniform sampler2D pre_render;
      out vec4 out_color;

      vec2 texel;

      vec4 fetch(int x, int y) {
        return texelFetch(pre_render, ivec2(texel) + ivec2(x, y), 0);
      }

      // Color to luminance conversion from NVIDIA FXAA white paper.
      float fxaa_luma(vec4 rgba) {
        return (rgba.y * (0.587/0.299) + rgba.x) * rgba.w;
      }

      float tex_luma(int x, int y) {
        // Devide length through square root of 3 to have a maximum length of 1.
        return fxaa_luma(fetch(x, y));
      }


      // Local contrast checker from NVIDIA FXAA white paper.
      vec2 fxaa_contrast(int x, int y) {
        return vec2(
          min(tex_luma(x, y), min(min(tex_luma(x, y-1), tex_luma(x-1, y)), min(tex_luma(x, y+1), tex_luma(x+1, y)))),
          max(tex_luma(x, y), max(max(tex_luma(x, y-1), tex_luma(x-1, y)), max(tex_luma(x, y+1), tex_luma(x+1, y))))
        );
      }

      // Local low contrast checker from NVIDIA FXAA white paper.
      bool fxaa_is_low_contrast(int x, int y) {
        vec2 range_min_max = fxaa_contrast(x, y);
        float range = range_min_max.y - range_min_max.x;
        return (range < max(FXAA_EDGE_THRESHOLD_MIN, range_min_max.y * FXAA_EDGE_THRESHOLD));
      }

      vec4 blur_3x3(int x, int y) {
        return 1.0 / 9.0 * (
            fetch(x-1,y-1) + fetch(  x,y-1) + fetch(x+1,y-1)
          + fetch(x-1,  y) + fetch(  x,  y) + fetch(x+1,  y)
          + fetch(x-1,y+1) + fetch(  x,y+1) + fetch(x+1,y+1)
        );
      }

      float fxaa_sub_pixel_aliasing(int x, int y) {
        float luma_l = 0.25 * (tex_luma(x,y-1) + tex_luma(x-1,y) + tex_luma(x+1,y) + tex_luma(x,y+1));
        float range_l = abs(luma_l - tex_luma(x, y));
        // Get contrast range.
        vec2 range_min_max = fxaa_contrast(x, y);
        float range = range_min_max.y - range_min_max.x;
        float blend_l = max(0.0,
        (range_l / range) - FXAA_SUBPIX_TRIM) * FXAA_SUBPIX_TRIM_SCALE;
        blend_l = min(FXAA_SUBPIX_CAP, blend_l);
        return blend_l;
      }


      void main() {
        // Get texture size.
        texel = vec2(textureSize(pre_render, 0)) * clip_space;

        vec4 original_color = fetch(0, 0);
        float original_luma = tex_luma(0, 0);

        mat3 luma = mat3(
          vec3(tex_luma(-1,-1),tex_luma(0,-1),tex_luma(1,-1)),
          vec3(tex_luma(-1, 0),tex_luma(0, 0),tex_luma(1, 0)),
          vec3(tex_luma(-1, 1),tex_luma(0, 1),tex_luma(1, 1))
        );

        // Edge detection from NVIDIA FXAA white paper
        float edge_vert =
          abs((0.25 * luma[0].x) + (-0.5 * luma[0].y) + (0.25 * luma[0].z)) +
          abs((0.50 * luma[1].x) + (-1.0 * luma[1].y) + (0.50 * luma[1].z)) +
          abs((0.25 * luma[2].x) + (-0.5 * luma[2].y) + (0.25 * luma[2].z));

        float edge_horz =
          abs((0.25 * luma[0].x) + (-0.5 * luma[1].x) + (0.25 * luma[2].x)) +
          abs((0.50 * luma[0].y) + (-1.0 * luma[1].y) + (0.50 * luma[2].y)) +
          abs((0.25 * luma[0].z) + (-0.5 * luma[1].z) + (0.25 * luma[2].z));

        bool horz_span = edge_horz >= edge_vert;
        ivec2 step = ivec2(0, 1);
        if (horz_span) step = ivec2(1, 0);

        if (fxaa_is_low_contrast(0, 0)) {
          out_color = original_color;
          return;
        }

        ivec2 pos_n = - step;
        ivec2 pos_p = step;

        vec4 color = original_color;
        float pixel_count = 1.0;

        bool done_n = false;
        bool done_p = false;

        // Luma of neighbour with highest contrast.
        float luma_mcn = max(
          max(abs(luma[0].y - luma[1].y), abs(luma[1].z - luma[1].y)),
          max(abs(luma[2].y - luma[1].y), abs(luma[1].x - luma[1].y))
        );
        float gradient = abs(luma_mcn - luma[1].y);

        for (int i = 0; i < FXAA_SEARCH_STEPS; i++) {
          // Blend pixel with 3x3 box filter to preserve sub pixel detail.
          if (!done_n) {
            vec4 local_blur_n = blur_3x3(pos_n.x, pos_n.y);
            done_n = (abs(fxaa_luma(local_blur_n) - luma_mcn) >= gradient);
            color += mix(fetch(pos_n.x, pos_n.y), local_blur_n, fxaa_sub_pixel_aliasing(pos_n.x, pos_n.y));
            pixel_count++;
            pos_n -= step;
          } else if (!done_p) {
            vec4 local_blur_p = blur_3x3(pos_p.x, pos_p.y);
            done_p = (abs(fxaa_luma(local_blur_p) - luma_mcn) >= gradient);
            color += mix(fetch(pos_p.x, pos_p.y), local_blur_p, fxaa_sub_pixel_aliasing(pos_p.x, pos_p.y));
            pixel_count++;
            pos_p += step;
          } else {
            break;
          }
        }

        out_color = color / pixel_count;

        if(horz_span){
          //out_color = vec4(0.0, 0.0, 1.0, 1.0);
        }else{
          //out_color = vec4(1.0, 0.0, 0.0, 1.0);
        }
      }
      `;
      // Initialize internal globals.
      {
        // The micros variable is needed to calculate fps and movement speed.
        var Millis = performance.now();
        var TimeElapsed = performance.now();
        var Frames = 0;
        // Internal GL objects.
        var Program, CameraPosition, Perspective, RenderConf, SamplesLocation, MaxReflectionsLocation, MinImportancyLocation, FilterLocation, SkyBoxLocation, TextureWidth, WorldTex, RandomTex, NormalTex, TranslucencyTex, ColorTex, LightTex;
        // Init Buffers.
        var PositionBuffer, NormalBuffer, TexBuffer, ColorBuffer, TexSizeBuffer, TexNumBuffer, IdBuffer, SurfaceBuffer, TriangleBuffer;
        // Init Texture elements.
        var RandomTexture, Random;
        // Linkers for GLATTRIBARRAYS.
        var [Position, IdLoc, TexCoord, Color, Normal, TexNum, TexSize] = [0, 1, 2, 3, 4, 5, 6];
        // List of all vertices currently in world space.
        var Data = [];
        // Framebuffer, Post Program buffers and textures.
        var Framebuffer, OriginalRenderTexture, OriginalRenderTex, IdRenderTexture;
        // Set post program array.
        var PostProgram = [];
        // Set DenoiserPasses.
        var DenoiserPasses = 6;
        // Create textures for Framebuffers in PostPrograms.
        var ColorRenderTexture = new Array(DenoiserPasses + 1);
        var ColorIpRenderTexture = new Array(DenoiserPasses + 1);
        var DepthTexture = new Array(DenoiserPasses + 1);
        var ColorRenderTex = new Array(DenoiserPasses + 1);
        var ColorIpRenderTex = new Array(DenoiserPasses + 1);
        var OriginalRenderTex = new Array(DenoiserPasses + 1);
        var IdRenderTex = new Array(DenoiserPasses + 1);
        // Create caching textures for denoising.
        new Array(DenoiserPasses + 1).fill(null).forEach((item, i)=>{
          [ColorRenderTexture[i], ColorIpRenderTexture[i], DepthTexture[i]] = [RT.GL.createTexture(), RT.GL.createTexture(), RT.GL.createTexture()];
        });
        // Create buffers for vertices in PostPrograms.
        var PostVertexBuffer = new Array(DenoiserPasses + 1);
        var PostFramebuffer = new Array(DenoiserPasses + 1);
        // Linkers for GLATTRIBARRAYS in PostPrograms.
        var PostPosition = [0, 0, 0]
        // Convolution-kernel program and its buffers and textures.
        var KernelProgram, KernelVertexBuffer, KernelTexture, KernelTex;
        // Linkers for GLATTRIBARRAYS in KernelProgram.
        var KernelPosition = 0;
        // Create different VAOs for different rendering/filtering steps in pipeline.
        var VAO = RT.GL.createVertexArray();
        var POST_VAO = new Array(DenoiserPasses + 1);
        // Dynamically generate enough VAOs for each denoise pass.
        new Array(DenoiserPasses + 1).fill(null).forEach((item, i)=>{
          POST_VAO[i] = RT.GL.createVertexArray();
        });
        var KERNEL_VAO = RT.GL.createVertexArray();
        // Momentary rotation change.
        var [DeltaX, DeltaY, DeltaZ] = [0, 0, 0];
        // Store pressed keys in this to handle multikey input.
        var KeysPressed = [];
        // Current pointer lock state.
        var PointerLocked = false;
        // Check if recompile is needed.
        var State = [RT.FILTER, RT.MOBILE];
      }
      // Add eventlisteners for movement and rotation.
      {
        window.addEventListener("keydown", function(event){
          if (!KeysPressed.includes(event.key.toLowerCase())){
            KeysPressed.push(event.key.toLowerCase());
          }
        });
        // Remove keys from list if they are not longer pressed.
        window.addEventListener("keyup", function(event){
          KeysPressed.forEach((item, i) => {
            if (item === event.key.toLowerCase()){
              KeysPressed.splice(i, 1);
            }
          });
        });
        // Change perspective on mouse movement and lock pointer to screen.
        document.addEventListener('pointerlockchange', function(){
          PointerLocked = !PointerLocked;
          KeysPressed = [];
        });
        // Start pointer lock with click on canvas.
        target_canvas.addEventListener("click", function (event){
            event.target.requestPointerLock();
        });
        // Detect mouse movements.
        document.addEventListener("pointermove", function (event){
            if (PointerLocked && RT.MOUSE_ROTATION){
              RT.FX -= RT.MOUSE_X * event.movementX;
              if (Math.abs(RT.FY + RT.MOUSE_Y * event.movementY) < Math.PI / 2) RT.FY += RT.MOUSE_Y * event.movementY;
            }
        });
        // Handle canvas resize.
        window.addEventListener("resize", function(){
        	resize();
        	// Rebuild textures with every resize.
          randomTextureBuilder();
          renderTextureBuilder();
          postRenderTextureBuilder();
        });
        // Function to handle canvas resize.
        function resize(){
        	target_canvas.width = target_canvas.clientWidth * RT.SCALE;
        	target_canvas.height = target_canvas.clientHeight * RT.SCALE;
        	RT.GL.viewport(0, 0, RT.GL.canvas.width, RT.GL.canvas.height);
          // Generate Random variable after each resize.
        	Random = [];
        	for (let i = 0; i < RT.GL.canvas.width * RT.GL.canvas.height * 3; i++) Random.push(Math.random() * 255);
        }
        // Init canvas parameters with resize.
        resize();
      }
      // Handle new keyboard input.
      async function evalKeys(){
        if (PointerLocked){
          let [x, y, z] = [0, 0, 0];
          RT.KEYMAP.forEach((item, i) => {
            if (KeysPressed.includes(item[0])){
              x += item[1];
              y += item[2];
              z += item[3];
            }
          });
          if (x !== DeltaX || y !== DeltaY || z !== DeltaZ) [DeltaX, DeltaY, DeltaZ] = [x, y, z];
        }
      }

      function buildProgram(shaders){
        // Create Program, compile and append vertex and fragment shader to it.
        let program = RT.GL.createProgram();
        // Compile GLSL shaders.
        shaders.forEach((item, i) => {
          let shader = RT.GL.createShader(item.type);
          RT.GL.shaderSource(shader, item.source);
          RT.GL.compileShader(shader);
          // Append shader to Program if GLSL compiled successfully.
          if (RT.GL.getShaderParameter(shader, RT.GL.COMPILE_STATUS)){
            RT.GL.attachShader(program, shader);
          }else{
            // Log debug info and delete shader if shader fails to compile.
            console.warn(RT.GL.getShaderInfoLog(shader));
            RT.GL.deleteShader(shader);
          }
        });
        RT.GL.linkProgram(program);
        // Return Program if it links successfully.
        if (!RT.GL.getProgramParameter(program, RT.GL.LINK_STATUS)){
          // Log debug info and delete Program if Program fails to link.
          console.warn(RT.GL.getProgramInfoLog(program));
          RT.GL.deleteProgram(program);
        }else{
          return program;
        }
      }
      function randomTextureBuilder(){
        RT.GL.bindTexture(RT.GL.TEXTURE_2D, RandomTexture);
        // Fill texture with pseudo random pixels.
        // Tell webgl to use 1 byte per value for the 8 bit ints.
        RT.GL.pixelStorei(RT.GL.UNPACK_ALIGNMENT, 1);
        // Set data texture details and tell webgl, that no mip maps are required.
        RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MIN_FILTER, RT.GL.LINEAR);
        RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MAG_FILTER, RT.GL.LINEAR);
        RT.GL.texImage2D(RT.GL.TEXTURE_2D, 0, RT.GL.RGB8, RT.GL.canvas.width, RT.GL.canvas.height, 0, RT.GL.RGB, RT.GL.UNSIGNED_BYTE, new Uint8Array(Random));
        RT.GL.generateMipmap(RT.GL.TEXTURE_2D);
      }
      function renderTextureBuilder(){
        // Init textures for denoiser.
        [ColorRenderTexture, ColorIpRenderTexture].forEach((parent) => {
          parent.forEach(function(item){
            RT.GL.bindTexture(RT.GL.TEXTURE_2D, item);
            RT.GL.texImage2D(RT.GL.TEXTURE_2D, 0, RT.GL.RGBA, RT.GL.canvas.width, RT.GL.canvas.height, 0, RT.GL.RGBA, RT.GL.UNSIGNED_BYTE, null);
            RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MIN_FILTER, RT.GL.NEAREST);
            RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MAG_FILTER, RT.GL.NEAREST);
            RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_WRAP_S, RT.GL.CLAMP_TO_EDGE);
            RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_WRAP_T, RT.GL.CLAMP_TO_EDGE);
          });
        });
        // Init single channel depth textures.
        DepthTexture.forEach((item) => {
          RT.GL.bindTexture(RT.GL.TEXTURE_2D, item);
          RT.GL.texImage2D(RT.GL.TEXTURE_2D, 0, RT.GL.DEPTH_COMPONENT24, RT.GL.canvas.width, RT.GL.canvas.height, 0, RT.GL.DEPTH_COMPONENT, RT.GL.UNSIGNED_INT, null);
          RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MIN_FILTER, RT.GL.NEAREST);
          RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MAG_FILTER, RT.GL.NEAREST);
          RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_WRAP_S, RT.GL.CLAMP_TO_EDGE);
          RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_WRAP_T, RT.GL.CLAMP_TO_EDGE);
        });
        // Init other textures.
        [OriginalRenderTexture, IdRenderTexture].forEach(function(item){
          RT.GL.bindTexture(RT.GL.TEXTURE_2D, item);
          RT.GL.texImage2D(RT.GL.TEXTURE_2D, 0, RT.GL.RGBA, RT.GL.canvas.width, RT.GL.canvas.height, 0, RT.GL.RGBA, RT.GL.UNSIGNED_BYTE, null);
          RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MIN_FILTER, RT.GL.NEAREST);
          RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MAG_FILTER, RT.GL.NEAREST);
          RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_WRAP_S, RT.GL.CLAMP_TO_EDGE);
          RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_WRAP_T, RT.GL.CLAMP_TO_EDGE);
        });
      }
      function postRenderTextureBuilder(){
        RT.GL.bindTexture(RT.GL.TEXTURE_2D, KernelTexture);
        RT.GL.texImage2D(RT.GL.TEXTURE_2D, 0, RT.GL.RGBA, RT.GL.canvas.width, RT.GL.canvas.height, 0, RT.GL.RGBA, RT.GL.UNSIGNED_BYTE, null);
        RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MIN_FILTER, RT.GL.NEAREST);
        RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_MAG_FILTER, RT.GL.NEAREST);
        RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_WRAP_S, RT.GL.CLAMP_TO_EDGE);
        RT.GL.texParameteri(RT.GL.TEXTURE_2D, RT.GL.TEXTURE_WRAP_T, RT.GL.CLAMP_TO_EDGE);
      }

      // Internal render engine Functions.
      function frameCycle () {
        RT.GL.clear(RT.GL.COLOR_BUFFER_BIT | RT.GL.DEPTH_BUFFER_BIT);
        // Check if recompile is required.
        if (State[0] !== RT.FILTER || State[1] !== RT.MOBILE) {
          prepareEngine();
          State = [RT.FILTER, RT.MOBILE];
        }
        // Request the browser to render frame with hardware accelerated rendering.
        requestAnimationFrame(frameCycle);
        // Render new Image, work through QUEUE.
        if (RT.FILTER) {
          renderFrameRt();
        } else {
          renderFrameRtRaw();
        }
        // Reevaluate keys for movement.
        evalKeys();

        if (RT.MOVEMENT){
          let deltaTime = (window.performance.now() - Millis) * RT.MOVEMENT_SPEED;
          RT.X += (DeltaX * Math.cos(RT.FX) + DeltaZ * Math.sin(RT.FX)) * deltaTime;
          RT.Y += DeltaY * deltaTime;
          RT.Z += (DeltaZ * Math.cos(RT.FX) - DeltaX * Math.sin(RT.FX)) * deltaTime;
        }
        // Update Millis variable for movement.
        Millis = performance.now();
        // Update frame counter.
        Frames ++;
        // Calculate Fps.
        if ((performance.now() - TimeElapsed) >= 500) {
          RT.FPS = "fps:" + (1000 * Frames / (performance.now() - TimeElapsed)).toFixed(0) + " res:" + target_canvas.width + "x" + target_canvas.height;
          [TimeElapsed, Frames] = [performance.now(), 0];
        }
      }

      function texturesToGPU() {
        RT.GL.bindVertexArray(VAO);
        RT.GL.useProgram(Program);
        // Set world-texture.
        RT.UPDATE_SCENE();
        RT.UPDATE_LIGHT();

        RT.GL.activeTexture(RT.GL.TEXTURE0);
        RT.GL.bindTexture(RT.GL.TEXTURE_2D, RT.WorldTexture);
        RT.GL.activeTexture(RT.GL.TEXTURE1);
        RT.GL.bindTexture(RT.GL.TEXTURE_2D, RandomTexture);
        RT.GL.activeTexture(RT.GL.TEXTURE2);
        RT.GL.bindTexture(RT.GL.TEXTURE_2D, RT.PbrTexture);
        RT.GL.activeTexture(RT.GL.TEXTURE3);
        RT.GL.bindTexture(RT.GL.TEXTURE_2D, RT.TranslucencyTexture);
        RT.GL.activeTexture(RT.GL.TEXTURE4);
        RT.GL.bindTexture(RT.GL.TEXTURE_2D, RT.ColorTexture);
        RT.GL.activeTexture(RT.GL.TEXTURE5);
        RT.GL.bindTexture(RT.GL.TEXTURE_2D, RT.LightTexture);
        // Set uniforms for shaders.
        // Set 3d camera position.
        RT.GL.uniform3f(CameraPosition, RT.X, RT.Y, RT.Z);
        // Set x and y rotation of camera.
        RT.GL.uniform2f(Perspective, RT.FX, RT.FY);
        // Set fov and X/Y ratio of screen.
        RT.GL.uniform4f(RenderConf, RT.FOV, target_canvas.width / target_canvas.height, 1, 1);
        // Set amount of samples per ray.
        RT.GL.uniform1i(SamplesLocation, RT.SAMPLES);
        // Set max reflections per ray.
        RT.GL.uniform1i(MaxReflectionsLocation, RT.MAX_REFLECTIONS);
        // Set min importancy of light ray.
        RT.GL.uniform1f(MinImportancyLocation, RT.MIN_IMPORTANCY);
        // Instuct shader to render for filter or not.
        RT.GL.uniform1i(FilterLocation, RT.FILTER);
        // Set global illumination.
        RT.GL.uniform3f(SkyBoxLocation, RT.SKYBOX[0], RT.SKYBOX[1], RT.SKYBOX[2]);
        // Set width of height and normal texture.
        RT.GL.uniform1i(TextureWidth, Math.floor(512 / RT.TEXTURE_SIZES[0]));
        // Pass whole current world space as data structure to GPU.
        RT.GL.uniform1i(WorldTex, 0);
        // Pass random texture to GPU.
        RT.GL.uniform1i(RandomTex, 1);
        // Pass pbr texture to GPU.
        RT.GL.uniform1i(NormalTex, 2);
        // Pass pbr texture to GPU.
        RT.GL.uniform1i(TranslucencyTex, 3);
        // Pass texture to GPU.
        RT.GL.uniform1i(ColorTex, 4);
        // Pass texture with all primary light sources in the scene.
        RT.GL.uniform1i(LightTex, 5);
      }

      function fillBuffersDesktop() {
        let vertices = [];
        let ids = [];
        let uvs = [];
        let colors = [];
        let normals = [];
        let texNums = [];
        let id = 0;
        let length = 0;
        // Iterate through render queue and build arrays for GPU.
        var flattenQUEUE = (item) => {
          if (Array.isArray(item)){
            // Iterate over all sub elements and skip bounding (item[0]).
            for (let i = 1; i < item.length; i++){
              // flatten sub element of QUEUE.
              flattenQUEUE(item[i]);
            }
          }else{
            vertices.push(item.vertices);
            id ++;
            for(let i = 0; i < item.ids.length; i+=2) {
              ids.push(item.ids[i], item.ids[i + 1], id / 65535, id / 256);
            }
            uvs.push(item.uvs);
            colors.push(item.colors);
            normals.push(item.normals);
            texNums.push(item.textureNums);
            length += item.arrayLength;
          }
        };
        // Start recursion.
        RT.QUEUE.forEach((item, i) => {flattenQUEUE(item)});
        // Set buffers.
        [
          [PositionBuffer, vertices],
          [IdBuffer, ids.flat()],
          [TexBuffer, uvs],
          [ColorBuffer, colors],
          [NormalBuffer, normals],
          [TexNumBuffer, texNums]
        ].forEach(function(item){
          RT.GL.bindBuffer(RT.GL.ARRAY_BUFFER, item[0]);
          RT.GL.bufferData(RT.GL.ARRAY_BUFFER, new Float32Array(item[1].flat()), RT.GL.STATIC_DRAW);
        });
        // Actual drawcall.
        RT.GL.drawArrays(RT.GL.TRIANGLES, 0, length);
      }

      function fillBuffersMobile() {
        let vertices = [];
        let ids = [];
        let uvs = [];
        let id = 0;
        let length = 0;
        // Iterate through render queue and build arrays for GPU.
        var flattenQUEUE = (item) => {
          if (Array.isArray(item)){
            // Iterate over all sub elements and skip bounding (item[0]).
            for (let i = 1; i < item.length; i++){
              // flatten sub element of QUEUE.
              flattenQUEUE(item[i]);
            }
          }else{
            vertices.push(item.vertices);
            id ++;
            for(let i = 0; i < item.ids.length; i+=2) {
              ids.push(item.ids[i], item.ids[i + 1], id / 65535, id / 256);
            }
            uvs.push(item.uvs);
            length += item.arrayLength;
          }
        };
        // Start recursion.
        RT.QUEUE.forEach((item, i) => {flattenQUEUE(item)});
        // Set buffers.
        [
          [PositionBuffer, vertices],
          [IdBuffer, ids.flat()],
          [TexBuffer, uvs]
        ].forEach(function(item){
          RT.GL.bindBuffer(RT.GL.ARRAY_BUFFER, item[0]);
          RT.GL.bufferData(RT.GL.ARRAY_BUFFER, new Float32Array(item[1].flat()), RT.GL.STATIC_DRAW);
        });
        // Actual drawcall.
        RT.GL.drawArrays(RT.GL.TRIANGLES, 0, length);
      }

      function renderFrameRt() {
        {
          // Configure where the final image should go.
          RT.GL.bindFramebuffer(RT.GL.FRAMEBUFFER, Framebuffer);
          RT.GL.drawBuffers([
            RT.GL.COLOR_ATTACHMENT0,
            RT.GL.COLOR_ATTACHMENT1,
            RT.GL.COLOR_ATTACHMENT2,
            RT.GL.COLOR_ATTACHMENT3
          ]);
          // Configure framebuffer for color and depth.
          RT.GL.framebufferTexture2D(RT.GL.FRAMEBUFFER, RT.GL.COLOR_ATTACHMENT0, RT.GL.TEXTURE_2D, ColorRenderTexture[0], 0);
          RT.GL.framebufferTexture2D(RT.GL.FRAMEBUFFER, RT.GL.COLOR_ATTACHMENT1, RT.GL.TEXTURE_2D, ColorIpRenderTexture[0], 0);
          RT.GL.framebufferTexture2D(RT.GL.FRAMEBUFFER, RT.GL.COLOR_ATTACHMENT2, RT.GL.TEXTURE_2D, OriginalRenderTexture, 0);
          RT.GL.framebufferTexture2D(RT.GL.FRAMEBUFFER, RT.GL.COLOR_ATTACHMENT3, RT.GL.TEXTURE_2D, IdRenderTexture, 0);
          RT.GL.framebufferTexture2D(RT.GL.FRAMEBUFFER, RT.GL.DEPTH_ATTACHMENT, RT.GL.TEXTURE_2D, DepthTexture[0], 0);
          // Clear depth and color buffers from last frame.
          RT.GL.clear(RT.GL.COLOR_BUFFER_BIT | RT.GL.DEPTH_BUFFER_BIT);

          texturesToGPU();
          if (RT.MOBILE) {
            fillBuffersMobile();
          } else {
            fillBuffersDesktop();
          }
        }
        // Apply post processing.
        {
          for (let i = 0; i < DenoiserPasses; i++){
            // Configure where the final image should go.
            RT.GL.bindFramebuffer(RT.GL.FRAMEBUFFER, PostFramebuffer[i]);
            // Set attachments to use for framebuffer.
            RT.GL.drawBuffers([
              RT.GL.COLOR_ATTACHMENT0,
              RT.GL.COLOR_ATTACHMENT1
            ]);
            // Configure framebuffer for color and depth.
            RT.GL.framebufferTexture2D(RT.GL.FRAMEBUFFER, RT.GL.COLOR_ATTACHMENT0, RT.GL.TEXTURE_2D, ColorRenderTexture[i+1], 0);
            RT.GL.framebufferTexture2D(RT.GL.FRAMEBUFFER, RT.GL.COLOR_ATTACHMENT1, RT.GL.TEXTURE_2D, ColorIpRenderTexture[i+1], 0);
            RT.GL.framebufferTexture2D(RT.GL.FRAMEBUFFER, RT.GL.DEPTH_ATTACHMENT, RT.GL.TEXTURE_2D, DepthTexture[i+1], 0);
            // Clear depth and color buffers from last frame.
            RT.GL.clear(RT.GL.COLOR_BUFFER_BIT | RT.GL.DEPTH_BUFFER_BIT);
            // Push pre rendered textures to next shader (post processing).
            [ColorRenderTexture[i], ColorIpRenderTexture[i], OriginalRenderTexture, IdRenderTexture].forEach(function(item, i){
              RT.GL.activeTexture(RT.GL.TEXTURE0 + i);
              RT.GL.bindTexture(RT.GL.TEXTURE_2D, item);
            });
            // Switch program and VAO.
            RT.GL.useProgram(PostProgram[i]);
            RT.GL.bindVertexArray(POST_VAO[i]);
            // Pass pre rendered texture to shader.
            RT.GL.uniform1i(ColorRenderTex[i], 0);
            RT.GL.uniform1i(ColorIpRenderTex[i], 1);
            // Pass original color texture to GPU.
            RT.GL.uniform1i(OriginalRenderTex[i], 2);
            // Pass vertex_id texture to GPU.
            RT.GL.uniform1i(IdRenderTex[i], 3);
            // Post processing drawcall.
            RT.GL.drawArrays(RT.GL.TRIANGLES, 0, 6);
          }
        }
        // Last denoise pass.
        {
          RT.GL.drawBuffers([
            RT.GL.COLOR_ATTACHMENT0,
            RT.GL.COLOR_ATTACHMENT1
          ]);
          // Configure framebuffer for color and depth.
          if (RT.ANTIALIASING) {
            // Configure where the final image should go.
            RT.GL.bindFramebuffer(RT.GL.FRAMEBUFFER, PostFramebuffer[DenoiserPasses]);
            RT.GL.framebufferTexture2D(RT.GL.FRAMEBUFFER, RT.GL.COLOR_ATTACHMENT0, RT.GL.TEXTURE_2D, KernelTexture, 0);
          } else {
            // Render to canvas now.
            RT.GL.bindFramebuffer(RT.GL.FRAMEBUFFER, null);
          }
          // Clear depth and color buffers from last frame.
          RT.GL.clear(RT.GL.COLOR_BUFFER_BIT | RT.GL.DEPTH_BUFFER_BIT);
          // Push pre rendered textures to next shader (post processing).
          [ColorRenderTexture[DenoiserPasses], ColorIpRenderTexture[DenoiserPasses], OriginalRenderTexture, IdRenderTexture].forEach(function(item, i){
            RT.GL.activeTexture(RT.GL.TEXTURE0 + i);
            RT.GL.bindTexture(RT.GL.TEXTURE_2D, item);
          });
          // Switch program and VAO.
          RT.GL.useProgram(PostProgram[DenoiserPasses]);
          RT.GL.bindVertexArray(POST_VAO[DenoiserPasses]);
          // Pass pre rendered texture to shader.
          RT.GL.uniform1i(ColorRenderTex[DenoiserPasses], 0);
          RT.GL.uniform1i(ColorIpRenderTex[DenoiserPasses], 1);
          // Pass original color texture to GPU.
          RT.GL.uniform1i(OriginalRenderTex[DenoiserPasses], 2);
          // Pass vertex_id texture to GPU.
          RT.GL.uniform1i(IdRenderTex[DenoiserPasses], 3);
          // Post processing drawcall.
          RT.GL.drawArrays(RT.GL.TRIANGLES, 0, 6);
        }
        // Apply antialiasing shader if enabled.
        if (RT.ANTIALIASING) {
          // Render to canvas now.
          RT.GL.bindFramebuffer(RT.GL.FRAMEBUFFER, null);
          // Make pre rendered texture TEXTURE0.
          RT.GL.activeTexture(RT.GL.TEXTURE0);
          RT.GL.bindTexture(RT.GL.TEXTURE_2D, KernelTexture);
          // Switch program and VAO.
          RT.GL.useProgram(KernelProgram);
          RT.GL.bindVertexArray(KERNEL_VAO);
          // Pass pre rendered texture to shader.
          RT.GL.uniform1i(KernelTex, 0);
          // Post processing drawcall.
          RT.GL.drawArrays(RT.GL.TRIANGLES, 0, 6);
        }
      }

      function renderFrameRtRaw(){
        {
          // If Filter variable is not set render to canvas directly.
          RT.GL.bindFramebuffer(RT.GL.FRAMEBUFFER, null);
          // Clear depth and color buffers from last frame.
          RT.GL.clear(RT.GL.COLOR_BUFFER_BIT | RT.GL.DEPTH_BUFFER_BIT);

          texturesToGPU();
          if (RT.MOBILE) {
            fillBuffersMobile();
          } else {
            fillBuffersDesktop();
          }
        }
      }

      function prepareEngine() {
        RT.UPDATE_TEXTURE();
        RT.UPDATE_PBR_TEXTURE();
        RT.UPDATE_TRANSLUCENCY_TEXTURE();
        // Compile shaders and link them into Program global.
        if (RT.MOBILE) {
          Program = buildProgram([
            { source: vertex_glsl, type: RT.GL.VERTEX_SHADER },
            { source: ` #version 300 es
                        #define MOBILE 1
                        ` + fragment_glsl, type: RT.GL.FRAGMENT_SHADER }
          ]);
        } else {
          Program = buildProgram([
            { source: vertex_glsl, type: RT.GL.VERTEX_SHADER },
            { source: ` #version 300 es
                        #define MOBILE 0
                        ` + fragment_glsl, type: RT.GL.FRAGMENT_SHADER }
          ]);
        }
        // Compile shaders and link them into PostProgram global.
        for (let i = 0; i < DenoiserPasses; i++){
          PostProgram[i] = buildProgram([
            { source: post_vertex_glsl, type: RT.GL.VERTEX_SHADER },
            { source: post_fragment_glsl, type: RT.GL.FRAGMENT_SHADER }
          ]);
        }
        // Compile shaders and link them into PostProgram global.
        PostProgram[DenoiserPasses] = buildProgram([
          { source: post_vertex_glsl, type: RT.GL.VERTEX_SHADER },
          { source: post_fragment_2_glsl, type: RT.GL.FRAGMENT_SHADER }
        ]);
        // Compile shaders and link them into KernelProgram global.
        KernelProgram = buildProgram([
          { source: post_vertex_glsl, type: RT.GL.VERTEX_SHADER },
          { source: kernel_glsl, type: RT.GL.FRAGMENT_SHADER }
        ]);
        // Create global vertex array object (VAO).
        RT.GL.bindVertexArray(VAO);
        // Bind uniforms to Program.
        CameraPosition = RT.GL.getUniformLocation(Program, "camera_position");
        Perspective = RT.GL.getUniformLocation(Program, "perspective");
        RenderConf = RT.GL.getUniformLocation(Program, "conf");
        SamplesLocation = RT.GL.getUniformLocation(Program, "samples");
        MaxReflectionsLocation = RT.GL.getUniformLocation(Program, "max_reflections");
        MinImportancyLocation = RT.GL.getUniformLocation(Program, "min_importancy");
        FilterLocation = RT.GL.getUniformLocation(Program, "use_filter");
        SkyBoxLocation = RT.GL.getUniformLocation(Program, "sky_box");
        WorldTex = RT.GL.getUniformLocation(Program, "world_tex");
        RandomTex = RT.GL.getUniformLocation(Program, "random");
        TextureWidth = RT.GL.getUniformLocation(Program, "texture_width");

        LightTex = RT.GL.getUniformLocation(Program, "light_tex");
        NormalTex = RT.GL.getUniformLocation(Program, "normal_tex");
        TranslucencyTex = RT.GL.getUniformLocation(Program, "translucency_tex");
        ColorTex = RT.GL.getUniformLocation(Program, "tex");
        // Enable depth buffer and therefore overlapping vertices.
        RT.GL.enable(RT.GL.DEPTH_TEST);
        RT.GL.depthMask(true);
        // Cull (exclude from rendering) hidden vertices at the other side of objects.
        RT.GL.enable(RT.GL.CULL_FACE);
        // Set clear color for framebuffer.
        RT.GL.clearColor(0, 0, 0, 0);
        // Define Program with its currently bound shaders as the program to use for the webgl2 context.
        RT.GL.useProgram(Program);
        // Create Textures for primary render.
        RandomTexture = RT.GL.createTexture();
        RT.PbrTexture = RT.GL.createTexture();
        RT.TranslucencyTexture = RT.GL.createTexture();
        RT.ColorTexture = RT.GL.createTexture();
        // Create texture for all primary light sources in scene.
        RT.LightTexture = RT.GL.createTexture();
        // Init a world texture containing all information about world space.
        RT.WorldTexture = RT.GL.createTexture();
        // Create random texture.
        randomTextureBuilder();
        // Set pixel density in canvas correctly.
        RT.GL.viewport(0, 0, RT.GL.canvas.width, RT.GL.canvas.height);
        // Use different GLATTRIBARRAYS for mobile because of known compatability problems.
        if (RT.MOBILE) {
          // Bind Attribute varying to their respective shader locations.
          RT.GL.bindAttribLocation(Program, Position, "position_3d");
          RT.GL.bindAttribLocation(Program, IdLoc, "id");
          RT.GL.bindAttribLocation(Program, TexCoord, "tex_pos");
          // Create buffers.
          [PositionBuffer, IdBuffer, TexBuffer] = [RT.GL.createBuffer(), RT.GL.createBuffer(), RT.GL.createBuffer()];
          [
            // Bind world space position buffer.
            [PositionBuffer, Position, 3, false],
            // Surface id buffer.
            [IdBuffer, IdLoc, 4, false],
            // Set barycentric texture coordinates.
            [TexBuffer, TexCoord, 2, true]
          ].forEach((item) => {
            RT.GL.bindBuffer(RT.GL.ARRAY_BUFFER, item[0]);
            RT.GL.enableVertexAttribArray(item[1]);
            RT.GL.vertexAttribPointer(item[1], item[2], RT.GL.FLOAT, item[3], 0, 0);
          });
        } else {
          // Bind Attribute varying to their respective shader locations.
          RT.GL.bindAttribLocation(Program, Position, "position_3d");
          RT.GL.bindAttribLocation(Program, IdLoc, "id");
          RT.GL.bindAttribLocation(Program, TexCoord, "tex_pos");
          RT.GL.bindAttribLocation(Program, Color, "color_3d");
          RT.GL.bindAttribLocation(Program, Normal, "normal_3d");
          RT.GL.bindAttribLocation(Program, TexNum, "texture_nums_3d");
          // Create buffers.
          [PositionBuffer, IdBuffer, TexBuffer, ColorBuffer, NormalBuffer, TexNumBuffer] = [RT.GL.createBuffer(), RT.GL.createBuffer(), RT.GL.createBuffer(), RT.GL.createBuffer(), RT.GL.createBuffer(), RT.GL.createBuffer(), RT.GL.createBuffer()];
          // Bind and set buffer parameters.
          [
            // Bind world space position buffer.
            [PositionBuffer, Position, 3, false],
            // Surface id buffer.
            [IdBuffer, IdLoc, 4, false],
            // Set barycentric texture coordinates.
            [TexBuffer, TexCoord, 2, true],
            // Bind color buffer.
            [ColorBuffer, Color, 3, true],
            // Set normals.
            [NormalBuffer, Normal, 3, false],
            // Set Texture number (id) in buffer.
            [TexNumBuffer, TexNum, 3, false],

          ].forEach((item) => {
            RT.GL.bindBuffer(RT.GL.ARRAY_BUFFER, item[0]);
            RT.GL.enableVertexAttribArray(item[1]);
            RT.GL.vertexAttribPointer(item[1], item[2], RT.GL.FLOAT, item[3], 0, 0);
          });
        }

        // Create frame buffers and textures to be rendered to.
        [Framebuffer, OriginalRenderTexture, IdRenderTexture] = [RT.GL.createFramebuffer(), RT.GL.createTexture(), RT.GL.createTexture()];

        renderTextureBuilder();

        for (let i = 0; i < DenoiserPasses + 1; i++){
          // Create post program buffers and uniforms.
          RT.GL.bindVertexArray(POST_VAO[i]);
          RT.GL.useProgram(PostProgram[i]);
          // Bind uniforms.
          ColorRenderTex[i] = RT.GL.getUniformLocation(PostProgram[i], "pre_render_color");
          ColorIpRenderTex[i] = RT.GL.getUniformLocation(PostProgram[i], "pre_render_color_ip");
          OriginalRenderTex[i] = RT.GL.getUniformLocation(PostProgram[i], "pre_render_original_color");
          IdRenderTex[i] = RT.GL.getUniformLocation(PostProgram[i], "pre_render_id");
          PostVertexBuffer[i] = RT.GL.createBuffer();
          RT.GL.bindBuffer(RT.GL.ARRAY_BUFFER, PostVertexBuffer[i]);
          RT.GL.enableVertexAttribArray(PostPosition[i]);
          RT.GL.vertexAttribPointer(PostPosition[i], 2, RT.GL.FLOAT, false, 0, 0);
          // Fill buffer with data for two verices.
          RT.GL.bindBuffer(RT.GL.ARRAY_BUFFER, PostVertexBuffer[i]);
          RT.GL.bufferData(RT.GL.ARRAY_BUFFER, new Float32Array([0,0,1,0,0,1,1,1,0,1,1,0]), RT.GL.DYNAMIC_DRAW);
          PostFramebuffer[i] = RT.GL.createFramebuffer();
        }

        // Post processing (end of render pipeline).
        KernelTexture = RT.GL.createTexture();

        postRenderTextureBuilder();
        // Create post program buffers and uniforms.
        RT.GL.bindVertexArray(KERNEL_VAO);
        RT.GL.useProgram(KernelProgram);

        KernelVertexBuffer = RT.GL.createBuffer();

        RT.GL.bindBuffer(RT.GL.ARRAY_BUFFER, KernelVertexBuffer);
        RT.GL.enableVertexAttribArray(KernelPosition);
        RT.GL.vertexAttribPointer(KernelPosition, 2, RT.GL.FLOAT, false, 0, 0);
        // Fill buffer with data for two verices.
        RT.GL.bindBuffer(RT.GL.ARRAY_BUFFER, KernelVertexBuffer);
        RT.GL.bufferData(RT.GL.ARRAY_BUFFER, new Float32Array([0,0,1,0,0,1,1,1,0,1,1,0]), RT.GL.DYNAMIC_DRAW);
      }
      // Prepare Renderengine.
      prepareEngine();
      // Begin frame cycle.
      frameCycle();
    },
    // Axis aligned cuboid element prototype.
    CUBOID: (x, x2, y, y2, z, z2) => {
      // Create surface elements for cuboid.
      let surfaces = new Array(2);
      surfaces[0] = [x, x2, y, y2, z, z2];
      surfaces[1] = RT.PLANE([x,y2,z],[x2,y2,z],[x2,y2,z2],[x,y2,z2]);
      surfaces[2] = RT.PLANE([x2,y2,z],[x2,y,z],[x2,y,z2],[x2,y2,z2]);
      surfaces[3] = RT.PLANE([x2,y2,z2],[x2,y,z2],[x,y,z2],[x,y2,z2]);
      surfaces[4] = RT.PLANE([x,y,z2],[x2,y,z2],[x2,y,z],[x,y,z]);
      surfaces[5] = RT.PLANE([x,y2,z2],[x,y,z2],[x,y,z],[x,y2,z]);
      surfaces[6] = RT.PLANE([x,y2,z],[x,y,z],[x2,y,z],[x2,y2,z]);
      return surfaces;
    },
    // Surface element prototype.
    PLANE: (c0, c1, c2, c3) => {
      return {
        // Set normals.
        normals: new Array(6).fill(RT.Math.cross(RT.Math.vec_diff(c0, c2), RT.Math.vec_diff(c0, c1))).flat(),
        // Set vertices.
        vertices: [c0,c1,c2,c2,c3,c0].flat(),
        // Default color to white.
        colors: new Array(18).fill(1),
        // Set UVs.
        uvs: [0,0,0,1,1,1,1,1,1,0,0,0],
        // Set used textures.
        textureNums: new Array(6).fill([-1,-1,-1]).flat(),
        // Define maximum bounding volume of cuboid.
        bounding: [Math.min(c0[0],c1[0],c2[0],c3[0]),
                   Math.max(c0[0],c1[0],c2[0],c3[0]),
                   Math.min(c0[1],c1[1],c2[1],c3[1]),
                   Math.max(c0[1],c1[1],c2[1],c3[1]),
                   Math.min(c0[2],c1[2],c2[2],c3[2]),
                   Math.max(c0[2],c1[2],c2[2],c3[2])],
        // Set default arrayLength for this object.
        arrayLength: 6
      }
    },
    // Triangle element prototype.
    TRIANGLE: (a, b, c) => {
      return {
        // Generate surface normal.
        normals: new Array(3).fill(RT.Math.cross(
          RT.Math.vec_diff(a, c),
          RT.Math.vec_diff(a, b)
        )).flat(),
        // Vertex for queue.
        vertices: [a,b,c].flat(),
        // Default color to white.
        colors: new Array(9).fill(1),
        // UVs to map textures on triangle.
        uvs: [0,0,0,1,1,1],
        // Set used textures.
        textureNums: new Array(3).fill([-1,-1,-1]).flat(),
        // Length in world data texture for this object.
        arrayLength: 3
      }
    }
  };
  return RT;
};