/*
"use strict";

import { Vector } from "../../lib/math";
import { Prototype } from "../prototype";

# Blender v2.80 (sub 75) OBJ File: ''
# www.blender.org
mtllib cube.mtl
o Cube
v 1.000000 1.000000 -1.000000
v 1.000000 -1.000000 -1.000000
v 1.000000 1.000000 1.000000
v 1.000000 -1.000000 1.000000
v -1.000000 1.000000 -1.000000
v -1.000000 -1.000000 -1.000000
v -1.000000 1.000000 1.000000
v -1.000000 -1.000000 1.000000
vt 0.375000 0.000000
vt 0.625000 0.000000
vt 0.625000 0.250000
vt 0.375000 0.250000
vt 0.375000 0.250000
vt 0.625000 0.250000
vt 0.625000 0.500000
vt 0.375000 0.500000
vt 0.625000 0.750000
vt 0.375000 0.750000
vt 0.625000 0.750000
vt 0.625000 1.000000
vt 0.375000 1.000000
vt 0.125000 0.500000
vt 0.375000 0.500000
vt 0.375000 0.750000
vt 0.125000 0.750000
vt 0.625000 0.500000
vt 0.875000 0.500000
vt 0.875000 0.750000
vn 0.0000 1.0000 0.0000
vn 0.0000 0.0000 1.0000
vn -1.0000 0.0000 0.0000
vn 0.0000 -1.0000 0.0000
vn 1.0000 0.0000 0.0000
vn 0.0000 0.0000 -1.0000
usemtl Material
s off
f 1/1/1 5/2/1 7/3/1 3/4/1
f 4/5/2 3/6/2 7/7/2 8/8/2
f 8/8/3 7/7/3 5/9/3 6/10/3
f 6/10/4 2/11/4 4/12/4 8/13/4
f 2/14/5 1/15/5 3/16/5 4/17/5
f 6/18/6 5/19/6 1/20/6 2/11/6 

    
export class Cuboid extends Prototype {
    constructor(center: Vector<3>, size: Vector<3>) {
        const vertices = [
            center.x - size.x / 2, center.y - size.y / 2, center.z - size.z / 2,
            center.x - size.x / 2, center.y - size.y / 2, center.z + size.z / 2,
            center.x - size.x / 2, center.y + size.y / 2, center.z - size.z / 2,
            center.x - size.x / 2, center.y + size.y / 2, center.z + size.z / 2,
            center.x + size.x / 2, center.y - size.y / 2, center.z - size.z / 2,
            center.x + size.x / 2, center.y - size.y / 2, center.z + size.z / 2,
            center.x + size.x / 2, center.y + size.y / 2, center.z - size.z / 2,
            center.x + size.x / 2, center.y + size.y / 2, center.z + size.z / 2
        ];
    }
}
*/