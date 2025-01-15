"use strict";

import { BVHArrays } from "./bvh.js";
import { IndexedInstanceBVH } from "./instance-bvh.js";
import { BufferManager } from "../buffer/buffer-manager.js";
import { Instance } from "./instance.js";
import { PointLight } from "./point-light.js";
import { POW32M1, Vector } from "../lib/math.js";

export class Scene {
    // Triangle Offset, Vertex Offset, BVH Offset, Bounding Vertex Offset, Normal Offset, UV Offset, Transform Offset, Material Offset,
    // Normal Texture Offset, Albedo Texture Offset, Emissive Texture Offset, Roughness Texture Offset, Metallic Texture Offset
    // Global Triangle Offset
    private _instanceManager: BufferManager<Uint32Array>;
    get instanceManager () { return this._instanceManager; }
    // BVH structure: 0|1 BV BV B|I B|I B|I B|I
    private _instanceBVHManager: BufferManager<Uint32Array>;
    get instanceBVHManager () { return this._instanceBVHManager; }
    // Bounding vertices: Bx By Bz
    private _instanceBoundingVertexManager: BufferManager<Float32Array>;
    get instanceBoundingVertexManager () { return this._instanceBoundingVertexManager; }
    // Px Py Pz, intensity, variance
    private _pointLightManager: BufferManager<Float32Array>;
    get pointLightManager () { return this._pointLightManager; }
    
    private readonly instances: Set<Instance> = new Set();

    ambientLight: Vector<3> = new Vector(0.2, 0.2, 0.2);
    private readonly pointLights: Set<PointLight> = new Set();

    constructor(instances: Array<Instance> = []) {
        for (const instance of instances) this.instances.add(instance);
        this._instanceManager = new BufferManager(Uint32Array);
        this._instanceBVHManager = new BufferManager(Uint32Array);
        this._instanceBoundingVertexManager = new BufferManager(Float32Array);
        this._pointLightManager = new BufferManager(Float32Array);
    }

    updateBuffers = (): number => {
        // Bound GPU buffers are kept up to date in overwriteAll() calls on GPUBufferManagers
        // Construct instance buffer, instance bounding vertex buffer, instance BVH buffer
        const instanceArray: Array<number> = [];
        // Keep track of global vertex offset
        let globalTriangleCount: number = 0;
        // Construct instance buffer
        for (let instance of this.instances) {
            instanceArray.push(
                // Prototype buffer references
                instance.prototype.triangles.offset,
                instance.prototype.bvh.offset, instance.prototype.boundingVertices.offset,
                // Transform buffer and material buffer references
                instance.transform?.transformArray.offset ?? 0, instance.material?.materialArray.offset ?? 0,
                // Texture buffer references
                instance.normal?.textureInstanceBuffer?.offset ?? POW32M1, instance.albedo?.textureInstanceBuffer?.offset ?? POW32M1, instance.emissive?.textureInstanceBuffer?.offset ?? POW32M1,
                instance.roughness?.textureInstanceBuffer?.offset ?? POW32M1, instance.metallic?.textureInstanceBuffer?.offset ?? POW32M1,
                globalTriangleCount
            );
            // Increment global vertex offset by instance vertex count
            globalTriangleCount += instance.prototype.triangles.length;
        }
        // Allocate instance buffer
        this._instanceManager.overwriteAll(instanceArray);


        // Generate BVH
        const bvh: IndexedInstanceBVH = IndexedInstanceBVH.fromInstances(this.instances);
        // Generate bounding vertices and BVH structure
        const bvhArrays: BVHArrays = bvh.toArrays();
        // Allocate BVH buffers
        this._instanceBVHManager.overwriteAll(bvhArrays.bvh);
        this._instanceBoundingVertexManager.overwriteAll(bvhArrays.boundingVertices);


        // Construct point light buffer
        const pointLightArray: Array<number> = [];
        for (let pointLight of this.pointLights) pointLightArray.push(
            pointLight.position.x, pointLight.position.y, pointLight.position.z,
            pointLight.color.x, pointLight.color.y, pointLight.color.z,
            pointLight.intensity, pointLight.variance
        );
        // Allocate point light buffer
        this._pointLightManager.overwriteAll(pointLightArray);
        // Return total vertex offset divided by 3 to obtain total vertex count
        return globalTriangleCount;
    }

    // Add instance to scene
    addInstance(instance: Instance) {
        this.instances.add(instance);
    }

    // Remove instance from scene
    removeInstance(instance: Instance) {
        this.instances.delete(instance);
    }

    // Add point light to scene
    addPointLight(pointLight: PointLight) {
        this.pointLights.add(pointLight);
    }

    // Remove point light from scene
    removePointLight(pointLight: PointLight) {
        this.pointLights.delete(pointLight);
    }
}