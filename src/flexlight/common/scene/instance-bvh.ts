"use strict";

import { BVH, BVHLeaf, BVHNode, Bounding } from "./bvh";
import { Vector, matrix_vector_mul, vector_add, vector_scale } from "../lib/math";
import { Instance } from "./instance";
import { Transform } from "./transform";

const BVH_MAX_LEAVES_PER_NODE = 4;

export class IndexedInstance {
    instance: Instance;
    bounding: Bounding;
    id: number;

    constructor(instance: Instance, bounding: Bounding, id: number) {
        this.instance = instance;
        this.bounding = bounding;
        this.id = id;
    }
}

// Indexed Instance BVH class for constructing dynamic BVHs for instances
export class IndexedInstanceBVH extends BVH<IndexedInstance> {
    constructor(instances: Array<IndexedInstance>) {
        super(IndexedInstanceBVH.subdivideTree(instances));
    }

    private static isInstanceInBounding(instance: IndexedInstance, bound: Bounding): boolean {
        return super.isVertexInBounding(instance.bounding.min, bound) && super.isVertexInBounding(instance.bounding.max, bound);
    }

    private static tightenBoundingInstances(instances: Array<IndexedInstance>): Bounding {
        let vertices: Array<Vector<3>> = [];
        for (let instance of instances) vertices.push(instance.bounding.min, instance.bounding.max);
        // Construct bounding
        let bounding: Bounding = { min: new Vector(Infinity, Infinity, Infinity), max: new Vector(-Infinity, -Infinity, -Infinity) };
        // Iterate over vertices, tightening bounding
        for (let vertex of vertices) {
            bounding.min.x = Math.min(bounding.min.x, vertex.x);
            bounding.min.y = Math.min(bounding.min.y, vertex.y);
            bounding.min.z = Math.min(bounding.min.z, vertex.z);
            bounding.max.x = Math.max(bounding.max.x, vertex.x);
            bounding.max.y = Math.max(bounding.max.y, vertex.y);
            bounding.max.z = Math.max(bounding.max.z, vertex.z);
        }
        return bounding;
    }

    private static fillFlatTree(instances: Array<IndexedInstance>, startingId: number): BVHNode<IndexedInstance> | BVHLeaf<IndexedInstance> {
        // Tighten bounding
        const bounding = IndexedInstanceBVH.tightenBoundingInstances(instances);
        // Base case: if there are less than 4 instances, return a leaf
        if (instances.length <= BVH_MAX_LEAVES_PER_NODE) return new BVHLeaf(instances, bounding, startingId, startingId + 1);

        const oneFourthCeil: number = Math.ceil(instances.length / 4);

        const children: Array<BVHNode<IndexedInstance> | BVHLeaf<IndexedInstance>> = [];
        // Assign ids to children
        let nextId = startingId + 1;
        for (let i = 0; i < instances.length; i += oneFourthCeil) {
            const childInstances = instances.slice(i, Math.min(i + oneFourthCeil, instances.length));
            const child = IndexedInstanceBVH.fillFlatTree(childInstances, nextId);
            children.push(child);
            nextId = child.nextId;
        }

        return new BVHNode(children, bounding, startingId, nextId);
    }

    private static evaluateSplitCost(instances: Array<IndexedInstance>, bounding: Bounding, center: Vector<3>, axis: "x" | "y" | "z"): number {
        // Calculate new corner points that are not part of bounding
        const bounding0Max = new Vector(bounding.max);
        const bounding1Min = new Vector(bounding.min);
        bounding0Max[axis] = center[axis];
        bounding1Min[axis] = center[axis];
        // Define two bounding volumes
        const bounding0 = { min: bounding.min, max: bounding0Max };
        const bounding1 = { min: bounding1Min, max: bounding.max };

        // Calculate the number of instances that are in both bounding volumes
        let instancesIn0 = 0;
        let instancesIn1 = 0;
        let instancesOnCutoff = 0;
        for (let instance of instances) {
            const in0 = IndexedInstanceBVH.isInstanceInBounding(instance, bounding0);
            const in1 = IndexedInstanceBVH.isInstanceInBounding(instance, bounding1);
            if (in0 && !in1) instancesIn0++;
            else if (!in0 && in1) instancesIn1++;
            else instancesOnCutoff++;
        }

        const instanceCount = instances.length;
        // If one box contains all instances, the cost is Infinity as no subdivision is happening
        if (instancesIn0 === instanceCount || instancesIn1 === instanceCount || instancesOnCutoff === instanceCount) return Infinity;
        // Minimize for minimum instances on cutoff and equal distribution of instances across bounding0 and bounding1
        return instancesOnCutoff + Math.abs(instancesIn0 - instancesIn1);
    }

