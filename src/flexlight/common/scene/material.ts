"use strict";

import { BufferManager } from "../buffer/buffer-manager";
import { TypedArrayView } from "../buffer/typed-array-view";
import { Vector } from "../lib/math";


export class Material {
    // ColorR, ColorG, ColorB, EmissiveR, EmissiveG, EmissiveB, Roughness, Metallic, Transmission, IOR
    private static _materialManager = new BufferManager(Float32Array);
    static get materialManager() { return this._materialManager; }

    static readonly DEFAULT_MATERIAL: Material = new Material();
    readonly materialArray: TypedArrayView<Float32Array>;

    constructor(color: Vector<3> = new Vector<3>(255, 255, 255), emissive: Vector<3> = new Vector<3>(0, 0, 0), roughness: number = 0.5, metallic: number = 0, transmission: number = 0, ior: number = 1.5) {
        this.materialArray = Material._materialManager.allocateArray([color.x, color.y, color.z, emissive.x, emissive.y, emissive.z, roughness, metallic, transmission, ior]);
    }

    destroy(): void {
        Material._materialManager.freeArray(this.materialArray);
    }

    set color(color: Vector<3>) {
        this.materialArray[0] = color.x;
        this.materialArray[1] = color.y;
        this.materialArray[2] = color.z;
    }

    get color(): Vector<3> {
        return new Vector<3>(this.materialArray[0] ?? 255, this.materialArray[1] ?? 255, this.materialArray[2] ?? 255);
    }

    set emissive(emissive: Vector<3>) {
        this.materialArray[3] = emissive.x;
        this.materialArray[4] = emissive.y;
        this.materialArray[5] = emissive.z;
    }

    get emissive(): Vector<3> {
        return new Vector<3>(this.materialArray[3] ?? 0, this.materialArray[4] ?? 0, this.materialArray[5] ?? 0);
    }

    set roughness(roughness: number) {
        this.materialArray[6] = roughness;
    }

    get roughness(): number {
        return this.materialArray[6] ?? 0.5;
    }

    set metallic(metallic: number) {
        this.materialArray[7] = metallic;
    }

    get metallic(): number {
        return this.materialArray[7] ?? 0;
    }

    set transmission(transmission: number) {
        this.materialArray[8] = transmission;
    }

    get transmission(): number {
        return this.materialArray[8] ?? 0;
    }

    set ior(ior: number) {
        this.materialArray[9] = ior;
    }

    get ior(): number {
        return this.materialArray[9] ?? 1.5;
    }
}