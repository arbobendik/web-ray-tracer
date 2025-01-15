"use strict";

export type WebGPUAntialiasingType = "fxaa" | "taa" | undefined;

export abstract class AntialiasingModule {
    abstract type: WebGPUAntialiasingType;

    abstract get textureInView(): GPUTextureView | undefined;
    abstract get textureInView2dArray(): GPUTextureView | undefined;

    abstract createTexture(): void;
    abstract createBindGroup(textureOut: GPUTexture): void;
    abstract renderFrame(commandEncoder: GPUCommandEncoder): void;
}