"use strict";

import { Constructor } from "../common/buffer/typed-array-view";
import { BufferToGPU } from "../common/buffer/buffer-to-gpu";
import { BufferManager } from "../common/buffer/buffer-manager";
import { Vector } from "../common/lib/math";


export type TypedArrayForTexture = Float32Array | Uint32Array | Int32Array | Uint16Array | Int16Array | Int8Array | Uint8Array;
const TEXTURE_SIZE_2D: Vector<2> = new Vector(2048, 2048);


const ConstructorToTextureFormat: Map<Constructor<TypedArrayForTexture>, GPUTextureFormat> = new Map([
    [Float32Array  as Constructor<TypedArrayForTexture>, "r32float"],
    [Uint32Array, "r32uint"],
    [Int32Array, "r32sint"],
    // [Float16Array, "rgba16float"],
    [Uint16Array, "r16uint"],
    [Int16Array, "r16sint"],
    [Int8Array, "r8sint"],
    [Uint8Array, "r8uint"],
]);

export class BufferToStorageTexture<T extends TypedArrayForTexture> extends BufferToGPU {
    protected bufferManager: BufferManager<T>;

    private gpuTextureSize: number;
    private _gpuTexture: GPUTexture;
    get gpuResource() { return this._gpuTexture.createView({ dimension: "2d-array", arrayLayerCount: this.gpuTextureSize / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y) }); }
    
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
        this._gpuTexture = this.device.createTexture({
            // dimension: "3d",
            size: [TEXTURE_SIZE_2D.x, TEXTURE_SIZE_2D.y, Math.ceil(bufferManager.length / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y))],
            format: ConstructorToTextureFormat.get(bufferManager.viewConstructor)!,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST
        });

        const pageByteLength = TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y * bufferManager.viewConstructor.prototype.BYTES_PER_ELEMENT;

        const arrayBuffer = new ArrayBuffer(Math.ceil(bufferManager.length / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y)) * pageByteLength);
        const fullView = new bufferManager.viewConstructor(arrayBuffer, 0, arrayBuffer.byteLength / bufferManager.viewConstructor.prototype.BYTES_PER_ELEMENT);

        fullView.set(this.bufferManager.bufferView);
        // Copy data from buffer manager to GPUBuffer
        device.queue.writeTexture(
            { texture: this._gpuTexture, aspect: "all" },
            fullView, 
            { bytesPerRow: TEXTURE_SIZE_2D.x * this.bufferManager.viewConstructor.prototype.BYTES_PER_ELEMENT },
            { width: TEXTURE_SIZE_2D.x, height: TEXTURE_SIZE_2D.y, depthOrArrayLayers: Math.ceil(bufferManager.length / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y)) }
        );

        // Update gpuTextureSize
        this.gpuTextureSize = TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y * Math.ceil(bufferManager.length / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y));
    }

    // Reconstruct GPUBuffer from BufferManager, necessary if BufferManager is resized
    reconstruct = () => {
        // Only reconstruct if gpuTexture needs to be recreated
        if (this.gpuTextureSize < this.bufferManager.length) {
            // Destroy old GPUTexture
            this._gpuTexture.destroy();
            // Rereate GPUTexture
            this._gpuTexture = this.device.createTexture({
                // dimension: "3d",
                size: [TEXTURE_SIZE_2D.x, TEXTURE_SIZE_2D.y, Math.ceil(this.bufferManager.length / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y))],
                format: ConstructorToTextureFormat.get(this.bufferManager.viewConstructor)!,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST
            });
            // Update gpuTextureSize
            this.gpuTextureSize = TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y * Math.ceil(this.bufferManager.length / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y));

            const pageByteLength = TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y * this.bufferManager.viewConstructor.prototype.BYTES_PER_ELEMENT;
            const arrayBuffer = new ArrayBuffer(Math.ceil(this.bufferManager.length / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y)) * pageByteLength);
            const fullView = new this.bufferManager.viewConstructor(arrayBuffer, 0, arrayBuffer.byteLength / this.bufferManager.viewConstructor.prototype.BYTES_PER_ELEMENT);
    
            fullView.set(this.bufferManager.bufferView);
            // Copy data from buffer manager to GPUBuffer
            this.device.queue.writeTexture(
                { texture: this._gpuTexture, aspect: "all" },
                fullView, 
                { bytesPerRow: TEXTURE_SIZE_2D.x * this.bufferManager.viewConstructor.prototype.BYTES_PER_ELEMENT },
                { width: TEXTURE_SIZE_2D.x, height: TEXTURE_SIZE_2D.y, depthOrArrayLayers: Math.ceil(this.bufferManager.length / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y)) }
            );
        }
    }

    // Update GPUBuffer partially or fully from BufferManager if data has changed
    update = (byteOffset: number = 0, length: number = this.bufferManager.length) => {
        const elementOffset: number = byteOffset / this.bufferManager.viewConstructor.prototype.BYTES_PER_ELEMENT;

        const startLayer: number = Math.floor(elementOffset / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y));
        const startLayerByteOffset: number = startLayer * TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y * this.bufferManager.viewConstructor.prototype.BYTES_PER_ELEMENT;

        const endLayer: number = Math.floor((elementOffset + length) / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y));
        const layerLength: number = endLayer - startLayer + 1;
        // Copy data from buffer manager to GPUBuffer
        this.device.queue.writeTexture(
            { texture: this._gpuTexture, origin: { x: 0, y: 0, z: startLayer }},
            this.bufferManager.bufferView, 
            { offset: startLayerByteOffset },
            { width: TEXTURE_SIZE_2D.x, height: TEXTURE_SIZE_2D.y, depthOrArrayLayers: layerLength }
        );
    }

    destroy = () => {
        // Destroy GPUBuffer
        this._gpuTexture.destroy();
        // Release GPUBuffer from BufferManager
        this.bufferManager.releaseGPUBuffer();
    }
}