    private static subdivideTree(instances: Array<IndexedInstance>, maxDepth: number = Infinity, depth: number = 0, startingId: number = 0): BVHNode<IndexedInstance> | BVHLeaf<IndexedInstance> {
        // Tighten bounding
        const bounding = IndexedInstanceBVH.tightenBoundingInstances(instances);
        // Base case: if there are less than 4 instances, return a leaf
        if (instances.length <= BVH_MAX_LEAVES_PER_NODE || depth > maxDepth) return new BVHLeaf(instances, bounding, startingId, startingId + 1);

        // Split bounding into two sub bounding volumes along the axis minimizing the cost of instance split
        const centerOfMass = vector_scale(vector_add(bounding.min, bounding.max), 0.5);

        let splitAlongAxis: "x" | "y" | "z" = "x";
        let minCost: number = Infinity;
        for (let axis of ["x", "y", "z"] as Array<"x" | "y" | "z">) {
            const cost = IndexedInstanceBVH.evaluateSplitCost(instances, bounding, centerOfMass, axis);
            if (cost < minCost) {
                minCost = cost;
                splitAlongAxis = axis;
            }
        }

        // If no subdivision is happening, return flat tree to avoid infinite recursion
        if (minCost === Infinity) {
            console.warn("No spatial subdivision possible for", instances.length, "instances.");
            return IndexedInstanceBVH.fillFlatTree(instances, startingId);
        }

        const bounding0Max = new Vector(bounding.max);
        const bounding1Min = new Vector(bounding.min);
        bounding0Max[splitAlongAxis] = centerOfMass[splitAlongAxis];
        bounding1Min[splitAlongAxis] = centerOfMass[splitAlongAxis];

        const bounding0 = { min: bounding.min, max: bounding0Max };
        const bounding1 = { min: bounding1Min, max: bounding.max };

        // Sort instances into bounding volumes
        const instancesOnCutoff: Array<IndexedInstance> = [];
        const instancesInBound0: Array<IndexedInstance> = [];
        const instancesInBound1: Array<IndexedInstance> = [];

        for (let instance of instances) {
            const in0 = IndexedInstanceBVH.isInstanceInBounding(instance, bounding0);
            const in1 = IndexedInstanceBVH.isInstanceInBounding(instance, bounding1);
            if (in0 && in1) instancesOnCutoff.push(instance);
            else if (in0) instancesInBound0.push(instance);
            else instancesInBound1.push(instance);
        }

        let children: Array<BVHNode<IndexedInstance> | BVHLeaf<IndexedInstance>> = [];
        // Assign ids to children
        let nextId = startingId + 1;
        // Recursively subdivide bounding volumes if respective bounding volumes contain instances
        if (instancesInBound0.length > 0) {
            const child = IndexedInstanceBVH.subdivideTree(instancesInBound0, maxDepth, depth + 1, nextId);
            children.push(child);
            nextId = child.nextId;
        }

        if (instancesOnCutoff.length > 0) {
            const child = IndexedInstanceBVH.subdivideTree(instancesOnCutoff, maxDepth, depth + 1, nextId);
            children.push(child);
            nextId = child.nextId;
        }

        if (instancesInBound1.length > 0) {
            const child = IndexedInstanceBVH.subdivideTree(instancesInBound1, maxDepth, depth + 1, nextId);
            children.push(child);
            nextId = child.nextId;
        }

        return new BVHNode(children, bounding, startingId, nextId);
    }

    static fromInstances(instances: Array<Instance> | Set<Instance>): IndexedInstanceBVH {
        let indexedInstances: Array<IndexedInstance> = [];
        console.log("Instances:", instances);
        let id: number = 0;
        // Iterate over instances, assigning ids and calculate boundings
        for (let instance of instances) {
            const untransformedBounding: Bounding = {
                min: new Vector(instance.prototype.boundingVertices[0]!, instance.prototype.boundingVertices[1]!, instance.prototype.boundingVertices[2]!),
                max: new Vector(instance.prototype.boundingVertices[3]!, instance.prototype.boundingVertices[4]!, instance.prototype.boundingVertices[5]!)
            };
            console.log("Untransformed bounding:", untransformedBounding);
            // Get all corners of bounding volume
            const corners: Array<Vector<3>> = [
                new Vector(untransformedBounding.min.x, untransformedBounding.min.y, untransformedBounding.min.z),
                new Vector(untransformedBounding.min.x, untransformedBounding.min.y, untransformedBounding.max.z),
                new Vector(untransformedBounding.min.x, untransformedBounding.max.y, untransformedBounding.min.z),
                new Vector(untransformedBounding.min.x, untransformedBounding.max.y, untransformedBounding.max.z),
                new Vector(untransformedBounding.max.x, untransformedBounding.min.y, untransformedBounding.min.z),
                new Vector(untransformedBounding.max.x, untransformedBounding.min.y, untransformedBounding.max.z),
                new Vector(untransformedBounding.max.x, untransformedBounding.max.y, untransformedBounding.min.z),
                new Vector(untransformedBounding.max.x, untransformedBounding.max.y, untransformedBounding.max.z)
            ];

            // Get transform
            const transform: Transform = instance.transform ?? Transform.DEFAULT_TRANSFORM;
            const transformedBounding: Bounding = { min: new Vector(Infinity, Infinity, Infinity), max: new Vector(-Infinity, -Infinity, -Infinity) };
            // Transform all corners
            for (let corner of corners) {
                const transformedCorner = vector_add(matrix_vector_mul(transform.matrix, corner), transform.position);
                transformedBounding.min.x = Math.min(transformedBounding.min.x, transformedCorner.x);
                transformedBounding.min.y = Math.min(transformedBounding.min.y, transformedCorner.y);
                transformedBounding.min.z = Math.min(transformedBounding.min.z, transformedCorner.z);
                transformedBounding.max.x = Math.max(transformedBounding.max.x, transformedCorner.x);
                transformedBounding.max.y = Math.max(transformedBounding.max.y, transformedCorner.y);
                transformedBounding.max.z = Math.max(transformedBounding.max.z, transformedCorner.z);
            }
            // Push indexed instance
            indexedInstances.push(new IndexedInstance(instance, transformedBounding, id ++));
        }
        // Return indexed instance BVH
        return new IndexedInstanceBVH(indexedInstances);
    }
}