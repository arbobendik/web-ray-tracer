'use strict';

import { Network } from './network.js';
import { GLLib } from './gllib.js';
import { FXAA } from './fxaa.js';
import { TAA } from './taa.js';
import { Transform } from './scene.js';
import { Arrays, Float16Array } from './arrays.js';

let rasterRenderFormats = ['r32sint', 'rgba32float', 'rg32float'];

export class PathTracerWGPU {
  type = 'pathtracer';
  // Configurable runtime properties of the pathtracer (public attributes)
  config;
  // Performance metric
  fps = 0;
  fpsLimit = Infinity;
  // Make context object accessible for all functions
  #canvas;
  #context;

  #adapter;
  #device;
  #preferedCanvasFormat;

  #clearPipeline;
  #depthPipeline
  #rasterPipeline;
  #computePipeline;
  #shiftPipeline;
  #averagePipeline;
  #canvasPipeline;

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
  
  #depthBuffer;
  #rasterRenderTextures = [];
  
  #computeTarget;
  #shiftTarget
  #averageTarget;
  
  #clearGroupLayout;
  #depthGroupLayout;
  #rasterRenderGroupLayout;
  #computeRenderGroupLayout;
  #rasterDynamicGroupLayout;
  #computeDynamicGroupLayout;
  #rasterStaticGroupLayout;
  #computeStaticGroupLayout;
  #textureGroupLayout;
  
  #postDynamicGroupLayout;
  #shiftGroupLayout;
  #averageGroupLayout;
  #canvasGroupLayout;
  
  #clearGroup;
  #depthGroup;
  #rasterRenderGroup;
  #computeRenderGroup;
  #rasterDynamicGroup;
  #computeDynamicGroup;
  #rasterStaticGroup;
  #computeStaticGroup;
  #textureGroup;
  
  #postDynamicGroup;
  #shiftGroup;
  #averageGroup;
  #canvasGroup;
  
