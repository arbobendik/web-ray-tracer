'use strict';

import { Vector, ZeroVector } from '../lib/math.js';


export class Camera {
  // Camera and frustrum settings
  position: Vector<3> = new ZeroVector(3);
  direction: Vector<2> = new ZeroVector(2);
  fov: number = 1 / Math.PI;
}
