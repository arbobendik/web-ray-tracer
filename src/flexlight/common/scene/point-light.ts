"use strict";

import { Vector } from "../lib/math";

export class PointLight {
    position: Vector<3>;
    color: Vector<3>;
    intensity: number;
    variance: number;
    // Construct point light
    constructor(position: Vector<3>, color: Vector<3>, intensity: number = 200, variance: number = 1) {
        this.position = position;
        this.color = color;
        this.intensity = intensity;
        this.variance = variance;
    }
}