  #engineState = {};
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
    let width = Math.round(this.#canvas.clientWidth * this.config.renderQuality);
    let height = Math.round(this.#canvas.clientHeight * this.config.renderQuality);

    this.#canvas.width = width;
    this.#canvas.height = height;
    
    let allScreenTextures = [this.#computeTarget, ... this.#rasterRenderTextures];
    // Add temporal target texture
    if (this.config.temporal) allScreenTextures.push(this.#shiftTarget, this.#averageTarget);
    // Free old texture buffers
    allScreenTextures.forEach(texture => {
      try {
        texture.destroy();
      } catch {}
    });

    
    this.#depthBuffer = this.#device.createBuffer({ size: height * width * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST});
    
    this.#rasterRenderTextures = rasterRenderFormats.map(format => this.#device.createTexture({
      size: [width, height],
      format: format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
    }));
    // This compute render group will be generated in the frame cycle due to the canvas texture being deleted every frame
    
    // Init canvas render texture
    this.#computeTarget = this.#device.createTexture({
      // dimension: '3d',
      size: [width, height, this.config.temporal ? this.config.temporalSamples * 2 : 1],
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
    });

    if (this.config.temporal) {
      // Init temporal screen space correction render target
      this.#shiftTarget = this.#device.createTexture({
        // dimension: '3d',
        size: [width, height, this.config.temporalSamples],
        format: 'rgba32float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
      });
      // Init temporal render texture
      this.#averageTarget = this.#device.createTexture({
        size: [width, height],
        format: 'rgba32float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
      });
    }
  }
  
  // Make canvas read only accessible
  get canvas () {
    return this.#canvas;
  }

  updateScene (device = this.#device) {
    if (!device) return;
    // Generate texture arrays and buffers
    console.log(this.scene.queue);
    let builtScene = this.scene.generateArraysFromGraph();
    
    this.#engineState.bufferLength = builtScene.bufferLength;

    let staticBufferArrays = [
      builtScene.idBuffer,
      builtScene.geometryBuffer,
      builtScene.sceneBuffer,
    ];

    this.#staticBuffers = staticBufferArrays.map(array => {
      let buffer = device.createBuffer({ size: array.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST});
      device.queue.writeBuffer(buffer, 0, array);
      return buffer;
    });

    let staticEntries = this.#staticBuffers.map((buffer, i) => ({ binding: i, resource: { buffer }}));

    this.#rasterStaticGroup = device.createBindGroup({
      label: 'static binding group for raster pass',
      layout: this.#rasterStaticGroupLayout,
      entries: staticEntries.slice(0, 2),
    });
    
    this.#computeStaticGroup = device.createBindGroup({
      label: 'static binding group for compute pass',
      layout: this.#computeStaticGroupLayout,
      entries: staticEntries,
    });
  }

  async #generateAtlasView (list) {
    let [width, height] = this.scene.standardTextureSizes;
    let textureWidth = Math.floor(2048 / width);
    let canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');
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
        let intensity = Object.is(lightSource.intensity)? this.scene.defaultLightIntensity : lightSource.intensity;
        let variation = Object.is(lightSource.variation)? this.scene.defaultLightVariation : lightSource.variation;
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
    
    console.log(this.#canvas);
    
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
    
    this.#prepareEngine(this.#device);
  }
  
  #prepareEngine (device) {
    this.halt();
    // Allow frame rendering
    this.#halt = false;
    // Reset engine state
    Object.assign(this.#engineState, {
      // Parameters to compare against current state of the engine and recompile shaders on change
      filter: this.config.filter,
      temporal: this.config.temporal,
      temporalSamples: this.config.temporalSamples,
      renderQuality: this.config.renderQuality,
      // New buffer length
      bufferLength: 0
    });

    this.#clearGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },                                                            // depth
        { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'r32sint', viewDimension: '2d' } }        // triangle index
      ]
    });

    this.#depthGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'storage' } }  // depth
      ]
    });

    this.#rasterRenderGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },                                                 // depth
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, storageTexture: { access: 'write-only', format: 'r32sint', viewDimension: '2d' } },      // triangle index
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, storageTexture: { access: 'write-only', format: 'rgba32float', viewDimension: '2d' } },  // 3d positions
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, storageTexture: { access: 'write-only', format: 'rg32float', viewDimension: '2d' } }     // uvs
      ]
    });

    this.#computeRenderGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba32float', viewDimension: '2d-array' } }, // output
        { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { type: 'sint', sampleType: 'sint' } }, //storageTexture: { access: 'read-only', format: 'r32sint', viewDimension: '2d' } },            // triangle index
        { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { type: 'float', sampleType: 'unfilterable-float' } }, //storageTexture: { access: 'read-only', format: 'rgba32float', viewDimension: '2d' } },        // 3d positions
        { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { type: 'float', sampleType: 'unfilterable-float' } }  //storageTexture: { access: 'read-only', format: 'rg32float', viewDimension: '2d' } }           // uvs
      ]
    });

    this.#rasterStaticGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },  // indices
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },  // geometry
      ]
    });

    this.#computeStaticGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // indices
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // geometry
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }   // scene
      ]
    });

    this.#rasterDynamicGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // uniforms
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },                 // transforms
      ]
    });

    this.#computeDynamicGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },            // uniforms
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // transforms
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },  // light sources
      ]
    });

    this.#textureGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { type: 'uint' } },  // texture atlas
        { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { type: 'uint' } },  // pbr texture atlas
        { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { type: 'uint' } }   // translucency texture atlas
      ]
    });

    if (this.config.temporal) {
      this.#shiftGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { type: 'float', sampleType: 'unfilterable-float', viewDimension: '2d-array' } }, // storageTexture: { access: 'read-only', format: 'rgba32float', viewDimension: '2d-array' } },   // compute output
          { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba32float', viewDimension: '2d-array' } }   // shift target
        ]
      });

      this.#averageGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { type: 'float', sampleType: 'unfilterable-float', viewDimension: '2d-array' } },//storageTexture: { access: 'read-only', format: 'rgba32float', viewDimension: '2d-array' } },   // shift output
          { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba32float', viewDimension: '2d' } }         // average target
        ]
      });
    }

    this.#postDynamicGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }, // uniforms
      ]
    });

    this.#canvasGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { type: 'float', sampleType: 'unfilterable-float' } }, //storageTexture: { access: 'read-only', format: 'rgba32float', viewDimension: '2d' } },  // compute output
        { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm', viewDimension: '2d' } }   // canvas target
      ]
    });

    let clearShader = Network.fetchSync('shaders/pathtracer_clear.wgsl');
    // Shaders are written in a language called WGSL.
    let clearModule = device.createShaderModule({ code: clearShader });
    
    this.#clearPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [
        this.#clearGroupLayout
      ] }),
      compute: {
        module: clearModule,
        entryPoint: 'compute'
      }
    });

    let depthShader = Network.fetchSync('shaders/pathtracer_depth.wgsl');
    let depthModule = device.createShaderModule({ code: depthShader });

    this.#depthPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [
        this.#depthGroupLayout,
        this.#rasterStaticGroupLayout,
        this.#rasterDynamicGroupLayout
      ] }),
      // Vertex shader
      vertex: {
        module: depthModule,
        entryPoint: 'vertex',
      },
      // Fragment shader
      fragment: {
        module: depthModule,
        entryPoint: 'fragment',
        targets: [{ format: 'rgba8unorm' }],
      },
      // Culling config
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back'
      },
    });

    let rasterShader = Network.fetchSync('shaders/pathtracer_raster.wgsl');
    let rasterModule = device.createShaderModule({ code: rasterShader });

    this.#rasterPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [
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
    });

    let computeShader = Network.fetchSync('shaders/pathtracer_compute.wgsl');
    // Shaders are written in a language called WGSL.
    let computeModule = device.createShaderModule({code: computeShader});
    
    this.#computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [
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

    if (this.config.temporal) {
      let shiftShader = Network.fetchSync('shaders/pathtracer_shift.wgsl');
      // Shaders are written in a language called WGSL.
      let shiftModule = device.createShaderModule({code: shiftShader});
      // Pipeline for screen space correction of motion before accumulation
      this.#shiftPipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [ this.#shiftGroupLayout, this.#postDynamicGroupLayout ] }),
        compute: { module: shiftModule, entryPoint: 'compute' }
      });


      let averageShader = Network.fetchSync('shaders/pathtracer_average.wgsl');
      // Shaders are written in a language called WGSL.
      let averageModule = device.createShaderModule({code: averageShader});
      // Pipeline for temporal accumulation
      this.#averagePipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [ this.#averageGroupLayout, this.#postDynamicGroupLayout ] }),
        compute: { module: averageModule, entryPoint: 'compute' }
      });
    }

    let canvasShader = Network.fetchSync('shaders/pathtracer_canvas.wgsl');
    // Shaders are written in a language called WGSL.
    let canvasModule = device.createShaderModule({code: canvasShader});
    // Pipeline for rendering to canvas
    this.#canvasPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [ this.#canvasGroupLayout, this.#postDynamicGroupLayout ] }),
      compute: { module: canvasModule, entryPoint: 'compute' }
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
    };
    // Create uniform buffer for shader uniforms
    this.#uniformBuffer = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // Create uniform buffer for transforms in shader
    // Build / Rebuild scene graph for GPU into storage buffer
    this.updateScene(device);
    // Init canvas parameters and textures with resize
    this.resize();
    // this.#renderFrame();
    this.#resizeEvent = window.addEventListener('resize', () => this.resize());
    // Begin frame cycle
    requestAnimationFrame(() => this.#frameCycle(device));
  }

  // Internal render engine Functions
  #frameCycle (device) {
    // console.log(this.#halt);
    if (this.#halt) return;
    // this.#halt = true;
    let timeStamp = performance.now();

    // Check if recompile is required
    if (
      this.#engineState.filter !== this.config.filter ||
      this.#engineState.temporal !== this.config.temporal ||
      this.#engineState.temporalSamples !== this.config.temporalSamples ||
      this.#engineState.renderQuality !== this.config.renderQuality
    ) {
      // Update Textures
      requestAnimationFrame(() => this.#prepareEngine(device));
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
      requestAnimationFrame(() => this.#frameCycle(device))
    }, 1000 / this.fpsLimit);
  }

  async #renderFrame () {

    let canvasTarget = this.#context.getCurrentTexture();
    // Assemble lists to fill bind groups
    let depthBufferEntry = { binding: 0, resource: { buffer: this.#depthBuffer }};
    let rasterGroupEntries = this.#rasterRenderTextures.map((texture, i) => ({ binding: i + 1, resource: texture.createView() }));
    rasterGroupEntries.unshift(depthBufferEntry);

    let computeGroupEntries = [this.#computeTarget, ... this.#rasterRenderTextures].map((texture, i) => ({ binding: i, resource: texture.createView() }));
    computeGroupEntries[0].resource = this.#computeTarget.createView({ dimension: '2d-array' });

    // Fill render binding groups
    this.#clearGroup = this.#device.createBindGroup({
      label: 'clear storage textures',
      layout: this.#clearGroupLayout,
      entries: rasterGroupEntries.slice(0, 2)
    });

    this.#depthGroup = this.#device.createBindGroup({
      label: 'depth buffer for depth testing raster pass',
      layout: this.#depthGroupLayout,
      entries: [depthBufferEntry]
    });

    this.#rasterRenderGroup = this.#device.createBindGroup({
      label: 'render output group for raster pass',
      layout: this.#rasterRenderGroupLayout,
      entries: rasterGroupEntries
    });

    this.#computeRenderGroup = this.#device.createBindGroup({
      label: 'render input group for compute pass',
      layout: this.#computeRenderGroupLayout,
      entries: computeGroupEntries
    });


    if (this.config.temporal) {
      let shiftGroupEntries = [this.#computeTarget, this.#shiftTarget].map((texture, i) => ({ binding: i, resource: texture.createView() }));
      this.#shiftGroup = this.#device.createBindGroup({ label: 'bind group for motion correction pass', layout: this.#shiftGroupLayout, entries: shiftGroupEntries });

      let averageGroupEntries = [this.#shiftTarget, this.#averageTarget].map((texture, i) => ({ binding: i, resource: texture.createView() }));
      this.#averageGroup = this.#device.createBindGroup({ label: 'bind group accumulation pass', layout: this.#averageGroupLayout, entries: averageGroupEntries });
    }

    let canvasIn = this.config.temporal ? this.#averageTarget : this.#computeTarget;
    
    let canvasGroupEntries = [canvasIn, canvasTarget].map((texture, i) => ({ binding: i, resource: texture.createView() }));
    canvasGroupEntries[0].resource = canvasIn.createView({ dimension: '2d'});
    
    this.#canvasGroup = this.#device.createBindGroup({
      label: 'render input group for canvas pass',
      layout: this.#canvasGroupLayout,
      entries: canvasGroupEntries
    });
    
    // Calculate camera offset and projection matrix
    let dir = {x: this.camera.fx, y: this.camera.fy};
    let invFov = 1 / this.camera.fov;
    let heightInvWidthFov = this.#canvas.height * invFov / this.#canvas.width;
    let viewMatrix = [
      [   Math.cos(dir.x) * heightInvWidthFov,            0,                          Math.sin(dir.x) * heightInvWidthFov         ],
      [ - Math.sin(dir.x) * Math.sin(dir.y) * invFov,     Math.cos(dir.y) * invFov,   Math.cos(dir.x) * Math.sin(dir.y) * invFov  ],
      [ - Math.sin(dir.x) * Math.cos(dir.y),            - Math.sin(dir.y),            Math.cos(dir.x) * Math.cos(dir.y)           ]
    ];
    
    // console.log(this.#randomSeedNums[targetLayer]);
    let targetLayer = this.config.temporal ? this.#engineState.temporalFrame : 0;
    // Transpose view matrix in buffer
    let uniformValues = new Float32Array([
      // View matrix
      viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0], 0,
      viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1], 0,
      viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2], 0,
      // Camera
      this.camera.x, this.camera.y, this.camera.z, 0,
      // Ambient light
      this.scene.ambientLight[0], this.scene.ambientLight[1], this.scene.ambientLight[2], 0,
      // Texture size
      this.scene.standardTextureSizes[0], this.scene.standardTextureSizes[1],
      // Render size
      this.canvas.width, this.canvas.height,

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
      // Temporal target
      targetLayer, 0, 0
    ]);
    // Update uniform values on GPU
    this.#device.queue.writeBuffer(this.#uniformBuffer, 0, uniformValues);
    // Update transform matrices on GPU
    let transformArray = Transform.buildWGPUArray();
    this.#transformBuffer = this.#device.createBuffer({ size: transformArray.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST})
    this.#device.queue.writeBuffer(this.#transformBuffer, 0, transformArray);

    this.#dynamicBuffers = [this.#uniformBuffer, this.#transformBuffer, this.#lightBuffer];
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

    this.#postDynamicGroup = this.#device.createBindGroup({
      label: 'dynamic binding group for post processing passes',
      layout: this.#postDynamicGroupLayout,
      entries: dynamicEntries.slice(0, 1),
    });

    let screenClusterDims = [Math.ceil(this.canvas.width / 8), Math.ceil(this.canvas.height / 8)];
    let kernelClusterDims = [Math.ceil(this.canvas.width / 8), Math.ceil(this.canvas.height / 8)];
    // Set render target for canvas
    this.#renderPassDescriptor.colorAttachments[0].view = canvasTarget.createView();
    // Command encoders record commands for the GPU to execute.
    let commandEncoder = this.#device.createCommandEncoder();
    // Clear renderable textures
    let clearEncoder = commandEncoder.beginComputePass();
    clearEncoder.setPipeline(this.#clearPipeline);
    clearEncoder.setBindGroup(0, this.#clearGroup);
    // Compute pass
    clearEncoder.dispatchWorkgroups(screenClusterDims[0], screenClusterDims[1]);
    // End compute pass
    clearEncoder.end();

    
    // All rendering commands happen in a render pass
    let depthEncoder = commandEncoder.beginRenderPass(this.#renderPassDescriptor);
    // Set the pipeline to use when drawing
    depthEncoder.setPipeline(this.#depthPipeline);
    // Set storage buffers for rester pass
    depthEncoder.setBindGroup(0, this.#depthGroup);
    depthEncoder.setBindGroup(1, this.#rasterStaticGroup);
    depthEncoder.setBindGroup(2, this.#rasterDynamicGroup);
    // Draw vertices using the previously set pipeline
    depthEncoder.draw(3, this.#engineState.bufferLength);
    // End the render pass
    depthEncoder.end();

    // All rendering commands happen in a render pass
    let renderEncoder = commandEncoder.beginRenderPass(this.#renderPassDescriptor);
    // Set the pipeline to use when drawing
    renderEncoder.setPipeline(this.#rasterPipeline);
    // Set storage buffers for rester pass
    renderEncoder.setBindGroup(0, this.#rasterRenderGroup);
    renderEncoder.setBindGroup(1, this.#rasterStaticGroup);
    renderEncoder.setBindGroup(2, this.#rasterDynamicGroup);
    // Draw vertices using the previously set pipeline
    renderEncoder.draw(3, this.#engineState.bufferLength);
    // End the render pass
    renderEncoder.end();
    
    
    // Run compute shader
    let computeEncoder = commandEncoder.beginComputePass();
    // Set the storage buffers and textures for compute pass
    computeEncoder.setPipeline(this.#computePipeline);
    computeEncoder.setBindGroup(0, this.#computeRenderGroup);
    computeEncoder.setBindGroup(1, this.#textureGroup);
    computeEncoder.setBindGroup(2, this.#computeStaticGroup);
    computeEncoder.setBindGroup(3, this.#computeDynamicGroup);
    computeEncoder.dispatchWorkgroups(kernelClusterDims[0], kernelClusterDims[1]);
    // End compute pass
    computeEncoder.end();
    
    let canvasEncoder = commandEncoder.beginComputePass();
    // Set the storage buffers and textures for compute pass
    canvasEncoder.setPipeline(this.#canvasPipeline);
    canvasEncoder.setBindGroup(0, this.#canvasGroup);
    canvasEncoder.setBindGroup(1, this.#postDynamicGroup);
    canvasEncoder.dispatchWorkgroups(screenClusterDims[0], screenClusterDims[1]);
    // End compute pass
    canvasEncoder.end();
    
    // Finish recording commands, which creates a command buffer.
    let commandBuffer = commandEncoder.finish();
    this.#device.queue.submit([commandBuffer]);
  }
}
