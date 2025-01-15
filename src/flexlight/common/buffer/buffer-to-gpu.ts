"use strict";

export abstract class BufferToGPU {
    abstract get gpuResource(): any;
    // Reconstruct GPUBuffer from BufferManager, necessary if BufferManager is resized
    abstract reconstruct(): void;
    // Update GPUBuffer partially or fully from BufferManager if data has changed
    abstract update(byteOffset: number, length: number): void;
    // Destroy GPUBuffer
    abstract destroy(): void;
}