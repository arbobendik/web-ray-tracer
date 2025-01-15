'use strict';


import { Camera } from '../common/scene/camera.js';
import { Config } from '../common/config.js';
import { Scene } from '../common/scene/scene.js';
import { Vector, ZeroVector, Matrix, ZeroMatrix, IdentityMatrix, HouseholderMatrix } from '../common/lib/math.js';
import { Transform } from '../common/scene/transform.js';
import { PathTracerWGL2 } from '../webgl2/pathtracer.js';
import { PathTracerWGPU } from '../webgpu/pathtracer.js';
import { RasterizerWGL2 } from '../webgl2/rasterizer.js';
import { RasterizerWGPU } from './webgpu/rasterizer.js';
import { WebIo } from '../common/io.js';
import { UI } from '../common/ui.js';


export { Camera, Config, Scene };
export { Vector, ZeroVector, Matrix, ZeroMatrix, IdentityMatrix, HouseholderMatrix };
export { Transform };
export { PathTracerWGL2, PathTracerWGPU };
export { RasterizerWGL2, RasterizerWGPU };
export { WebIo };
export { UI };


export class FlexLight {
  #idRenderer;
  #idIo;

  #api;
  #canvas;

  #camera;
  #config;
  #scene;
  #renderer;

  #ui;
  #io;

  constructor (canvas) {
    this.#api = 'webgl2';
    this.#canvas = canvas;
    this.#camera = new Camera ();
    this.#config = new Config();
    this.#scene = new Scene ();
    this.#renderer = new RasterizerWGL2 (canvas, this.#scene, this.#camera, this.#config);
    this.#io = new WebIo (canvas, this.#renderer, this.#camera);
    this.#ui = new UI (this.#scene, this.#camera);
  }

  get canvas () {
    return this.#canvas;
  }

  get api () {
    return this.#api;
  }

  get camera () {
    return this.#camera;
  }

  get config () {
    return this.#config;
  }

  get scene () {
    return this.#scene;
  }

  get renderer () {
    return this.#renderer;
  }

  get io () {
    return this.#io;
  }

  set canvas (canvas) {
    if (canvas == this.#canvas) return;
    this.#canvas = canvas;
    // Reset renderer and io for canvas
    this.renderer = this.#idRenderer;
    this.io = this.#idIo;
  }

  set api (api) {
    if (api == this.#api) return;
    this.#api = api;
    // Replace canvas element
    let newCanvas = document.createElement('canvas');
    console.log(this.#canvas.parentElement);
    this.#canvas.parentElement.replaceChild(newCanvas, this.#canvas);
    this.#canvas = newCanvas;
    // Reset renderer and io for api
    this.renderer = this.#idRenderer;
    this.io = this.#idIo;
  }

  set config (config) {
    this.#config = config;
    this.#renderer.config = config;
  }

  set camera (camera) {
    this.#camera = camera;
    this.#renderer.camera = camera;
    this.#scene.camera = camera;
    this.#ui.camera = camera;
  }

  set scene (scene) {
    this.#scene = scene;
    this.#ui.scene = scene;
    this.#renderer.scene = scene;
  }

  set renderer (renderer) {
    this.#idRenderer = renderer;
    // if (this.#idRenderer == this.#renderer.type) return;
    console.log(this.#idRenderer + this.#api);
    let wasRunning = this.#renderer.halt();
    switch (this.#idRenderer + this.#api) {
      case 'pathtracerwebgl2':
        this.#renderer = new PathTracerWGL2(this.#canvas, this.#scene, this.#camera, this.#config);
        break;
      case 'pathtracerwebgpu':
        this.#renderer = new PathTracerWGPU(this.#canvas, this.#scene, this.#camera, this.#config);
        break;
      case 'rasterizerwebgl2':
        this.#renderer = new RasterizerWGL2(this.#canvas, this.#scene, this.#camera, this.#config);
        break;
      case 'rasterizerwebgpu':
        this.#renderer = new RasterizerWGPU(this.#canvas, this.#scene, this.#camera, this.#config);
        break;
      default:
        console.error('Renderer option', this.#idRenderer, 'on api', this.#api, 'doesn\'t exist.');
    }
    // Reapply antialiasing to new renderer
    if (wasRunning) this.#renderer.render();
  }

  set io (io) {
    this.#idIo = io ?? 'web';
    switch (this.#idIo) {
      case 'web':
        this.#io = new WebIo(this.#canvas, this.#renderer, this.camera);
        break;
      default:
        console.error('Io option', this.#idIo, 'doesn\'t exist.');
    }
    this.#io.renderer = this.#renderer;
  }

  screenshot () {
    this.#canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'screenshot.png';
      a.click();
    });
  }
}