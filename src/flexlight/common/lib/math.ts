"use strict";
// Create number sequence from 0 to N
type BuildTuple<T, N extends number, R extends T[] = []> = R['length'] extends N ? R : BuildTuple<T, N, [...R, T]>;
// Modified Tuple type to allow array coercion
export type Tuple<T, N extends number> = N extends number ? BuildTuple<T, N> : never;

// Subtract one by removing last element from tuple
type Subtract1<N extends number> = BuildTuple<unknown, N> extends [...infer Rest, unknown] ? Rest['length'] : never;
// Convert type to number
// class Read<N extends number> { readonly value!: N; }

// Helper type to create a tuple of length M*N by concatenating N tuples of length M
/*
type ConcatNTuples<T, M extends number, N extends number, R extends any[] = []> = 
    N extends 0 ? R : 
        ConcatNTuples<T, M, Subtract1<N>, [...R, ...BuildTuple<T, M>]>;
*/
// Multiply two numbers M and N by creating a tuple of length M*N
// type Mul<M extends number, N extends number> = ConcatNTuples<unknown, M, N>['length'];

// Check if a number is greater than another
type GreaterThan<T, N extends number, I extends number> = 
    0 extends I ? T :
        I extends N ? never :
            GreaterThan<T, N, Subtract1<I>> extends never ? never : T;


export const BIAS: number = 1e-10;
export const POW32M1: number = 4294967295;
export const E: number = 2.718281828459045;
export const PI: number = 3.141592653589793;


interface VectorDimensions<N extends number> {
    readonly vector_length: N;
}

interface MatrixDimensions<M extends number, N extends number> {
    readonly matrix_height: M;
    readonly matrix_width: N;
}

export class Vector<N extends number> extends Float32Array {
    // Getters for components
    get x(): GreaterThan<number, N, 0> { 
        if (this.length > 0) return this[0] as GreaterThan<number, N, 0>; 
        else throw new Error('Vector has no x component'); 
    }
    get y(): GreaterThan<number, N, 1> {
        if (this.length > 1) return this[1] as GreaterThan<number, N, 1>;
        else throw new Error('Vector has no y component');
    }
    get z(): GreaterThan<number, N, 2> {
        if (this.length > 2) return this[2] as GreaterThan<number, N, 2>;
        else throw new Error('Vector has no z component');
    }
    get w(): GreaterThan<number, N, 3> { 
        if (this.length > 3) return this[3] as GreaterThan<number, N, 3>;
        else throw new Error('Vector has no w component');
    }
    // Setters for components
    set x(value: GreaterThan<number, N, 0>) { this[0] = value }
    set y(value: GreaterThan<number, N, 1>) { this[1] = value }
    set z(value: GreaterThan<number, N, 2>) { this[2] = value }
    set w(value: GreaterThan<number, N, 3>) { this[3] = value }
    // Constructor for the Vector class
    constructor(... args: Tuple<number, N> | [ VectorDimensions<N> ] | [ Tuple<number, N> ] | [ Vector<N> ]) {

        let all_numbers: boolean = true;
        for (let arg of args) if (typeof arg !== 'number') all_numbers = false;
        
        if (args.length === 1 && !all_numbers)  {
            // Test if first argument is a VectorDimensions object
            if ('vector_length' in args[0]) {
                // Attribute is vector_length
                super(args[0].vector_length);
            } else {
                // Otherwise, initialize vector with tuple
                super(args[0]);
            }
        } else if (all_numbers) {
            // Otherwise, initialize vector with spread tuple
            super(args as Tuple<number, N>);
        } else {
            throw new Error('Invalid arguments for Vector constructor.');
        }
    }

    override *[Symbol.iterator](): IterableIterator<number> {
        for (let i = 0; i < this.length; i++) yield this[i]!;
    }
}

/*
// Vector class with operations
export class Vector<N extends number> extends VectorData<N> {
    constructor(... args: Tuple<number, N> | [ VectorDimensions<N> ] | [ Tuple<number, N> ]) { super(... args) }

    add = (v: Vector<N>): Vector<N> => vector_add(this, v);
    sub = (v: Vector<N>): Vector<N> => vector_subtract(this, v);
    distance = (v: Vector<N>): number => vector_distance(this, v);
    hadamard = (v: Vector<N>): Vector<N> => vector_hadamard(this, v);
    scale = (v: number): Vector<N> => vector_scale(this, v);
    dot = (v: Vector<N>): number => dot(this, v);
    normalize = (): Vector<N> => normalize(this);
    outer = (v: Vector<N>): Matrix<N, N> => outer(this, v);

    cross = (v: Vector<3>): Vector<3> => cross(this, v);
}
*/

export class ZeroVector<N extends number> extends Vector<N> {
    constructor(n: N) {
        super({ vector_length: n });
        for (let i = 0; i < n; i++) this[i] = 0;
    }
}

