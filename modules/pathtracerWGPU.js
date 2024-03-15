'use strict';

import { Network } from './network.js';
import { GLLib } from './gllib.js';
import { FXAA } from './fxaa.js';
import { TAA } from './taa.js';
import { Transform } from './scene.js';
import { Arrays, Float16Array } from './arrays.js';

const rasterRenderFormats = [
  'rgba32float', 'rg32float', 'r32sint'
];

export class PathTracerWGPU {
  type = 'pathtracer';
  // Configurable runtime properties of the pathtracer (public attributes)
  config;
  // Performance metric
  fps = 0;
  fpsLimit = Infinity;
  // Make gl object inaccessible from outside the class
  #context;
  #adapter;
  #device;
  #canvas;
  #preferedCanvasFormat;
  #rasterPipeline;
  #computePipeline;

  #engineState = {};
  
  #renderPassDescriptor;
  
  #staticBuffers;
  #dynamicBuffers;
  
  #uniformBuffer;
  #lightBuffer;
  #transformBuffer;
  
  #textureAtlas;
  #pbrAtlas;
  #translucencyAtlas;
  
  #textureList = [];
  #pbrList = [];
  #translucencyList = [];
  
  #depthTexture;
  #rasterRenderTextures = [];

  #rasterRenderGroupLayout;
  #computeRenderGroupLayout;
  #rasterDynamicGroupLayout;
  #computeDynamicGroupLayout;
  #rasterStaticGroupLayout;
  #computeStaticGroupLayout;
  #textureGroupLayout;

  #rasterRenderGroup;
  #computeRenderGroup;
  #rasterDynamicGroup;
  #computeDynamicGroup;
  #rasterStaticGroup;
  #computeStaticGroup;
  #textureGroup;

  #resizeEvent;

