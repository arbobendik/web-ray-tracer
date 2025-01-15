"use strict";

import { Scene } from "../common/scene/scene.js";
import { Config } from "../common/config.js";
import { Camera } from "../common/scene/camera.js";
import { POW32M1 } from "./lib/math.js";

export type ApiType = "webgl2" | "webgpu";
export type RendererType = "rasterizer" | "pathtracer";

export abstract class Renderer {
    abstract readonly type: RendererType;
    abstract readonly api: ApiType;
    // Runtime properties of the renderer (private attributes)
    protected scene: Scene;
    protected canvas: HTMLCanvasElement;
    // Configurable runtime properties of the pathtracer (public attributes)
    camera: Camera;
    config: Config;
    // Frame counter modulo at 2^32 - 1
    protected _frameCounter: number = 0;
    get frameCounter () { return this._frameCounter; }
    // Performance metrics
    private lastTimeStamp: number = performance.now();

    private _fps: number = 0;
    get fps () { return this._fps; }

    private _frameTimeHistory: number[] = [];
    get frameTimeHistory () { return this._frameTimeHistory; }

    fpsLimit: number = Infinity;

    constructor(scene: Scene, canvas: HTMLCanvasElement, camera: Camera, config: Config) {
        this.scene = scene;
        this.canvas = canvas;
        this.camera = camera;
        this.config = config;
    }

    abstract render(): void;
    abstract halt(): boolean;

    protected updatePerformanceMetrics(): void {
        // Update frame counter
        this._frameCounter = (this._frameCounter + 1) % POW32M1;
        // Calculate delta time
        const currentTime: number = performance.now();
        const deltaTime: number = currentTime - this.lastTimeStamp;
        this.lastTimeStamp = currentTime;
        // Update frame rate
        this._frameTimeHistory.push(deltaTime);
        // Limit history to 100 frames
        if (this._frameTimeHistory.length > 100) this._frameTimeHistory.shift();
        // Calculate frame rate
        const averageFrameTimeMs = this._frameTimeHistory.reduce((a, b) => a + b, 0) / this._frameTimeHistory.length;
        this._fps = 1000 / averageFrameTimeMs;
    }
}
