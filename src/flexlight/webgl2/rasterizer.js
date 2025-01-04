"use strict";

import { GLLib } from "../webgl2/renderer.js";
import { FXAA } from "../webgl2/fxaa.js";
import { TAA } from "../webgl2/taa.js";
import { Transform } from "../common/scene/transform.js";

import RasterizerVertexShader from '../webgl2/shaders/rasterizer-vertex.glsl';
import RasterizerFragmentShader from '../webgl2/shaders/rasterizer-fragment.glsl';

export class RasterizerWGL2 {
  type = "rasterizer";
  // Configurable runtime properties (public attributes)
  config;
  // Performance metric
  fps = 0;
  fpsLimit = Infinity;

  #antialiasing;
  #AAObject;
  // Make gl object inaccessible from outside the class
  #gl;
  #canvas;

  #halt = false;
  #geometryTexture;
  #sceneTexture;
  // Buffer arrays
  #triangleIdBufferArray;
  #bufferLength;

  // Internal gl texture variables of texture atlases
  #textureAtlas;
  #pbrAtlas;
  #translucencyAtlas;

  #textureList = [];
  #pbrList = [];
  #translucencyList = [];

  #lightTexture;
  // Create new raysterizer from canvas and setup movement
  constructor(canvas, scene, camera, config) {
    this.#canvas = canvas;
    this.camera = camera;
    this.config = config;
    this.scene = scene;
    this.#gl = canvas.getContext("webgl2");
  }

  halt = () => {
    try {
      this.#gl.loseContext();
    } catch (e) {
      console.warn("Unable to lose previous context, reload page in case of performance issue");
    }
    this.#halt = true;
  }

  // Make canvas read only accessible
  get canvas() {
    return this.#canvas;
  }