export class Matrix<M extends number, N extends number> extends Array<Vector<N>> {
    // Type assertion for size attributes, matrix is row major
    height: M;
    width: N;

    get (x: number, y: number): number {
        return this[x]![y]!;
    }

    set (x: number, y: number, value: number): void {
        this[x]![y] = value;
    }

    // Constructor for the Matrix class
    constructor(... rows: Tuple<Vector<N>, M> | Tuple<Tuple<number, N>, M> | [ MatrixDimensions<M, N> ] | [ Matrix<M, N> ]) {
        let all_arrays: boolean = true;
        for (let row of rows) if (!Array.isArray(row)) all_arrays = false;

        if (rows.length === 1 && 'matrix_height' in rows[0] && 'matrix_width' in rows[0]) {
            let dims: MatrixDimensions<M, N> = rows[0];
            // Initialize matrix with zeros
            super(dims.matrix_height);
            // Initialize height and width
            this.height = dims.matrix_height;
            this.width = dims.matrix_width;
            // Initialize row vectors
            for (let i = 0; i < dims.matrix_height; i++) {
                this[i] = new Vector<N>({ vector_length: dims.matrix_width });
            }
        } else if (!all_arrays) {
            // Initialize matrix with given row vector tuple
            super(... rows as Tuple<Vector<N>, M>);
            // Initialize height and width
            this.height = this.length as M;
            this.width = this[0]!.length as N;
        } else if (all_arrays) {
            // Initialize matrix with given number values.
            let vectors = rows.map(row => new Vector<N>(row as Tuple<number, N>));
            super(... vectors);
            // Initialize height and width
            this.height = this.length as M;
            this.width = this[0]!.length as N;
        } else {
            // Invalid number of rows
            throw new Error('Invalid number of rows');
        }
    }

    override *[Symbol.iterator](): IterableIterator<Vector<N>> {
        // Iterate over row vectors
        for (let i = 0; i < this.length; i++) yield this[i]!;
    }
}


export class IdentityMatrix<N extends number> extends Matrix<N, N> {
    constructor(n: N) {
        super({ matrix_height: n, matrix_width: n });
        for (let i = 0; i < n; i++) {
            let row: Vector<N> = this[i]!;
            row[i] = 1;
        }
    }
}

export class ZeroMatrix<M extends number, N extends number> extends Matrix<M, N> {
    constructor(m: M, n: N) {
        super({ matrix_height: m, matrix_width: n });
        for (let i = 0; i < m; i++) this[i] = new ZeroVector(n);
    }
}

export class HouseholderMatrix<N extends number> extends IdentityMatrix<N> {
    constructor(v: Vector<N>) {
        // Create identity matrix
        super(v.length as N);
        // Calculate 2(v⊗v)/(v·v)
        let outer_product: Matrix<N, N> = outer(v, v);
        let scale: number = 2.0 / dot(v, v);
        // H = I - 2(v⊗v)/(v·v)
        for (let i = 0; i < this.height; i++) for (let j = 0; j < this.width; j++) this[i]![j]! -= scale * outer_product[i]![j]!;
    }
}

export class SphericalRotationMatrix extends Matrix<3, 3> {
    constructor(theta: number, psi: number) {
        let sT: number = Math.sin(theta);
        let cT: number = Math.cos(theta);
        let sP: number = Math.sin(psi);
        let cP: number = Math.cos(psi);
        
        super(
            [cT, 0, sT],
            [-sT * sP, cP, cT * sP],
            [-sT * cP, -sP, cT * cP]
        );
    }
}

// Vector operations
export function vector_add<N extends number>(a: Vector<N>, b: Vector<N>): Vector<N> {
    let result: Vector<N> = new Vector({ vector_length: a.length as N });
    for (let i = 0; i < a.length; i++) result[i] = a[i]! + b[i]!;
    return result;
}

export function vector_difference<N extends number>(a: Vector<N>, b: Vector<N>): Vector<N> {
    let result: Vector<N> = new Vector({ vector_length: a.length as N });
    for (let i = 0; i < a.length; i++) result[i] = a[i]! - b[i]!;
    return result;
}

export function vector_distance<N extends number>(a: Vector<N>, b: Vector<N>): number {
    let result: number = 0;
    for (let i = 0; i < a.length; i++) result += (a[i]! - b[i]!) ** 2;
    return Math.sqrt(result);
}

export function vector_hadamard<N extends number>(a: Vector<N>, b: Vector<N>): Vector<N> {
    let result: Vector<N> = new Vector({ vector_length: a.length as N });
    for (let i = 0; i < a.length; i++) result[i] = a[i]! * b[i]!;
    return result;
}

