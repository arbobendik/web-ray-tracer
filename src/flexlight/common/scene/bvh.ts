"use strict";

import { Triangle } from "./triangle-bvh";
import { IndexedInstance } from "./instance-bvh";
import { BIAS, POW32M1, Vector, vector_difference } from "../lib/math";


export interface Bounding {
    min: Vector<3>;
    max: Vector<3>;
}

export class BVHLeaf<T extends Triangle | IndexedInstance> {
    children: Array<T>;
    bounding: Bounding;
    id: number;
    nextId: number;
    
    constructor(children: Array<T>, bounding: Bounding, id: number, nextId: number) {
        this.children = children;
        this.bounding = bounding;
        this.id = id;
        this.nextId = nextId;
    }

    *[Symbol.iterator]() {
        for (let child of this.children) {
            yield child;
        }
    }
}

export class BVHNode<T extends Triangle | IndexedInstance> {
    children: Array<BVHNode<T> | BVHLeaf<T>>;
    bounding: Bounding;
    id: number;
    nextId: number;

    constructor(children: Array<BVHNode<T> | BVHLeaf<T>>, bounding: Bounding, id: number, nextId: number) {
        this.children = children;
        this.bounding = bounding;
        this.id = id;
        this.nextId = nextId;
    }

    *[Symbol.iterator]() {
        for (let child of this.children) {
            yield child;
        }
    }
}

export interface BVHArrays {
    boundingVertices: Array<number>;
    bvh: Array<number>;
}


export class BVH<T extends Triangle | IndexedInstance> {
    root: BVHNode<T> | BVHLeaf<T>;

    constructor(root: BVHNode<T> | BVHLeaf<T>) {
        this.root = root;
    }

    dfsTraverse(node: BVHNode<T> | BVHLeaf<T>, callbackNode: (node: BVHNode<T>) => void, callbackLeaf: (leaf: BVHLeaf<T>) => void) {
        if (node instanceof BVHLeaf) {
            callbackLeaf(node);
        } else if (node instanceof BVHNode) {
            callbackNode(node);
            for (let child of node.children) this.dfsTraverse(child, callbackNode, callbackLeaf);
        }
    }

    toArrays(): BVHArrays {
        const boundingVertices: Array<number> = [];
        const bvh: Array<number> = [];
        // Traverse tree using depth first search starting from root
        this.dfsTraverse(this.root, 
            (node: BVHNode<T>) => {
                boundingVertices.push(node.bounding.min.x, node.bounding.min.y, node.bounding.min.z, node.bounding.max.x, node.bounding.max.y, node.bounding.max.z);
                bvh.push(1, node.children[0]?.id ?? POW32M1, node.children[1]?.id ?? POW32M1, node.children[2]?.id ?? POW32M1);
            },
            (leaf: BVHLeaf<T>) => {
                bvh.push(0, leaf.children[0]?.id ?? POW32M1, leaf.children[1]?.id ?? POW32M1, leaf.children[2]?.id ?? POW32M1);
            }
        );
        return { boundingVertices, bvh };
    }

    protected static isVertexInBounding(vertex: Vector<3>, bound: Bounding): boolean {
        return bound.min.x - BIAS <= vertex.x && bound.min.y - BIAS <= vertex.y && bound.min.z - BIAS <= vertex.z &&
               bound.max.x + BIAS >= vertex.x && bound.max.y + BIAS >= vertex.y && bound.max.z + BIAS >= vertex.z;
    }

    protected static longestAxis(bounding: Bounding): "x" | "y" | "z" {
        const diff = vector_difference(bounding.max, bounding.min);
        return diff.x > diff.y && diff.x > diff.z ? "x" : diff.y > diff.z ? "y" : "z";
    }
}