  #halt = true;
  // Create new PathTracer from canvas and setup movement
  constructor (canvas, scene, camera, config) {
    this.#canvas = canvas;
    console.log(this.#canvas);
    this.camera = camera;
    this.scene = scene;
    this.config = config;
    // Check for WebGPU support first by seeing if navigator.gpu exists
    if (!navigator.gpu) return undefined;
  }

  halt = () => {
    this.#halt = true;
    window.removeEventListener('resize',this.#resizeEvent);
  }

  resize () {
    this.#canvas.width = this.#canvas.clientWidth * this.config.renderQuality;
    this.#canvas.height = this.#canvas.clientHeight * this.config.renderQuality;

    let canvasTexture = this.#context.getCurrentTexture();
    
    if (this.#depthTexture) {
      this.#depthTexture.destroy();
    }
    
    this.#depthTexture = this.#device.createTexture({
      size: [canvasTexture.width, canvasTexture.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.#rasterRenderTextures = rasterRenderFormats.map(format => this.#device.createTexture({
      size: [canvasTexture.width, canvasTexture.height],
      format: format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    }));

    let renderGroupEntries = this.#rasterRenderTextures.map((texture, i) => ({ binding: i, resource: texture.createView() }));

    this.#rasterRenderGroup = this.#device.createBindGroup({
      label: 'render output group for raster pass',
      layout: this.#rasterRenderGroupLayout,
      entries: renderGroupEntries.slice(0, 3),
    });
    
    // This compute render group will be generated in the frame cycle due to the canvas texture being deleted every frame
  }
  
  // Make canvas read only accessible
  get canvas () {
    return this.#canvas;
  }

  updateScene () {
    // Generate texture arrays and buffers
    let builtScene = this.scene.generateArraysFromGraph();
    
    this.#engineState.bufferLength = builtScene.bufferLength;

    let staticBufferArrays = [
      builtScene.idBuffer,
      builtScene.geometryBuffer,
      builtScene.sceneBuffer,
    ];

    this.#staticBuffers = staticBufferArrays.map(array => {
      let buffer = this.#device.createBuffer({ size: array.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST});
      this.#device.queue.writeBuffer(buffer, 0, array);
      return buffer;
    });

    let staticEntries = this.#staticBuffers.map((buffer, i) => ({ binding: i, resource: { buffer }}));

    this.#rasterStaticGroup = this.#device.createBindGroup({
      label: 'static binding group for raster pass',
      layout: this.#rasterStaticGroupLayout,
      entries: staticEntries.slice(0, 2),
    });
    
    this.#computeStaticGroup = this.#device.createBindGroup({
      label: 'static binding group for compute pass',
      layout: this.#computeStaticGroupLayout,
      entries: staticEntries,
    });
  }

  async #generateAtlasView (list) {
    const [width, height] = this.scene.standardTextureSizes;
    const textureWidth = Math.floor(2048 / width);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
		// Test if there is even a texture
		if (list.length === 0) {
			canvas.width = width;
      canvas.height = height;
      ctx.imageSmoothingEnabled = false;
      ctx.fillRect(0, 0, width, height);
		} else {
      canvas.width = Math.min(width * list.length, 2048);
      canvas.height = height * (Math.floor((width * list.length) / 2048) + 1);
      console.log(canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      // TextureWidth for third argument was 3 for regular textures
      list.forEach(async (texture, i) => ctx.drawImage(texture, width * (i % textureWidth), height * Math.floor(i / textureWidth), width, height));
    }
    // this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, canvas);
    let bitMap = await createImageBitmap(canvas);

    let atlasTexture = await this.#device.createTexture({
      format: 'rgba8unorm',
      size: [canvas.width, canvas.height],
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.#device.queue.copyExternalImageToTexture(
      { source: bitMap, flipY: true },
      { texture: atlasTexture },
      { width: canvas.width, height: canvas.height },
    );

    return atlasTexture.createView();
	}

  async #updateTextureAtlas (forceUpload = false) {
    // Don't build texture atlas if there are no changes.
    if (
      !forceUpload
      && this.scene.textures.length === this.#textureList.length
      && this.scene.textures.every((e, i) => e === this.#textureList[i])
    ) return;

    this.#textureList = this.scene.textures;
		this.#textureAtlas = await this.#generateAtlasView(this.scene.textures);
  }

  async #updatePbrAtlas (forceUpload = false) {
    // Don't build texture atlas if there are no changes.
    if (
      !forceUpload
      && this.scene.pbrTextures.length === this.#pbrList.length
      && this.scene.pbrTextures.every((e, i) => e === this.#pbrList[i])
    ) return;
    this.#pbrList = this.scene.pbrTextures;
		this.#pbrAtlas = await this.#generateAtlasView(this.scene.pbrTextures);
  }

  async #updateTranslucencyAtlas (forceUpload = false) {
    // Don't build texture atlas if there are no changes.
    if (
      !forceUpload
      && this.scene.translucencyTextures.length === this.#translucencyList.length
      && this.scene.translucencyTextures.every((e, i) => e === this.#translucencyList[i])
    ) return;
    this.#translucencyList = this.scene.translucencyTextures;
    this.#translucencyAtlas = await this.#generateAtlasView(this.scene.translucencyTextures);
  }

  async #updateTextureGroup () {
    // Wait till all textures have finished updating
    let objects = [
      this.#textureAtlas,
      this.#pbrAtlas,
      this.#translucencyAtlas
    ];

    this.#textureGroup = this.#device.createBindGroup({
      label: 'texture binding group',
      layout: this.#textureGroupLayout,
      entries: objects.map((object, i) => ({ binding: i, resource: object }))
    });
  }

  // Functions to update vertex and light source data textures
  #updatePrimaryLightSources () {
    var lightTexArray = [];
		// Don't update light sources if there is none
		if (this.scene.primaryLightSources.length === 0) {
			lightTexArray = [0, 0, 0, 0, 0, 0, 0, 0];
		} else {
      // Iterate over light sources
      this.scene.primaryLightSources.forEach(lightSource => {
        // Set intensity to lightSource intensity or default if not specified
        const intensity = Object.is(lightSource.intensity)? this.scene.defaultLightIntensity : lightSource.intensity;
        const variation = Object.is(lightSource.variation)? this.scene.defaultLightVariation : lightSource.variation;
        // push location of lightSource and intensity to texture, value count has to be a multiple of 3 rgb format
        lightTexArray.push(lightSource[0], lightSource[1], lightSource[2], 0, intensity, variation, 0, 0);
      });
    }


    let lightArray = new Float32Array(lightTexArray);
    // Reallocate buffer if size changed
    if (this.#engineState.lightSourceLength !== lightArray.length) {
      this.#engineState.lightSourceLength = lightArray.length;
      this.#lightBuffer = this.#device.createBuffer({ size: lightArray.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST})
    }
    // Write data into buffer
    this.#device.queue.writeBuffer(this.#lightBuffer, 0, lightArray);
  }
  
  async render() {
    
    if (!this.#halt) {
      console.warn('Renderer already up and running!');
      return;
    }
    // Allow frame rendering
    this.#halt = false;

    // Request webgpu context
    this.#context = this.#canvas.getContext('webgpu');
    // Setup webgpu internal components
    this.#adapter = await navigator.gpu.requestAdapter();
    this.#device = await this.#adapter.requestDevice();
    
    // Get prefered canvas format
    this.#preferedCanvasFormat = 'rgba8unorm'; // await navigator.gpu.getPreferredCanvasFormat();

    this.#context.configure({
      device: this.#device,
      format: this.#preferedCanvasFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
    });

    this.#engineState.intermediateFrames = 0;
    // Attributes to meassure frames per second
    
    this.#engineState.lastTimeStamp = performance.now();
    // Count frames to match with temporal accumulation
    this.#engineState.temporalFrame = 0;

    // Init all texture atlases
    await this.#updateTextureAtlas(true);
    await this.#updatePbrAtlas(true);
    await this.#updateTranslucencyAtlas(true);
    
    this.#prepareEngine();
  }
  
  #prepareEngine () {
    // Parameters to compare against current state of the engine and recompile shaders on change
    this.#engineState.filter = this.config.filter;
    this.#engineState.renderQuality = this.config.renderQuality;
    // Internal Webgpu parameters
    this.#engineState.bufferLength = 0;

    this.#rasterRenderGroupLayout = this.#device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, storageTexture: { access: 'write-only', format: 'rgba32float', viewDimension: '2d' } }, // 3d positions
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, storageTexture: { access: 'write-only', format: 'rg32float', viewDimension: '2d' } },   // uvs
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, storageTexture: { access: 'write-only', format: 'r32sint', viewDimension: '2d' } }      // triangle index
      ]
    });

    this.#computeRenderGroupLayout = this.#device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'read-only', format: 'rgba32float', viewDimension: '2d' } },                            // 3d positions
        { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'read-only', format: 'rg32float', viewDimension: '2d' } },                              // uvs
        { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'read-only', format: 'r32sint', viewDimension: '2d' } },                                // triangle index
        { binding: 3, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm', viewDimension: '2d' } }   // canvas
      ]
    });

    this.#rasterStaticGroupLayout = this.#device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },  // indices
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },  // geometry
      ]
    });

    this.#computeStaticGroupLayout = this.#device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // indices
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // geometry
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }   // scene
      ]
    });

    this.#rasterDynamicGroupLayout = this.#device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },            // uniforms
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },  // transforms
      ]
    });

    this.#computeDynamicGroupLayout = this.#device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },            // uniforms
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // transforms
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // light sources
      ]
    });

    this.#textureGroupLayout = this.#device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { type: 'uint' } },  // texture atlas
        { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { type: 'uint' } },  // pbr texture atlas
        { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { type: 'uint' } }   // translucency texture atlas
      ]
    });

    let rasterShader = Network.fetchSync('shaders/pathtracer_raster.wgsl');
    let rasterModule = this.#device.createShaderModule({ code: rasterShader });

    this.#rasterPipeline = this.#device.createRenderPipeline({
      layout: this.#device.createPipelineLayout({ bindGroupLayouts: [
        this.#rasterRenderGroupLayout,
        this.#rasterStaticGroupLayout,
        this.#rasterDynamicGroupLayout
      ] }),
      // Vertex shader
      vertex: {
        module: rasterModule,
        entryPoint: 'vertex',
      },
      // Fragment shader
      fragment: {
        module: rasterModule,
        entryPoint: 'fragment',
        targets: [{ format: 'rgba8unorm' }],
      },
      // Culling config
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back'
      },
      // Depth buffer
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'greater',
        format: 'depth24plus'
      }
    });

    let computeShader = Network.fetchSync('shaders/pathtracer_compute.wgsl');
    // Shaders are written in a language called WGSL.
    let computeModule = this.#device.createShaderModule({
      code: computeShader
    });
    
    this.#computePipeline = this.#device.createComputePipeline({
      layout: this.#device.createPipelineLayout({ bindGroupLayouts: [
        this.#computeRenderGroupLayout,
        this.#textureGroupLayout,
        this.#computeStaticGroupLayout,
        this.#computeDynamicGroupLayout
      ] }),
      compute: {
        module: computeModule,
        entryPoint: 'compute'
      }
    });
    
    // Initialize render pass decriptor
    this.#renderPassDescriptor = {
      // Render passes are given attachments to write into.
      colorAttachments: [{
        // The color the attachment will be cleared to.
        clearValue: [0, 0, 0, 0],
        // Clear the attachment when the render pass starts.
        loadOp: 'clear',
        // When the pass is done, save the results in the attachment texture.
        storeOp: 'store',
      }],
      
      depthStencilAttachment: {
        depthClearValue: 0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      }
    };
    // Create uniform buffer for shader uniforms
    this.#uniformBuffer = this.#device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // Create uniform buffer for transforms in shader
    // Build / Rebuild scene graph for GPU into storage buffer
    this.updateScene();
    // Init canvas parameters and textures with resize
    this.resize();
    // this.#renderFrame();
    this.#resizeEvent = window.addEventListener('resize', () => this.resize());
    // Begin frame cycle
    requestAnimationFrame(() => this.#frameCycle());
  }

  // Internal render engine Functions
  #frameCycle () {
    // console.log(this.#halt);
    if (this.#halt) return;
    // this.#halt = true;
    let timeStamp = performance.now();
    // Check if recompile is required
    if (this.#engineState.filter !== this.config.filter || this.#engineState.renderQuality !== this.config.renderQuality) {
      // Update Textures
      requestAnimationFrame(() => this.#prepareEngine());
      return;
    }
    // update Textures
    this.#updateTextureAtlas();
    this.#updatePbrAtlas();
    this.#updateTranslucencyAtlas();
    this.#updateTextureGroup();
    // update light sources
    this.#updatePrimaryLightSources();
    
    // Swap antialiasing programm if needed
    if (this.#engineState.antialiasing !== this.config.antialiasing) {
      this.#engineState.antialiasing = this.config.antialiasing;
      // Use internal antialiasing variable for actual state of antialiasing.
      let val = this.config.antialiasing.toLowerCase();
      switch (val) {
        case 'fxaa':
          break;
        case 'taa':
          break;
        default:
      }
    }
    // Render new Image, work through queue
    this.#renderFrame();
    // Update frame counter
    this.#engineState.intermediateFrames ++;
    this.#engineState.temporalFrame = (this.#engineState.temporalFrame + 1) % this.config.temporalSamples;
    // Calculate Fps
    let timeDifference = timeStamp - this.#engineState.lastTimeStamp;
    if (timeDifference > 500) {
      this.fps = (1000 * this.#engineState.intermediateFrames / timeDifference).toFixed(0);
      this.#engineState.lastTimeStamp = timeStamp;
      this.#engineState.intermediateFrames = 0;
    }
    // Request browser to render frame with hardware acceleration
    setTimeout(() => {
      requestAnimationFrame(() => this.#frameCycle())
    }, 1000 / this.fpsLimit);
  }

  async #renderFrame () {
    // Calculate camera offset and projection matrix
    let dir = {x: this.camera.fx, y: this.camera.fy};
    let invFov = 1 / this.camera.fov;
    let heightInvWidthFov = this.#canvas.height * invFov / this.#canvas.width;

    let viewMatrix = [
      [   Math.cos(dir.x) * heightInvWidthFov,            0,                          Math.sin(dir.x) * heightInvWidthFov         ],
      [ - Math.sin(dir.x) * Math.sin(dir.y) * invFov,     Math.cos(dir.y) * invFov,   Math.cos(dir.x) * Math.sin(dir.y) * invFov  ],
      [ - Math.sin(dir.x) * Math.cos(dir.y),            - Math.sin(dir.y),            Math.cos(dir.x) * Math.cos(dir.y)           ]
    ];

    // Transpose view matrix in buffer
    let uniformValues = new Float32Array([
      // View matrix
      viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0], 0,
      viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1], 0,
      viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2], 0,
      // Camera
      this.camera.x, this.camera.y, this.camera.z, 0,
      // Ambient light
      this.scene.ambientLight[0], this.scene.ambientLight[1], this.scene.ambientLight[2],
      // amount of samples per ray
      this.config.samplesPerRay,
      // max reflections of ray
      this.config.maxReflections,
      // min importancy of light ray
      this.config.minImportancy,
      // render for filter or not
      this.config.filter,
      // render for temporal or not
      this.config.temporal,
      // Random seed (1 for now)
      1, 0,
      // Texture size
      this.scene.standardTextureSizes[0], this.scene.standardTextureSizes[1],
    ]);
    // Update uniform values on GPU
    this.#device.queue.writeBuffer(this.#uniformBuffer, 0, uniformValues);
    // Update transform matrices on GPU
    let transformArray = Transform.buildWGPUArray();
    this.#transformBuffer = this.#device.createBuffer({ size: transformArray.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST})
    this.#device.queue.writeBuffer(this.#transformBuffer, 0, transformArray);

    this.#dynamicBuffers = [
      this.#uniformBuffer,
      this.#transformBuffer,
      this.#lightBuffer,
    ];

    let dynamicEntries = this.#dynamicBuffers.map((buffer, i) => ({ binding: i, resource: { buffer }}));
    // Assemble dynamic bind group
    this.#rasterDynamicGroup = this.#device.createBindGroup({
      label: 'dynamic binding group for raster pass',
      layout: this.#rasterDynamicGroupLayout,
      entries: dynamicEntries.slice(0, 2),
    });

    this.#computeDynamicGroup = this.#device.createBindGroup({
      label: 'dynamic binding group for compute pass',
      layout: this.#computeDynamicGroupLayout,
      entries: dynamicEntries,
    });

    let canvasTexture = this.#context.getCurrentTexture();
    let renderGroupEntries = [... this.#rasterRenderTextures, canvasTexture].map((texture, i) => ({ binding: i, resource: texture.createView() }));
    
    this.#computeRenderGroup = this.#device.createBindGroup({
      label: 'render input group for compute pass',
      layout: this.#computeRenderGroupLayout,
      entries: renderGroupEntries,
    });

    // Command encoders record commands for the GPU to execute.
    let commandEncoder = this.#device.createCommandEncoder();

    this.#renderPassDescriptor.colorAttachments[0].view = canvasTexture.createView();
    this.#renderPassDescriptor.depthStencilAttachment.view = this.#depthTexture.createView();
    // All rendering commands happen in a render pass
    let renderEncoder = commandEncoder.beginRenderPass(this.#renderPassDescriptor);
    // Set the pipeline to use when drawing
    renderEncoder.setPipeline(this.#rasterPipeline);
    // Set storage buffers for rester pass
    renderEncoder.setBindGroup(0, this.#rasterRenderGroup);
    renderEncoder.setBindGroup(1, this.#rasterStaticGroup);
    renderEncoder.setBindGroup(2, this.#rasterDynamicGroup);
    // Draw vertices using the previously set pipeline and vertex buffer
    renderEncoder.draw(3, this.#engineState.bufferLength);
    // End the render pass
    renderEncoder.end();
    
    // Run compute shader
    let computeEncoder = commandEncoder.beginComputePass();
    let kernelClusterDims = [Math.ceil(this.canvas.width / 8), Math.ceil(this.canvas.height / 8)];
    // Set the storage buffers and textures for compute pass
    computeEncoder.setPipeline(this.#computePipeline);
    computeEncoder.setBindGroup(0, this.#computeRenderGroup);
    computeEncoder.setBindGroup(1, this.#textureGroup);
    computeEncoder.setBindGroup(2, this.#computeStaticGroup);
    computeEncoder.setBindGroup(3, this.#computeDynamicGroup);

    // Compute pass
    computeEncoder.dispatchWorkgroups(kernelClusterDims[0], kernelClusterDims[1]);
    // End compute pass
    computeEncoder.end();
    // Finish recording commands, which creates a command buffer.
    let commandBuffer = commandEncoder.finish();
    this.#device.queue.submit([commandBuffer]);
  }
}
