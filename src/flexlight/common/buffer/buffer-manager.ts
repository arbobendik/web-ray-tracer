"use strict";

import { TypedArray, Constructor, TypedArrayView } from "./typed-array-view";
import { next_power_of_two } from "../lib/math";
import { BufferToGPU } from "./buffer-to-gpu";

// All @ts-expect-error in this class are used due to typescript not supporting ArrayBuffer.resize() and ArrayBuffer.maxByteLength yet.
// For reference, see: 
//  maxByteLength:  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/maxByteLength
//  resize:         https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/resize

export class BufferManager<T extends TypedArray> {
    private _buffer: ArrayBuffer = new ArrayBuffer(0);
    get buffer(): ArrayBuffer { return this._buffer; }

    private _length: number = 0;
    get length(): number { return this._length; }
    // TypedArrayConstructor for the buffer
    private _viewConstructor: Constructor<T>;
    get viewConstructor(): Constructor<T> { return this._viewConstructor; }
    // Keeps track of all ArrayViews
    private instances: Set<TypedArrayView<T>> = new Set();
    // GPUBufferManager for this buffer
    private _gpuBuffer: BufferToGPU | undefined = undefined;
    get gpuBuffer(): BufferToGPU | undefined { return this._gpuBuffer; }
    constructor(viewConstructor: Constructor<T>) {
        this._viewConstructor = viewConstructor;
    }

    // Create a view of whole buffer
    get bufferView(): T {
        return new this._viewConstructor(this._buffer, 0, this._length);
    }

    private resizeBuffer(byteLength: number) {
        // Test if buffer can be resized or needs to be recreated
        const newBufferMaxByteLength = next_power_of_two(byteLength);
        if (newBufferMaxByteLength > this._buffer.byteLength) {
            // Recreate buffer if maxByteLength is exceeded
            const oldBuffer = this._buffer;
            this._buffer = new ArrayBuffer(newBufferMaxByteLength);
            // Copy data over to new buffer
            new Uint8Array(this._buffer).set(new Uint8Array(oldBuffer));
        }
        //} else {
            // Resize buffer if new length is still within maxByteLength
            // this._buffer.resize(byteLength);
        //}
    }

    allocateArray (array: T | Array<number>): TypedArrayView<T> {
        const BYTES_PER_ELEMENT = this._viewConstructor.prototype.BYTES_PER_ELEMENT;
        // Get array attributes
        const arrayLength: number = array.length;
        const arrayByteLength: number = arrayLength * BYTES_PER_ELEMENT;

        // New offset is old buffer byte length
        const arrayByteOffset: number = this._buffer.byteLength;
        const newBufferMaxByteLength = next_power_of_two(arrayByteOffset + arrayByteLength);
        // Resize buffer
        this.resizeBuffer(newBufferMaxByteLength);
        // Get buffer view
        const bufferView = this.bufferView;
        // Insert array into buffer
        if (array instanceof this._viewConstructor) {
            // Insert array into buffer by copying
            bufferView.set(array, arrayByteOffset / BYTES_PER_ELEMENT);
        } else if (array instanceof Array) {
            // Insert array into buffer iteratively
            let i: number = 0;
            for (let value of array) bufferView[i++] = value;
        } else {
            throw new Error("BufferManager.allocateArray(): Argument is neither a view nor an array");
        }
        // Reconstruct GPUBuffer if it exists due to resize
        if (this._gpuBuffer) this._gpuBuffer.reconstruct();
        
        const typedArrayView = new TypedArrayView<T>(this._buffer, arrayByteOffset, arrayByteLength / BYTES_PER_ELEMENT, this._viewConstructor);
        // Add this buffer to the list of instances
        this.instances.add(typedArrayView);
        // Update length
        this._length = this._length + arrayLength;
        // Construct current buffer view
        return typedArrayView;
    }

    // Remove this buffer from the list of instances
    freeArray (typedArrayView: TypedArrayView<T>) {
        if (!this.instances.has(typedArrayView)) {
            throw new Error("BufferManager.freeArray(): TypedArrayView instance not found");
        }
        // Remove this buffer from the list of instances
        this.instances.delete(typedArrayView);
        // Update length
        this._length = this._length - typedArrayView.length;
        // Get buffer attributes
        const arrayByteOffset = typedArrayView.byteOffset;
        const arrayByteLength = typedArrayView.byteLength;
        const bufferByteLength = this._buffer.byteLength;
        // Shift all memory after this one to the left by byteLength
        const uint8ArrayBufferView = new Uint8Array(this._buffer);
        uint8ArrayBufferView.copyWithin(arrayByteOffset, arrayByteOffset + arrayByteLength, bufferByteLength);
        // Readjust views
        // Shift all instances views to the right of current instance to the left by arrayByteLength
        for (let instance of this.instances) {
            // Check if instance is to the right of current instance and shift if so
            if (instance.byteOffset > arrayByteOffset) instance.shift(instance.byteOffset - arrayByteLength, instance.length);
        }
        // Resize buffer to remove unused space at the end by arrayByteLength
        // this._buffer.resize(bufferByteLength - arrayByteLength);
        // Reconstruct GPUBuffer if it exists due to resize
        if (this._gpuBuffer) this._gpuBuffer.reconstruct();
    }

    // Free all buffers and clear instances set
    freeAll() {
        // this._buffer.resize(0);
        this.instances.clear();
        // Update length
        this._length = 0;
        // Reconstruct GPUBuffer if it exists due to resize
        if (this._gpuBuffer) this._gpuBuffer.reconstruct();
    }

    overwriteAll(array: T | Array<number>) {
        const BYTES_PER_ELEMENT = this._viewConstructor.prototype.BYTES_PER_ELEMENT;
        // Get array attributes
        const arrayLength: number = array.length;
        const arrayByteLength: number = arrayLength * BYTES_PER_ELEMENT;
        // New offset is old buffer byte length
        const bufferByteLength: number = this._buffer.byteLength;
        const newBufferByteLength = arrayByteLength;
        // Resize buffer if new length is unequal to old length
        if (newBufferByteLength !== bufferByteLength) this.resizeBuffer(newBufferByteLength);
        // Copy data over to buffer, we've already ensured the buffer has exactly as much space as we need
        const bufferView = this.bufferView;
        // Insert array into buffer
        if (array instanceof this._viewConstructor) {
            // Insert array into buffer by copying
            bufferView.set(array);
        } else if (array instanceof Array) {
            // Insert array into buffer iteratively
            let i: number = 0;
            for (let value of array) bufferView[i++] = value;
        } else {
            throw new Error("BufferManager.overwriteAll(): Argument is neither a view nor an array");
        }
        // Reconstruct GPUBuffer if it exists due to resize
        if (this._gpuBuffer) this._gpuBuffer.reconstruct();
    }


    bindGPUBuffer(gpuBuffer: BufferToGPU) {
        if (this._gpuBuffer) {
            throw new Error("BufferManager.bindGPUBuffer(): GPUBuffer already bound");
        }
        this._gpuBuffer = gpuBuffer;
    }

    releaseGPUBuffer() {
        this._gpuBuffer = undefined;
    }
}