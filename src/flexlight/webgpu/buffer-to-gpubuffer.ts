"use strict";

import { TypedArray } from "../common/buffer/typed-array-view";
import { BufferToGPU } from "../common/buffer/buffer-to-gpu";
import { BufferManager } from "../common/buffer/buffer-manager";

const MIN_BUFFER_LENGTH: number = 16;

export class BufferToGPUBuffer<T extends TypedArray> extends BufferToGPU {
    protected bufferManager: BufferManager<T>;

    private _gpuBuffer: GPUBuffer;
    get gpuResource() { return this._gpuBuffer; }
    
    private device: GPUDevice;
    private label: string;

    constructor(bufferManager: BufferManager<T>, device: GPUDevice, label: string = "") {
        super();
        // Save device for future use
        this.device = device;
        // Save buffer manager for future use
        this.bufferManager = bufferManager;
        // Save label for reference
        this.label = label;
        // Bind GPUBuffer to BufferManager
        bufferManager.bindGPUBuffer(this);
        // Create GPUBuffer
        this._gpuBuffer = device.createBuffer({ size: Math.max(bufferManager.buffer.byteLength, MIN_BUFFER_LENGTH), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: label });
        // Copy data from buffer manager to GPUBuffer
        device.queue.writeBuffer(this._gpuBuffer, 0, this.bufferManager.bufferView);
    }

    // Reconstruct GPUBuffer from BufferManager, necessary if BufferManager is resized
    reconstruct = () => {
        // Destroy old GPUBuffer
        this._gpuBuffer.destroy();
        // Create GPUBuffer
        this._gpuBuffer = this.device.createBuffer({ size: Math.max(this.bufferManager.buffer.byteLength, MIN_BUFFER_LENGTH), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: this.label });
        // Copy data from buffer manager to GPUBuffer
        this.device.queue.writeBuffer(this._gpuBuffer, 0, this.bufferManager.bufferView);
    }

    // Update GPUBuffer partially or fully from BufferManager if data has changed
    update = (byteOffset: number = 0, length: number = this.bufferManager.length) => {
        const elementOffset = byteOffset / this.bufferManager.viewConstructor.prototype.BYTES_PER_ELEMENT;
        this.device.queue.writeBuffer(this._gpuBuffer, byteOffset, this.bufferManager.bufferView, elementOffset, length);
    }

    destroy = () => {
        // Destroy GPUBuffer
        this._gpuBuffer.destroy();
        // Release GPUBuffer from BufferManager
        this.bufferManager.releaseGPUBuffer();
    }
}