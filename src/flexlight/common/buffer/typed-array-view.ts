"use strict";

export type TypedArray = Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array | Int32Array | Float32Array | Float64Array;

export interface Constructor<T extends TypedArray> {
    new (buffer: ArrayBuffer, byteOffset: number, length: number): T;
}

type StringTag<T extends TypedArray> = 
    T extends Uint8Array ? "Uint8Array" :
    T extends Uint16Array ? "Uint16Array" :
    T extends Uint32Array ? "Uint32Array" :
    T extends Int8Array ? "Int8Array" :
    T extends Int16Array ? "Int16Array" :
    T extends Int32Array ? "Int32Array" :
    T extends Float32Array ? "Float32Array" :
    T extends Float64Array ? "Float64Array" : never;

// Reimplementation to allow Views to implement typed arrays
export class TypedArrayView<T extends TypedArray> {
    private readonly TypedArrayConstructor: Constructor<T>;
    private readonly stringTag: StringTag<T>;

    readonly BYTES_PER_ELEMENT: number;
    readonly buffer: ArrayBuffer;
    private arrayView: T;
    // Add offset as custom property
    offset: number;

    length: number;
    byteOffset: number;
    byteLength: number;
    // Array methods
    get every() { return this.arrayView.every; }
    get filter() { return this.arrayView.filter; }
    get find() { return this.arrayView.find; }
    get findIndex() { return this.arrayView.findIndex; }
    get forEach() { return this.arrayView.forEach; }
    get includes() { return this.arrayView.includes; }
    get indexOf() { return this.arrayView.indexOf; }
    get join() { return this.arrayView.join; }
    get lastIndexOf() { return this.arrayView.lastIndexOf; }
    get map() { return this.arrayView.map; }
    get reduce() { return this.arrayView.reduce; }
    get reduceRight() { return this.arrayView.reduceRight; }
    get set() { return this.arrayView.set; }
    get slice() { return this.arrayView.slice; }
    get some() { return this.arrayView.some; }
    get subarray() { return this.arrayView.subarray; }
    get toLocaleString() { return this.arrayView.toLocaleString; }
    get toString() { return this.arrayView.toString; }
    get values() { return this.arrayView.values; }

    get entries() { return this.arrayView.entries; }
    get keys() { return this.arrayView.keys; }

    [n: number]: number;  // Add numeric index signature
    
    constructor(buffer: ArrayBuffer, byteOffset: number, length: number, TypedArrayConstructor: Constructor<T>) {
        this.TypedArrayConstructor = TypedArrayConstructor;
        // Set array view
        const arrayView: T = new TypedArrayConstructor(buffer, byteOffset, length);
        this.stringTag = arrayView[Symbol.toStringTag] as StringTag<T>;
        // Set string tag
        this.BYTES_PER_ELEMENT = arrayView.BYTES_PER_ELEMENT;
        // Set buffer properties
        this.buffer = buffer;
        this.arrayView = arrayView;
        // Set array properties
        this.offset = byteOffset / arrayView.BYTES_PER_ELEMENT;
        this.length = arrayView.length;
        this.byteOffset = arrayView.byteOffset;
        this.byteLength = arrayView.byteLength;
    }

    private setArrayView(arrayView: T) {
        this.arrayView = arrayView;

        this.offset = arrayView.byteOffset / arrayView.BYTES_PER_ELEMENT;
        this.byteOffset = arrayView.byteOffset;
        this.length = arrayView.length;
        this.byteLength = arrayView.byteLength;
    }

    // Custom methods
    shift (byteOffset: number, length: number) {
        this.setArrayView(new this.TypedArrayConstructor(this.buffer, byteOffset, length));
    }

    // Reimplementation of certain array methods
    valueOf(): T {
        return this.arrayView;
    }

    copyWithin(target: number, start: number, end?: number): this {
        this.arrayView.copyWithin(target, start, end);
        return this;
    }
    
    reverse(): this {
        this.arrayView.reverse();
        return this;
    }

    fill(value: number, start?: number, end?: number): this {
        this.arrayView.fill(value, start, end);
        return this;
    }

    sort(compareFn?: (a: number, b: number) => number): this {
        this.arrayView.sort(compareFn);
        return this;
    }

    *[Symbol.iterator](): IterableIterator<number> {
        // Iterate over elements
        for (let i = 0; i < this.length; i++) yield this.arrayView[i]!;
    }

    get [Symbol.toStringTag]() {
        return this.stringTag;
    }
}

