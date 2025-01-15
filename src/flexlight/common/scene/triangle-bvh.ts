"use strict";

import { BVH, BVHLeaf, BVHNode, Bounding } from "./bvh";
import { Vector, vector_add, vector_scale } from "../lib/math";
import { TRIANGLE_LENGTH } from "./prototype";


const BVH_MAX_LEAVES_PER_NODE = 4;

export class Triangle {
    a: Vector<3>;
    b: Vector<3>;
    c: Vector<3>;
    id: number;

    constructor(a: Vector<3>, b: Vector<3>, c: Vector<3>, id: number) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.id = id;
    }

    *[Symbol.iterator]() {
        yield this.a;
        yield this.b;
        yield this.c;
    }
}

// Triangle BVH class for constructing static BVHs for triangle meshes
export class TriangleBVH extends BVH<Triangle> {
    constructor(triangles: Array<Triangle>) {
        const root = TriangleBVH.subdivideTree(triangles);
        console.log(root);
        super(root);
    }

    private static isTriangleInBounding(triangle: Triangle, bound: Bounding): boolean {
        return super.isVertexInBounding(triangle.a, bound) && super.isVertexInBounding(triangle.b, bound) && super.isVertexInBounding(triangle.c, bound);
    }

    private static tightenBounding(triangles: Array<Triangle>): Bounding {
        let bounding: Bounding = { min: new Vector(Infinity, Infinity, Infinity), max: new Vector(-Infinity, -Infinity, -Infinity) };
        for (let triangle of triangles) {
            for (let vertex of triangle) {
                bounding.min.x = Math.min(bounding.min.x, vertex.x);
                bounding.min.y = Math.min(bounding.min.y, vertex.y);
                bounding.min.z = Math.min(bounding.min.z, vertex.z);
                bounding.max.x = Math.max(bounding.max.x, vertex.x);
                bounding.max.y = Math.max(bounding.max.y, vertex.y);
                bounding.max.z = Math.max(bounding.max.z, vertex.z);
            }
        }
        return bounding;
    }

    private static fillFlatTree(triangles: Array<Triangle>, startingId: number): BVHNode<Triangle> | BVHLeaf<Triangle> {
        // Tighten bounding
        const bounding = TriangleBVH.tightenBounding(triangles);
        // Base case: if there are less than 4 triangles, return a leaf
        if (triangles.length <= BVH_MAX_LEAVES_PER_NODE) return new BVHLeaf(triangles, bounding, startingId, startingId + 1);

        const oneThirdCeil: number = Math.ceil(triangles.length / 3);

        const children: Array<BVHNode<Triangle> | BVHLeaf<Triangle>> = [];
        // Assign ids to children
        let nextId = startingId + 1;
        for (let i = 0; i < triangles.length; i += oneThirdCeil) {
            const childTriangles = triangles.slice(i, Math.min(i + oneThirdCeil, triangles.length));
            const child = TriangleBVH.fillFlatTree(childTriangles, nextId);
            children.push(child);
            nextId = child.nextId;
        }

        return new BVHNode(children, bounding, startingId, nextId);
    }


    private static evaluateSplitCost(triangles: Array<Triangle>, bounding: Bounding, center: Vector<3>, axis: "x" | "y" | "z"): number {
        // Calculate new corner points that are not part of bounding
        const bounding0Max = new Vector(bounding.max);
        const bounding1Min = new Vector(bounding.min);
        bounding0Max[axis] = center[axis];
        bounding1Min[axis] = center[axis];
        // Define two bounding volumes
        const bounding0 = { min: bounding.min, max: bounding0Max };
        const bounding1 = { min: bounding1Min, max: bounding.max };

        // Calculate the number of triangles that are in both bounding volumes
        let trianglesIn0 = 0;
        let trianglesIn1 = 0;
        let trianglesOnCutoff = 0;
        for (let triangle of triangles) {
            const in0 = TriangleBVH.isTriangleInBounding(triangle, bounding0);
            const in1 = TriangleBVH.isTriangleInBounding(triangle, bounding1);
            if (in0 && !in1) trianglesIn0++;
            else if (!in0 && in1) trianglesIn1++;
            else trianglesOnCutoff++;
        }

        const triangleCount = triangles.length;
        // If one box contains all triangles, the cost is Infinity as no subdivision is happening.
        if (trianglesIn0 === triangleCount || trianglesIn1 === triangleCount || trianglesOnCutoff === triangleCount) return Infinity;
        // Minimize for minimum triangles on cutoff and equal distribution of triangles across bounding0 and bounding1.
        return trianglesOnCutoff + Math.abs(trianglesIn0 - trianglesIn1);
    }