export function vector_scale<N extends number>(a: Vector<N>, b: number): Vector<N> {
    let result: Vector<N> = new Vector({ vector_length: a.length as N });
    for (let i = 0; i < a.length; i++) result[i] = a[i]! * b;
    return result;
}

export function dot<N extends number>(a: Vector<N>, b: Vector<N>): number {
    let result = 0;
    for (let i = 0; i < a.length; i++) result += a[i]! * b[i]!;
    return result;
}

export function normalize<N extends number>(a: Vector<N>): Vector<N> {
    let result: Vector<N> = new ZeroVector(a.length as N);
    let denominator: number = Math.sqrt(dot(a, a));
    // Return zero vector if denominator is too small
    if (Math.abs(denominator) < BIAS) return result;
    for (let i = 0; i < a.length; i++) result[i] = a[i]! / denominator;
    return result;
}

export function cross(a: Vector<3>, b: Vector<3>): Vector<3> {
    return new Vector(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    );
}

export function vector_abs<N extends number>(a: Vector<N>): Vector<N> {
    let result: Vector<N> = new Vector({ vector_length: a.length as N });
    for (let i = 0; i < a.length; i++) result[i] = Math.abs(a[i]!);
    return result;
}

export function outer<M extends number, N extends number>(a: Vector<M>, b: Vector<N>): Matrix<M, N> {
    let result: Matrix<M, N> = new Matrix({ matrix_height: a.length as M, matrix_width: b.length as N });
    for (let i = 0; i < result.height; i++) for (let j = 0; j < result.width; j++) result[i]![j] = a[i]! * b[j]!;
    return result;
}

// Matrix operations
export function transpose<M extends number, N extends number>(A: Matrix<M, N>): Matrix<N, M> {
    let result: Matrix<N, M> = new Matrix({ matrix_height: A.width as N, matrix_width: A.height as M });
    for (let i = 0; i < result.height; i++) for (let j = 0; j < result.width; j++) result[i]![j] = A[j]![i]!;
    return result;
}

export function matrix_add<M extends number, N extends number>(A: Matrix<M, N>, B: Matrix<M, N>): Matrix<M, N> {
    let result: Matrix<M, N> = new Matrix({ matrix_height: A.height as M, matrix_width: A.width as N });
    for (let i = 0; i < result.height; i++) result[i] = vector_add(A[i]!, B[i]!);
    return result;
}

export function matrix_hadamard<M extends number, N extends number>(A: Matrix<M, N>, B: Matrix<M, N>): Matrix<M, N> {
    let result: Matrix<M, N> = new Matrix({ matrix_height: A.height as M, matrix_width: A.width as N });
    for (let i = 0; i < result.height; i++) result[i] = vector_hadamard(A[i]!, B[i]!);
    return result;
}

export function matrix_scale<M extends number, N extends number>(A: Matrix<M, N>, b: number): Matrix<M, N> {
    let result: Matrix<M, N> = new Matrix({ matrix_height: A.height as M, matrix_width: A.width as N });
    for (let i = 0; i < result.height; i++) result[i] = vector_scale(A[i]!, b);
    return result;
}

export function matrix_mul<M extends number, N extends number, P extends number>(A: Matrix<M, N>, B: Matrix<N, P>): Matrix<M, P> {
    let result: Matrix<M, P> = new Matrix({ matrix_height: A.height as M, matrix_width: B.width as P });
    for (let i = 0; i < result.height; i++) for (let j = 0; j < result.width; j++) for (let k = 0; k < A.width; k++) result[i]![j]! += A[i]![k]! * B[k]![j]!;
    return result;
}

export function matrix_vector_mul<M extends number, N extends number>(A: Matrix<M, N>, v: Vector<N>): Vector<M> {
    let result: Vector<M> = new ZeroVector(A.height as M);
    for (let i = 0; i < A.height; i++) for (let j = 0; j < A.width; j++) result[i]! += A[i]![j]! * v[j]!;
    return result;
}

export function lu<N extends number>(A: Matrix<N, N>): { L: Matrix<N, N>, U: Matrix<N, N> } {
    // Initialize L and U matrices
    let n: N = A.height as N;
    let L: Matrix<N, N> = new IdentityMatrix(n);
    let U: Matrix<N, N> = new ZeroMatrix(n, n);
    // Copy first row of A to U
    for (let j = 0; j < n; j++) U[0]![j] = A[0]![j]!;
    // Calculate first column of L
    for (let i = 1; i < n; i++) L[i]![0] = A[i]![0]! / U[0]![0]!;
    // Calculate remaining elements
    for (let i = 1; i < n; i++) {
        // Calculate U's row i
        for (let j = i; j < n; j++) {
            let sum = 0;
            for (let k = 0; k < i; k++) sum += L[i]![k]! * U[k]![j]!;
            U[i]![j] = A[i]![j]! - sum;
        }

        // Calculate L's column i
        for (let j = i + 1; j < n; j++) {
            let sum = 0;
            for (let k = 0; k < i; k++) sum += L[j]![k]! * U[k]![i]!;
            L[j]![i] = (A[j]![i]! - sum) / U[i]![i]!;
        }
    }
    return { L, U };
}