  // Functions to update texture atlases to add more textures during runtime
  async #updateAtlas(list) {
    // Test if there is even a texture
    if (list.length === 0) {
      this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA, 1, 1, 0, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, new Uint8Array(4));
      return;
    }

    const [width, height] = this.scene.standardTextureSizes;
    const textureWidth = Math.floor(2048 / width);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = Math.min(width * list.length, 2048);
    canvas.height = height * (Math.floor((width * list.length) / 2048) + 1);
    console.log(canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    // TextureWidth for third argument was 3 for regular textures
    list.forEach(async (texture, i) => ctx.drawImage(texture, width * (i % textureWidth), height * Math.floor(i / textureWidth), width, height));
    this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, canvas);
  }

  async #updateTextureAtlas() {
    // Don"t build texture atlas if there are no changes.
    if (this.scene.textures.length === this.#textureList.length && this.scene.textures.every((e, i) => e === this.#textureList[i])) return;
    this.#textureList = this.scene.textures;

    this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#textureAtlas);
    this.#gl.pixelStorei(this.#gl.UNPACK_ALIGNMENT, 1);
    // Set data texture details and tell webgl, that no mip maps are required
    GLLib.setTexParams(this.#gl);
    this.#updateAtlas(this.scene.textures);
  }

  async #updatePbrAtlas() {
    // Don"t build texture atlas if there are no changes.
    if (this.scene.pbrTextures.length === this.#pbrList.length && this.scene.pbrTextures.every((e, i) => e === this.#pbrList[i])) return;
    this.#pbrList = this.scene.pbrTextures;

    this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#pbrAtlas);
    this.#gl.pixelStorei(this.#gl.UNPACK_ALIGNMENT, 1);
    // Set data texture details and tell webgl, that no mip maps are required
    GLLib.setTexParams(this.#gl);
    this.#updateAtlas(this.scene.pbrTextures);
  }

  async #updateTranslucencyAtlas() {
    // Don"t build texture atlas if there are no changes.
    if (this.scene.translucencyTextures.length === this.#translucencyList.length && this.scene.translucencyTextures.every((e, i) => e === this.#translucencyList[i])) return;
    this.#translucencyList = this.scene.translucencyTextures;

    this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#translucencyAtlas);
    this.#gl.pixelStorei(this.#gl.UNPACK_ALIGNMENT, 1);
    // Set data texture details and tell webgl, that no mip maps are required
    GLLib.setTexParams(this.#gl);
    this.#updateAtlas(this.scene.translucencyTextures);
  }

  // Functions to update vertex and light source data textures
  updatePrimaryLightSources() {
    // Don"t update light sources if there are or no changes
    this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#lightTexture);
    this.#gl.pixelStorei(this.#gl.UNPACK_ALIGNMENT, 1);
    // Set data texture details and tell webgl, that no mip maps are required
    GLLib.setTexParams(this.#gl);
    // Skip processing if there are no light sources
    if (this.scene.primaryLightSources.length === 0) {
      this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGB32F, 1, 1, 0, this.#gl.RGB, this.#gl.FLOAT, new Float32Array(3));
      return;
    }

    var lightTexArray = [];
    // Iterate over light sources
    this.scene.primaryLightSources.forEach(lightSource => {
      // Set intensity to lightSource intensity or default if not specified
      const intensity = Object.is(lightSource.intensity) ? this.scene.defaultLightIntensity : lightSource.intensity;
      const variation = Object.is(lightSource.variation) ? this.scene.defaultLightVariation : lightSource.variation;
      // push location of lightSource and intensity to texture, value count has to be a multiple of 3 rgb format
      lightTexArray.push(lightSource[0], lightSource[1], lightSource[2], intensity, variation, 0);
    });

    this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGB32F, 2, this.scene.primaryLightSources.length, 0, this.#gl.RGB, this.#gl.FLOAT, Float32Array.from(lightTexArray));
  }

  async updateScene() {
    // Generate texture arrays and buffers
    let builtScene = await this.scene.generateArraysFromGraph();
    // Set buffer parameters
    this.#bufferLength = builtScene.bufferLength;
    this.#triangleIdBufferArray = builtScene.idBuffer;
    // Upload textures
    this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#geometryTexture);
    // Tell webgl to use 4 bytes per value for the 32 bit floats
    this.#gl.pixelStorei(this.#gl.UNPACK_ALIGNMENT, 4);
    // Set data texture details and tell webgl, that no mip maps are required
    GLLib.setTexParams(this.#gl);
    this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA32F, 3 * 256, builtScene.geometryBufferHeight, 0, this.#gl.RGBA, this.#gl.FLOAT, builtScene.geometryBuffer);
    // this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA16F, 3 * 256, builtScene.geometryTextureArrayHeight, 0, this.#gl.RGBA, this.#gl.HALF_FLOAT, new Float16Array(builtScene.geometryTextureArray));
    this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#sceneTexture);
    GLLib.setTexParams(this.#gl);
    // Tell webgl to use 2 bytes per value for the 16 bit floats
    this.#gl.pixelStorei(this.#gl.UNPACK_ALIGNMENT, 4);
    // Set data texture details and tell webgl, that no mip maps are required
    this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA32F, 7 * 256, builtScene.sceneBufferHeight, 0, this.#gl.RGBA, this.#gl.FLOAT, builtScene.sceneBuffer);
    // this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA16F, 7 * 256, builtScene.sceneTextureArrayHeight, 0, this.#gl.RGBA, this.#gl.HALF_FLOAT, new Float16Array(builtScene.sceneTextureArray));
    // this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.SRGB8, 7 * 256, builtScene.sceneTextureArrayHeight, 0, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, new Uint8Array(uiltScene.sceneTextureArray));
  }

  render() {
    // start rendering
    let rt = this;
    // Allow frame rendering
    rt.#halt = false;
    // Init Buffers
    let triangleIdBuffer, vertexIdBuffer;
    // Internal GL objects
    let Program, CameraPosition, ViewMatrixLocation, AmbientLocation, TextureDims, HdrLocation, PbrTex, TranslucencyTex, Tex, LightTex;
    // Uniform variables
    let UboBuffer, UboVariableIndices, UboVariableOffsets;
    // Init Buffers
    let GeometryTex, SceneTex;
    // Framebuffer, other buffers and textures
    let Framebuffer;
    let DepthTexture = this.#gl.createTexture();
    // Create different Vaos for different rendering/filtering steps in pipeline
    let Vao = this.#gl.createVertexArray();

    let renderTextureBuilder = () => {
      // Init single channel depth texture
      this.#gl.bindTexture(this.#gl.TEXTURE_2D, DepthTexture);
      this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.DEPTH_COMPONENT24, rt.canvas.width, rt.canvas.height, 0, this.#gl.DEPTH_COMPONENT, this.#gl.UNSIGNED_INT, null);
      GLLib.setTexParams(this.#gl);
    }

    // Internal render engine Functions
    let frameCycle = engineState => {
      if (this.#halt) return;
      let timeStamp = performance.now();
      // Update Textures
      this.#updateTextureAtlas();
      this.#updatePbrAtlas();
      this.#updateTranslucencyAtlas();
      // build bounding boxes for scene first
      this.updatePrimaryLightSources();
      // Check if recompile is required
      if (engineState.renderQuality !== this.config.renderQuality) {
        resize();
        engineState = prepareEngine();
      }

      // Swap antialiasing programm if needed
      if (engineState.antialiasing !== this.config.antialiasing) {
        engineState.antialiasing = this.config.antialiasing;
        // Use internal antialiasing variable for actual state of antialiasing.
        let val = this.config.antialiasing.toLowerCase();
        switch (val) {
          case "fxaa":
            this.#antialiasing = val
            this.#AAObject = new FXAA(this.#gl, this.#canvas);
            break;
          case "taa":
            this.#antialiasing = val
            this.#AAObject = new TAA(this.#gl, this.#canvas);
            break;
          default:
            this.#antialiasing = undefined
            this.#AAObject = undefined;
        }
      }
      // Render new Image, work through queue
      renderFrame(engineState);
      // Update frame counter
      engineState.intermediateFrames++;
      engineState.temporalFrame = (engineState.temporalFrame + 1) % this.config.temporalSamples;
      // Calculate Fps
      let timeDifference = timeStamp - engineState.lastTimeStamp;
      if (timeDifference > 500) {
        this.fps = (1000 * engineState.intermediateFrames / timeDifference).toFixed(0);
        engineState.lastTimeStamp = timeStamp;
        engineState.intermediateFrames = 0;
      }
      // Request browser to render frame with hardware acceleration
      setTimeout(function () {
        requestAnimationFrame(() => frameCycle(engineState))
      }, 1000 / this.fpsLimit);
    }

    let rasterizingPass = () => {
      let jitter = { x: 0, y: 0 };
      if (this.#antialiasing !== undefined && (this.#antialiasing.toLocaleLowerCase() === "taa")) jitter = this.#AAObject.jitter();
      // Calculate projection matrix
      let dir = { x: this.camera.direction.x + jitter.x, y: this.camera.direction.y + jitter.y };

      let invFov = 1 / this.camera.fov;
      let heightInvWidthFov = this.#canvas.height * invFov / this.#canvas.width;
      let viewMatrix = [
        Math.cos(dir.x) * heightInvWidthFov, 0, Math.sin(dir.x) * heightInvWidthFov,
        - Math.sin(dir.x) * Math.sin(dir.y) * invFov, Math.cos(dir.y) * invFov, Math.cos(dir.x) * Math.sin(dir.y) * invFov,
        - Math.sin(dir.x) * Math.cos(dir.y), - Math.sin(dir.y), Math.cos(dir.x) * Math.cos(dir.y)
      ];

      this.#gl.bindVertexArray(Vao);
      this.#gl.useProgram(Program);

      [this.#geometryTexture, this.#sceneTexture, this.#pbrAtlas, this.#translucencyAtlas, this.#textureAtlas, this.#lightTexture].forEach((texture, i) => {
        this.#gl.activeTexture(this.#gl.TEXTURE0 + i);
        this.#gl.bindTexture(this.#gl.TEXTURE_2D, texture);
      });
      // Set uniforms for shaders
      // Set 3d camera position
      this.#gl.uniform3f(CameraPosition, this.camera.position.x, this.camera.position.y, this.camera.position.z);
      // Set projection matrix
      this.#gl.uniformMatrix3fv(ViewMatrixLocation, true, viewMatrix);
      // Set global illumination
      this.#gl.uniform3f(AmbientLocation, this.scene.ambientLight[0], this.scene.ambientLight[1], this.scene.ambientLight[2]);
      // Set width of height and normal texture
      this.#gl.uniform2f(TextureDims, this.scene.standardTextureSizes[0], this.scene.standardTextureSizes[1]);
      // Enable or disable hdr
      this.#gl.uniform1i(HdrLocation, this.config.hdr);
      // Pass current scene graph to GPU
      this.#gl.uniform1i(GeometryTex, 0);
      // Pass additional datapoints for scene graph
      this.#gl.uniform1i(SceneTex, 1);
      // Pass pbr texture to GPU
      this.#gl.uniform1i(PbrTex, 2);
      // Pass pbr texture to GPU
      this.#gl.uniform1i(TranslucencyTex, 3);
      // Pass texture to GPU
      this.#gl.uniform1i(Tex, 4);
      // Pass texture with all primary light sources in the scene
      this.#gl.uniform1i(LightTex, 5);
      // Fill UBO
      this.#gl.bindBuffer(this.#gl.UNIFORM_BUFFER, UboBuffer);
      // Get transformation matrices elements and set them in buffer
      let transformArrays = Transform.buildWGL2Arrays();
      this.#gl.bufferSubData(this.#gl.UNIFORM_BUFFER, UboVariableOffsets[0], transformArrays.rotationBuffer, 0);
      this.#gl.bufferSubData(this.#gl.UNIFORM_BUFFER, UboVariableOffsets[1], transformArrays.shiftBuffer, 0);
      // Bind buffer
      this.#gl.bindBuffer(this.#gl.UNIFORM_BUFFER, null);
      // Set buffers
      this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, triangleIdBuffer);
      this.#gl.bufferData(this.#gl.ARRAY_BUFFER, this.#triangleIdBufferArray, this.#gl.DYNAMIC_DRAW);
      // console.log(rt.#triangleIdBufferArray);
      this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, vertexIdBuffer);
      this.#gl.bufferData(this.#gl.ARRAY_BUFFER, new Int32Array([0, 1, 2]), this.#gl.STATIC_DRAW);
      // Actual drawcall
      this.#gl.drawArraysInstanced(this.#gl.TRIANGLES, 0, 3, this.#bufferLength);
    }

    let renderFrame = engineState => {
      // Configure where the final image should go
      if (this.#antialiasing !== undefined) {
        // Configure framebuffer for color and depth
        this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, Framebuffer);
        this.#gl.drawBuffers([
          this.#gl.COLOR_ATTACHMENT0
        ]);
        this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.COLOR_ATTACHMENT0, this.#gl.TEXTURE_2D, this.#AAObject.textureIn, 0);
        this.#gl.framebufferTexture2D(this.#gl.FRAMEBUFFER, this.#gl.DEPTH_ATTACHMENT, this.#gl.TEXTURE_2D, DepthTexture, 0);
      } else {
        this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, null);
      }
      // Clear depth and color buffers from last frame
      this.#gl.clear(this.#gl.COLOR_BUFFER_BIT | this.#gl.DEPTH_BUFFER_BIT);
      rasterizingPass();
      // Apply antialiasing shader if enabled
      if (this.#AAObject !== undefined) this.#AAObject.renderFrame();
    }

    let prepareEngine = () => {
      let initialState = {
        // Attributes to meassure frames per second
        intermediateFrames: 0,
        lastTimeStamp: performance.now(),
        // Parameters to compare against current state of the engine and recompile shaders on change
        filter: this.config.filter,
        renderQuality: this.config.renderQuality
      };
      // Force update textures by resetting texture Lists
      this.#textureList = [];
      this.#pbrList = [];
      this.#translucencyList = [];
      // Calculate max possible transforms
      const MAX_TRANSFORMS = Math.floor((Math.min(this.#gl.getParameter(this.#gl.MAX_VERTEX_UNIFORM_VECTORS), this.#gl.getParameter(this.#gl.MAX_FRAGMENT_UNIFORM_VECTORS)) - 16) * 0.25);
      console.log("MAX_TRANSFORMS evaluated to", MAX_TRANSFORMS);
      // Compile shaders and link them into Program global
      let vertexShader = GLLib.addCompileTimeConstant(RasterizerVertexShader, "MAX_TRANSFORMS", MAX_TRANSFORMS);
      let fragmentShader = GLLib.addCompileTimeConstant(RasterizerFragmentShader, "MAX_TRANSFORMS", MAX_TRANSFORMS);

      Program = GLLib.compile(this.#gl, vertexShader, fragmentShader);
      // Create global vertex array object (Vao)
      this.#gl.bindVertexArray(Vao);
      // Bind uniforms to Program
      CameraPosition = this.#gl.getUniformLocation(Program, "cameraPosition");
      AmbientLocation = this.#gl.getUniformLocation(Program, "ambient");
      GeometryTex = this.#gl.getUniformLocation(Program, "geometryTex");
      SceneTex = this.#gl.getUniformLocation(Program, "sceneTex");
      TextureDims = this.#gl.getUniformLocation(Program, "textureDims");
      HdrLocation = this.#gl.getUniformLocation(Program, "hdr");

      ViewMatrixLocation = this.#gl.getUniformLocation(Program, "viewMatrix");

      // Create UBO objects
      let BlockIndex = this.#gl.getUniformBlockIndex(Program, "transformMatrix");
      // Get the size of the Uniform Block in bytes
      let BlockSize = this.#gl.getActiveUniformBlockParameter(Program, BlockIndex, this.#gl.UNIFORM_BLOCK_DATA_SIZE);

      UboBuffer = this.#gl.createBuffer();
      this.#gl.bindBuffer(this.#gl.UNIFORM_BUFFER, UboBuffer);
      this.#gl.bufferData(this.#gl.UNIFORM_BUFFER, BlockSize, this.#gl.DYNAMIC_DRAW);
      this.#gl.bindBuffer(this.#gl.UNIFORM_BUFFER, null);
      this.#gl.bindBufferBase(this.#gl.UNIFORM_BUFFER, 0, UboBuffer);

      UboVariableIndices = this.#gl.getUniformIndices(Program, ["rotation", "shift"]);
      UboVariableOffsets = this.#gl.getActiveUniforms(
        Program,
        UboVariableIndices,
        this.#gl.UNIFORM_OFFSET
      );

      let index = this.#gl.getUniformBlockIndex(Program, "transformMatrix");
      this.#gl.uniformBlockBinding(Program, index, 0);

      LightTex = this.#gl.getUniformLocation(Program, "lightTex");
      PbrTex = this.#gl.getUniformLocation(Program, "pbrTex");
      TranslucencyTex = this.#gl.getUniformLocation(Program, "translucencyTex");
      Tex = this.#gl.getUniformLocation(Program, "tex");
      // Enable depth buffer and therefore overlapping vertices
      this.#gl.enable(this.#gl.BLEND);
      this.#gl.enable(this.#gl.DEPTH_TEST);
      this.#gl.blendEquation(this.#gl.FUNC_ADD);
      this.#gl.blendFuncSeparate(this.#gl.ONE, this.#gl.ONE_MINUS_SRC_ALPHA, this.#gl.ONE, this.#gl.ONE);
      this.#gl.depthMask(true);
      // Set clear color for framebuffer
      this.#gl.clearColor(0, 0, 0, 0);
      // Define Program with its currently bound shaders as the program to use for the webgl2 context
      this.#gl.useProgram(Program);
      // Create Textures for primary render
      rt.#pbrAtlas = this.#gl.createTexture();
      rt.#translucencyAtlas = this.#gl.createTexture();
      rt.#textureAtlas = this.#gl.createTexture();
      // Create texture for all primary light sources in scene
      rt.#lightTexture = this.#gl.createTexture();
      // Init a world texture containing all information about world space
      this.#geometryTexture = this.#gl.createTexture();
      this.#sceneTexture = this.#gl.createTexture();
      // Create buffers
      [triangleIdBuffer, vertexIdBuffer] = [this.#gl.createBuffer(), this.#gl.createBuffer()];

      this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, triangleIdBuffer);
      this.#gl.enableVertexAttribArray(0);
      this.#gl.vertexAttribIPointer(0, 1, this.#gl.INT, false, 0, 0);
      this.#gl.vertexAttribDivisor(0, 1);

      this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, vertexIdBuffer);
      this.#gl.enableVertexAttribArray(1);
      this.#gl.vertexAttribIPointer(1, 1, this.#gl.INT, false, 0, 0);

      // Create frame buffers and textures to be rendered to
      Framebuffer = this.#gl.createFramebuffer();
      renderTextureBuilder();
      // Reload / Rebuild scene graph after resize or page reload
      this.updateScene();
      // Return initialized objects for engine.
      return initialState;
    }

    // Function to handle canvas resize
    let resize = () => {
      this.canvas.width = this.canvas.clientWidth * this.config.renderQuality;
      this.canvas.height = this.canvas.clientHeight * this.config.renderQuality;
      this.#gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      // Rebuild textures with every resize
      renderTextureBuilder();
      // rt.updatePrimaryLightSources();
      if (this.#AAObject !== undefined) this.#AAObject.createTexture();
    }
    // Init canvas parameters and textures with resize
    resize();
    // Handle canvas resize
    window.addEventListener("resize", resize);
    // Prepare Renderengine
    prepareEngine();
    // Begin frame cycle
    requestAnimationFrame(frameCycle);
  }
}