    private static subdivideTree(triangles: Array<Triangle>, maxDepth: number = Infinity, depth: number = 0, startingId: number = 0): BVHNode<Triangle> | BVHLeaf<Triangle> {
        // Tighten bounding
        const bounding = TriangleBVH.tightenBounding(triangles);
        // Base case: if there are less than 4 triangles, return a leaf
        if (triangles.length <= BVH_MAX_LEAVES_PER_NODE || depth > maxDepth) return new BVHLeaf(triangles, bounding, startingId, startingId + 1);

        // Split bounding into two sub bounding volumes along the axis minimizing the cost of triangle split
        let vertexSum: Vector<3> = new Vector(0, 0, 0);
        for (let triangle of triangles) for (let vertex of triangle) {
            vertexSum = vector_add(vertexSum, vertex);
        }
        
        const centerOfMass = vector_scale(vector_add(bounding.min, bounding.max), 0.5); //vector_scale(vertexSum, 1 / (triangles.length * 3));

        let splitAlongAxis: "x" | "y" | "z" = "x";
        let minCost: number = Infinity;
        for (let axis of ["x", "y", "z"] as Array<"x" | "y" | "z">) {
            const cost = TriangleBVH.evaluateSplitCost(triangles, bounding, centerOfMass, axis);
            // console.log(cost);
            if (cost < minCost) {
                minCost = cost;
                splitAlongAxis = axis;
            }
        }
        // If no subdivision is happening, return flat tree to avoid infinite recursion and unnecessary 
        if (minCost === Infinity) {
            console.warn("No spacial subdivision possible for", triangles.length, "triangles.");
            const flatTree = TriangleBVH.fillFlatTree(triangles, startingId);
            console.log(flatTree);
            return flatTree;
        }

        const bounding0Max = new Vector(bounding.max);
        const bounding1Min = new Vector(bounding.min);
        bounding0Max[splitAlongAxis] = centerOfMass[splitAlongAxis];
        bounding1Min[splitAlongAxis] = centerOfMass[splitAlongAxis];

        const bounding0 = { min: bounding.min, max: bounding0Max };
        const bounding1 = { min: bounding1Min, max: bounding.max };

        // Sort triangles into bounding volumes
        const trianglesOnCutoff = [];
        const trianglesInBound0 = [];
        const trianglesInBound1 = [];

        for (let triangle of triangles) {
            const in0 = TriangleBVH.isTriangleInBounding(triangle, bounding0);
            const in1 = TriangleBVH.isTriangleInBounding(triangle, bounding1);
            // Triangle is solely in bounding0
            if (in0 && !in1) trianglesInBound0.push(triangle);
            // Triangle is solely in bounding1
            else if (!in0 && in1) trianglesInBound1.push(triangle);
            // Triangle is neither fully in bounding0 nor bounding1
            else trianglesOnCutoff.push(triangle);
        }

        let children: Array<BVHNode<Triangle> | BVHLeaf<Triangle>> = [];
        // Assign ids to children
        let nextId = startingId + 1;
        // Recursively subdivide bounding volumes if respective bounding volumes contain triangles
        if (trianglesInBound0.length > 0) {
            const child = TriangleBVH.subdivideTree(trianglesInBound0, maxDepth, depth + 1, nextId);
            children.push(child);
            nextId = child.nextId;
        }

        if (trianglesOnCutoff.length > 0) {
            const child = TriangleBVH.subdivideTree(trianglesOnCutoff, maxDepth, depth + 1, nextId);
            children.push(child);
            nextId = child.nextId;
        }

        if (trianglesInBound1.length > 0) {
            const child = TriangleBVH.subdivideTree(trianglesInBound1, maxDepth, depth + 1, nextId);
            children.push(child);
            nextId = child.nextId;
        }

        return new BVHNode<Triangle>(children, bounding, startingId, nextId);
    }

    static fromPrototypeArray(prototypeArray: Array<number>): TriangleBVH {
        let triangles: Array<Triangle> = [];
        // Iterate over triangles in format V V V N N N UV UV UV
        for (let i = 0; i < prototypeArray.length; i += TRIANGLE_LENGTH) {
            triangles.push(new Triangle(
                new Vector(
                    prototypeArray[i]!,
                    prototypeArray[i + 1]!,
                    prototypeArray[i + 2]!
                ),
                new Vector(
                    prototypeArray[i + 3]!,
                    prototypeArray[i + 4]!,
                    prototypeArray[i + 5]!
                ),
                new Vector(
                    prototypeArray[i + 6]!,
                    prototypeArray[i + 7]!,
                    prototypeArray[i + 8]!
                ),
                i / TRIANGLE_LENGTH
            ));
        }
        // Subdivide tree
        return new TriangleBVH(triangles);
    }
}