export function qr<M extends number, N extends number>(A: Matrix<M, N>): { Q: Matrix<M, M>, R: Matrix<M, N> } {
    // Initialize Q as identity and R as copy of A
    let Q: Matrix<M, M> = new IdentityMatrix(A.height as M);
    let R: Matrix<M, N> = new Matrix({ matrix_height: A.height as M, matrix_width: A.width as N });
    for (let i = 0; i < A.height; i++) for (let j = 0; j < A.width; j++) R[i]![j] = A[i]![j]!;
    // For each column
    for (let j = 0; j < Math.min(A.width, A.height - 1); j++) {
        // Extract the column vector below diagonal
        let x: Vector<M> = new ZeroVector(A.height as M);
        for (let i = j; i < A.height; i++) x[i] = R[i]![j]!;
        // Calculate vector norm
        let xnorm: number = Math.sqrt(dot(x, x));
        if (Math.abs(xnorm) < BIAS) continue;
        
        // First component sign
        let s: number = - Math.sign(x[j]! || 1);
        // Construct Householder vector
        let u: Vector<M> = new ZeroVector(A.height as M);
        u[j] = s * xnorm;
        let v: Vector<M> = normalize(vector_add(x, u));
        // Skip if vector is zero
        let vnorm: number = Math.sqrt(dot(v, v));
        if (vnorm < BIAS) continue;
        // Normalize v
        for (let i = j; i < A.height; i++) v[i] = v[i]! / vnorm;
        // Construct and apply Householder matrix
        let H: Matrix<M, M> = new HouseholderMatrix(v);
        // Update R = HR
        R = matrix_mul(H, R);
        // Update Q = QH^T
        Q = matrix_mul(Q, transpose(H));
    }


    return { Q, R };
}

// find Moore Penrose pseudo inverse of A
export function moore_penrose<M extends number, N extends number>(A: Matrix<M, N>): Matrix<N, M> {
    const n: N = A.width as N;
    let AT: Matrix<N, M> = transpose(A);
    // Invert (A^T A) via QR decomposition
    const ATA: Matrix<N, N> = matrix_mul(AT, A);
    const QR = qr(ATA);
    let Rinv: Matrix<N, N> = new Matrix({ matrix_height: n, matrix_width: n });
    // Calculate R inverse.
    for (let i = n - 1; i >= 0; i--) {
      Rinv[i]![i] = 1;
      for (let j = n - 1; j > i; j--) Rinv[i] = vector_add(Rinv[i]!, vector_scale(Rinv[j]!, - QR.R[i]![j]! / QR.R[j]![j]!));
    }
    // Divide by diagonal elements.
    for (let i = 0; i < n; i++) Rinv[i] = vector_scale(Rinv[i]!, 1 / QR.R[i]![i]!);
    // Calculate Moore Penrose pseudo inverse.
    return matrix_mul(matrix_mul(Rinv, transpose(QR.Q)), AT);
}

export function ray_triangle(ray_origin: Vector<3>, ray_direction: Vector<3>, triangle: Matrix<3, 3>, normal: Vector<3>): number {
    const BIAS = 2 ** (-12);
    // Get distance to intersection point
    const s: number = dot(normal, vector_difference(triangle[0]!, ray_origin)) / dot(normal, normalize(ray_direction));
    // Ensure that ray triangle intersection is between light source and texture
    if (s <= BIAS) return Infinity;
    // Calculate intersection point
    const d: Vector<3> = vector_add(vector_scale(normalize(ray_direction), s), ray_origin);
    // Test if point on plane is in Triangle by looking for each edge if point is in or outside
    const v0: Vector<3> = vector_difference(triangle[1]!, triangle[0]!);
    const v1: Vector<3> = vector_difference(triangle[2]!, triangle[0]!);
    const v2: Vector<3> = vector_difference(d, triangle[0]!);
    const d00: number = dot(v0, v0);
    const d01: number = dot(v0, v1);
    const d11: number = dot(v1, v1);
    const d20: number = dot(v2, v0);
    const d21: number = dot(v2, v1);
    const denom: number = d00 * d11 - d01 * d01;
    const v: number = (d11 * d20 - d01 * d21) / denom;
    const w: number = (d00 * d21 - d01 * d20) / denom;
    const u: number =  1 - v - w;
    if (Math.min(u, v) <= BIAS || u + v >= 1.0 - BIAS) return Infinity;
    // Return point of intersection.
    return s;
}

export function next_power_of_two(x: number): number {
    return Math.pow(2, Math.ceil(Math.log2(x)));
}