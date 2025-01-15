"use strict";

import { BufferManager } from "../buffer/buffer-manager";
import { TypedArrayView } from "../buffer/typed-array-view";

type Channels = 1 | 2 | 3 | 4;

export class Texture {
    readonly texture: HTMLImageElement;
    readonly width: number;
    readonly height: number;

    // Save texture type properties
    private static instances: Set<Texture> = new Set();
    // Width, height, channels, dataOffset
    private static _textureInstanceBufferManager: BufferManager<Uint32Array> = new BufferManager(Uint32Array);
    static get textureInstanceBufferManager () { return Texture._textureInstanceBufferManager; }
    // Texture data buffer
    private static _textureDataBufferManager: BufferManager<Uint8Array> = new BufferManager(Uint8Array);
    static get textureDataBufferManager () { return Texture._textureDataBufferManager; }

    private textureDataBuffer: TypedArrayView<Uint8Array> | undefined;
    private _textureInstanceBuffer: TypedArrayView<Uint32Array> | undefined;
    get textureInstanceBuffer () { return this._textureInstanceBuffer; }

    private static async getTextureData(texture: HTMLImageElement, width: number, height: number, channels: Channels): Promise<Uint8Array> {
        // Create canvas, draw image and return bitmap
        const canvas = document.createElement("canvas");
        const ctx: CanvasRenderingContext2D | null = canvas.getContext("2d"); 
        if (!ctx) throw new Error("Failed to get canvas context");
        canvas.width = width;
        canvas.height = height;
        // Disable image smoothing to get non-blury pixel values in given resolution
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(texture, 0, 0, width, height);
        // Read pixels from canvas
        const imageData = ctx.getImageData(0, 0, width, height);
        // Construct array of pixel values
        const array: Array<number> = [];
        for (let i = 0; i < imageData.data.length; i += 4) for (let j = 0; j < channels; j++) array.push(imageData.data[i + j]!);
        // Return as Uint8Array view.
        return new Uint8Array(array);
    }

    constructor (channels: Channels, texture: HTMLImageElement, width: number | undefined = undefined, height: number | undefined = undefined) {
        this.texture = texture;
        this.width = width ?? texture.width;
        this.height = height ?? texture.height;
        // Get texture data
        Texture.getTextureData(texture, this.width, this.height, channels).then((array: Uint8Array) => {
            this.textureDataBuffer = Texture.textureDataBufferManager.allocateArray(array);
            this._textureInstanceBuffer = Texture.textureInstanceBufferManager.allocateArray(new Uint32Array([this.width, this.height, channels, this.textureDataBuffer.offset]));
        });

        Texture.instances.add(this);
    }

    destroy() {
        // Remove texture instance from texture type instances
        Texture.instances.delete(this);
        // Substract length of this texture from all saved offsets of textures after this one
        for (let instance of Texture.instances) {
            if (instance.textureInstanceBuffer && this._textureInstanceBuffer && instance.textureInstanceBuffer.offset > this._textureInstanceBuffer.offset) {
                instance.textureInstanceBuffer[3]! -= this._textureInstanceBuffer.length;   
            }
        }
        // Free buffers if they exist
        if (this.textureDataBuffer) Texture.textureDataBufferManager.freeArray(this.textureDataBuffer);
        if (this._textureInstanceBuffer) Texture.textureInstanceBufferManager.freeArray(this._textureInstanceBuffer);
    }
}


export class NormalTexture extends Texture {
    constructor(texture: HTMLImageElement, width: number, height: number) {
        super(3, texture, width, height);
    }
}

export class AlbedoTexture extends Texture {
    constructor(texture: HTMLImageElement, width: number, height: number) {
        super(3, texture, width, height);
    }
}

export class EmissiveTexture extends Texture {
    constructor(texture: HTMLImageElement, width: number, height: number) {
        super(3, texture, width, height);
    }
}

export class RoughnessTexture extends Texture {
    constructor(texture: HTMLImageElement, width: number, height: number) {
        super(1, texture, width, height);
    }
}

export class MetallicTexture extends Texture {
    constructor(texture: HTMLImageElement, width: number, height: number) {
        super(1, texture, width, height);
    }
}

export class HeightTexture extends Texture {    
    constructor(texture: HTMLImageElement, width: number, height: number) {
        super(1, texture, width, height);
    }
}