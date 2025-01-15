"use strict";


import { Camera } from "./common/scene/camera.js";
import { Config } from "./common/config.js";
import { Scene } from "./common/scene/scene.js";
// import { Vector, ZeroVector, Matrix, ZeroMatrix, IdentityMatrix, HouseholderMatrix } from "./common/lib/math.js";
// import { Transform } from "./common/scene/transform.js";
import { ApiType, RendererType } from "./common/renderer.js";
// import { PathTracerWGL2 } from "./webgl2/pathtracer.js";
import { PathTracerWGPU } from "./webgpu/pathtracer.js";
// import { RasterizerWGL2 } from "./webgl2/rasterizer.js";
// import { RasterizerWGPU } from "./webgpu/rasterizer.js";
import { IoType, WebIo } from "./common/io.js";
import { UI } from "./common/ui.js";

export class FlexLight {
  private _api: ApiType;
  private _canvas: HTMLCanvasElement;

  private _camera: Camera;
  private _config: Config;
  private _scene: Scene;
  private _renderer: Renderer;

  private _ui: UI;
  private _io: WebIo;

  constructor (canvas: HTMLCanvasElement) {
    this._api = "webgpu";
    this._canvas = canvas;
    this._camera = new Camera();
    this._config = new Config();
    this._scene = new Scene();
    this._renderer = new PathTracerWGPU(canvas, this._scene, this._camera, this._config);
    this._io = new WebIo(canvas, this._camera);
    this._ui = new UI(this._scene, this._camera);
  }

  get api (): ApiType { return this._api; }
  get canvas (): HTMLCanvasElement { return this._canvas; }
  get camera (): Camera { return this._camera; }
  get config (): Config { return this._config; }
  get scene (): Scene { return this._scene; }
  get renderer (): Renderer { return this._renderer; }
  get rendererType (): RendererType { return this._renderer.type; }
  get io (): WebIo { return this._io; }


  private recreateRenderer(rendererType: RendererType): void {
    // Log renderer type and api
    console.log("rendererType", rendererType);
    console.log("apiType", this._api);
    // Save if renderer was running
    const wasRunning: boolean = this._renderer.halt();
    switch (rendererType + this._api) {
      case "pathtracerwebgl2":
        // this._renderer = new PathTracerWGL2(this._canvas, this._scene, this._camera, this._config);
        break;
      case "pathtracerwebgpu":
        this._renderer = new PathTracerWGPU(this._canvas, this._scene, this._camera, this._config);
        break;
      case "rasterizerwebgl2":
        // this._renderer = new RasterizerWGL2(this._canvas, this._scene, this._camera, this._config);
        break;
      case "rasterizerwebgpu":
        // this._renderer = new RasterizerWGPU(this._canvas, this._scene, this._camera, this._config);
        break;
      default:
        throw new Error("Renderer option" + rendererType + "on api" + this._api + "doesn't exist.");
    }
    // Resume rendering if renderer was running before
    if (wasRunning) this._renderer.render();
  }

  private recreateIo(io: IoType): void {
    switch (io) {
      case "web":
        this._io = new WebIo(this._canvas, this._camera);
        break;
      default:
        throw new Error("Io option" + io + "doesn't exist.");
    }
  }

  set canvas (canvas: HTMLCanvasElement) {
    if (canvas == this._canvas) return;
    this._canvas = canvas;
    // Reset renderer and io for canvas
    this.recreateRenderer(this._renderer.type);
    this.recreateIo("web");
  }

  set api (api: ApiType) {
    if (api == this._api) return;
    this._api = api;
    // Replace canvas element
    let newCanvas = document.createElement("canvas");
    // Replace canvas element in parent if it exists
    this._canvas.parentElement?.replaceChild(newCanvas, this._canvas);
    this._canvas = newCanvas;
    // Reset renderer and io for api
    this.recreateRenderer(this._renderer.type);
    this.recreateIo("web");
  }

  set config (config: Config) {
    this._config = config;
    this._renderer.config = config;
  }

  set camera (camera: Camera) {
    this._camera = camera;
    this._renderer.camera = camera;
    this._io.camera = camera;
    this._ui.camera = camera;
  }

  set scene (scene: Scene) {
    this._scene = scene;
    this._ui.scene = scene;
    this.recreateRenderer(this._renderer.type);
  }

  set renderer (rendererType: RendererType) { this.recreateRenderer(rendererType); }
  set rendererType (rendererType: RendererType) { this.recreateRenderer(rendererType); }

  set io (io: IoType) { this.recreateIo(io); }

  // Allow to take screenshot of the canvas
  screenshot () {
    this._canvas.toBlob((blob: Blob | null) => {
      if (!blob) throw new Error("Failed to take screenshot, canvas can't be converted to blob.");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "screenshot.png";
      a.click();
    });
  }
}



// Import just to Export
import { 
  Vector, ZeroVector,
  Matrix, ZeroMatrix, IdentityMatrix, HouseholderMatrix,
} from "./common/lib/math.js";

import { Transform } from "./common/scene/transform.js";

import {
  NormalTexture, AlbedoTexture, EmissiveTexture, RoughnessTexture, MetallicTexture
} from "./common/scene/texture.js";

import { Prototype } from "./common/scene/prototype.js";
import { Material } from "./common/scene/material.js";
import { Instance } from "./common/scene/instance.js";
import { PointLight } from "./common/scene/point-light.js";

import { Renderer } from "./common/renderer.js";
import { RendererWGPU } from "./webgpu/renderer-webgpu.js";
import { WebGPUAntialiasingType } from "./webgpu/antialiasing/antialiasing-module.js";

// Export classes
export {
  // Math
  Vector, ZeroVector,
  Matrix, ZeroMatrix, IdentityMatrix, HouseholderMatrix,
  // Textures
  NormalTexture, AlbedoTexture, EmissiveTexture, RoughnessTexture, MetallicTexture,

  Transform,
  Prototype, Material, Instance, PointLight,
  Scene, Camera, Config, UI, WebIo,
  // Renderer
  Renderer, RendererWGPU, PathTracerWGPU,
}

// Export types
export type { ApiType, RendererType, IoType, WebGPUAntialiasingType };