'use strict';

export var Math = window.Math;

// Extend standard Math Object
Object.assign(Math, {
  // Floating point bias for unstable mathods
  BIAS: 2 ** (-32),
  // Make results numerically stable
  stabilize: (x) => (Math.abs(x) % 1 < Math.BIAS || Math.abs(x) % 1 > 1 - Math.BIAS) ? Math.round(x) : x,
  // Sum up list of parameters
  sum: function () { return Array.prototype.slice.call(arguments).reduce((p, c) => p + c, 0)},
  // Multiplies matrices, vectors elementwise or with scalar
  mul: (a, b) => {
    const matMul = (A, B) => {
      let BT = Math.transpose(B);
      let C = A.map(() => new Array(B[0].length).fill(0));
      return C.map((row, i) => row.map((e, j) => Math.dot(A[i], BT[j])));
    };
    const dim = (obj) => (Array.isArray(obj)) ? dim(obj[0]) + 1 : 0;
    const dimA = dim(a);
    const dimB = dim(b);
    switch (dimA) {
      case 0: switch (dimB) {
        case 0: return a * b;
        case 1: return b.map(e => Math.stabilize(e * a));
        case 2: return b.map(row => row.map(e => e * a));
      }
      case 1: switch (dimB) {
        case 0: return a.map(e => Math.stabilize(e * b));
        case 1: return a.map((e, i) => Math.stabilize(e* b[i]));
        case 2: return undefined;
      }
      case 2: switch (dimB) {
        case 0: return a.map((row) => row.map((e) => e * b));
        case 1: return matMul(a, b.map((e) => [e])).flat();
        case 2: return matMul(a, b);
      }
    }
  },
  // Calculate dot product
  dot: (a, b) => Math.stabilize(Math.mul(a, b).reduce((p, c) => p + c, 0)),
  // Calculate cross product for vec3
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  // Adds two vectors
  add: (a, b) => a.map((e, i) => e + b[i]),
  // Determines vector between 2 points
  diff: (a, b) => a.map((e, i) => e - b[i]),

  length: (a) => Math.stabilize(Math.sqrt(a.reduce((p, c) => p + c ** 2, 0))),
  // Normalize vector
  normalize: (a) => {
    const length = Math.length(a);//Math.stabilize(Math.sqrt(a.reduce((p, c) => p + c ** 2, 0)));
    return a.map((e) => Math.stabilize(length) < Math.BIAS ? 0 : Math.stabilize(e / length));
  },
  // Give identity matrix
  identity: (dim) => {
    let res =  new Array(dim).fill(0).map(item => new Array(dim).fill(0)); 
    for (let i = 0; i < dim; i++) res[i][i] = 1;
    return res;
  },
  // Orthogonalization
  gramSchmidt: (A, dot = Math.dot) => {
    let B = [];
    A.forEach((row) => {
      B.push(Math.add(row, Math.mul(- 1, B.reduce((p, c) => {
        return Math.add(p, Math.mul(dot(c, row) / dot(c, c), c))
      }, new Array(A[0].length).fill(0)))))
    });
    return B;
  },
  // transpose matrix
  transpose: (A) => {
    let C = A[0].map(() => new Array(A.length).fill(0));
    return C.map((row, i) => row.map((e, j) => A[j][i]));
  },
  // QR decomposition
  qr: (A) => {
    let QT = Math.gramSchmidt(Math.transpose(A)).map((row) => Math.normalize(row));
    return {
      Q: Math.transpose(QT),
      R: Math.mul(QT, A)
    };
  },
  // find Moore Penrose pseudo inverse of A
  moorePenrose: (A) => {
    let AT = Math.transpose(A);
    // Invert (A^T A) via QR decomposition
    const QR = Math.qr(Math.mul(AT, A));
    let Rinv = new Array(QR.R.length);
    for (let i = QR.R.length - 1; i >= 0; i--) {
      Rinv[i] = QR.R.map((e, j) => i === j ? 1 : 0);
      for (let j = QR.R.length - 1; j > i; j--) {
        Rinv[i] = Math.add(Rinv[i], Math.mul(Rinv[j], - QR.R[i][j] / QR.R[j][j]));
      }
    }
    for (let i = 0; i < QR.R.length; i++) Rinv[i] = Math.mul(Rinv[i], 1 / QR.R[i][i]);
    // If current result doesn't work try Moore Penrose for AT
    if (Number.isNaN(Rinv[0][0])) return Math.transpose(Math.moorePenrose(AT));
    return Math.mul(Math.mul(Rinv, Math.transpose(QR.Q)), AT);
  },
  // linear regression of the points for a polynomial of n-th degree
  regression: (points, n) => {
    // Build matrix A
    let A = points.map(() => new Array(n + 1));
    for (let i = 0; i < points.length; i++) for (let j = 0; j <= n; j++) A[i][j] = points[i][0] ** j;
    // Build vector b out of the y values
    let b = points.map((item) => item[1]);
    // Solve A^H A x = A^H b compute the pseudo inverse of A
    return Math.mul(Math.moorePenrose(A), b);
  },
  // Test if ray intersects triangle and return point of intersection
  rayTriangle: (rayOrigin, rayDirection, tA, tB, tC, n) => {
    const BIAS = 2 ** (-12);
    // Get distance to intersection point
    const s = Math.dot(n, Math.diff(tA, rayOrigin)) / Math.dot(n, Math.normalize(rayDirection));
    // Ensure that ray triangle intersection is between light source and texture
    if (s <= BIAS) return Infinity;
    // Calculate intersection point
    let d = Math.add(Math.mul(s, Math.normalize(rayDirection)), rayOrigin);
    // Test if point on plane is in Triangle by looking for each edge if point is in or outside
    let v0 = Math.diff(tB, tA);
    let v1 = Math.diff(tC, tA);
    let v2 = Math.diff(d, tA);
    let d00 = Math.dot(v0, v0);
    let d01 = Math.dot(v0, v1);
    let d11 = Math.dot(v1, v1);
    let d20 = Math.dot(v2, v0);
    let d21 = Math.dot(v2, v1);
    let denom = d00 * d11 - d01 * d01;
    let v = (d11 * d20 - d01 * d21) / denom;
    let w = (d00 * d21 - d01 * d20) / denom;
    let u =  1 - v - w;
    if (Math.min(u, v) <= BIAS || u + v >= 1.0 - BIAS) return Infinity;
    // Return point of intersection.
    return s;
  },
  // Sigmoid activation function commonly used in ANNs
  /*

                   1-|        ,____------
                     |    /---
                     |   /
                     | /
                 0.5-/
                   / |
                 /   |
             ___/    |
  ______----'________|____________________
       -3            0            3

  */
  sigmoid: x => 1 / (1 + Math.E ** (-x)),
  // Derivative of sigmoid function used for backpropagation in ANNs
  /*

              0.25-|-,_
              ,'   |   ',
              /     |     \
            |      |      |
            |       |       |
          /        |        \
          /         |         \
      _-'           |           '-_
  _--'______________|______________'--_
        -3         0         3

  */
  sigmoidPrime: x => Math.sigmoid(x) * (1 - Math.sigmoid(x)),
  // Modulo operator.
  mod: (x, y) => x - y * Math.floor(x/y)
});
