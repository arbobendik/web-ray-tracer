"use strict";

import { Parser } from "./obj-parser";
import { BufferManager } from "../buffer/buffer-manager";
import { TypedArrayView } from "../buffer/typed-array-view";
import { BVHArrays } from "./bvh";
import { TriangleBVH } from "./triangle-bvh";
import { Material } from "./material";

export const TRIANGLE_LENGTH = 9 + 9 + 6;

export class Prototype {
    // Buffer managers

    // Triangle data: V V V N N N UV UV UV
    private static _triangleManager = new BufferManager(Float32Array);
    static get triangleManager () { return this._triangleManager; }
    // BVH structure: 0|1 BV BV B|T B|T B|T
    private static _BVHManager = new BufferManager(Uint32Array)
    static get BVHManager () { return this._BVHManager; }
    // Bounding vertices: Bx By Bz
    private static _boundingVertexManager = new BufferManager(Float32Array);
    static get boundingVertexManager () { return this._boundingVertexManager; }


    // Buffers
    readonly triangles: TypedArrayView<Float32Array>;
    readonly bvh: TypedArrayView<Uint32Array>;
    readonly boundingVertices: TypedArrayView<Float32Array>;

    // Construct using arrays
    constructor(
        triangles: Float32Array | Array<number>,
        bvh: Uint32Array | Array<number>,
        boundingVertices: Float32Array | Array<number>,
    ) {
        this.triangles = Prototype._triangleManager.allocateArray(triangles);
        this.bvh = Prototype._BVHManager.allocateArray(bvh);
        this.boundingVertices = Prototype._boundingVertexManager.allocateArray(boundingVertices);
    }

    // Construct from OBJ file
    static async fromObj(objPath: string, mtlPath: string | undefined = undefined) {
        let materials: Map<string, Material> = new Map();
        if (mtlPath) materials = await Parser.mtl(mtlPath);
        const prototypeArray: Array<number> = await Parser.obj(objPath, materials);
        // TODO: Add bounding vertices and BVH structure
        const bvh: TriangleBVH = TriangleBVH.fromPrototypeArray(prototypeArray);
        const bvhArrays: BVHArrays = bvh.toArrays();
        return new Prototype(prototypeArray, bvhArrays.bvh, bvhArrays.boundingVertices);
    }

    destroy() {
        // Free all buffers
        Prototype._triangleManager.freeArray(this.triangles);
        Prototype._BVHManager.freeArray(this.bvh);
        Prototype._boundingVertexManager.freeArray(this.boundingVertices);
    }
}