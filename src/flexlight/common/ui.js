'use strict';

export class UI {
    selected = null;

    constructor (scene, camera) {
        this.scene = scene;
        this.camera = camera;
        // this.#runSelector();
    }

    #runSelector = () => {
        setInterval(() => {
            let origin = [this.camera.x, this.camera.y, this.camera.z];
            let direction = [
                - Math.sin(this.camera.fx) * Math.cos(this.camera.fy),
                - Math.sin(this.camera.fy),
                Math.cos(this.camera.fx) * Math.cos(this.camera.fy)
            ];
            // Unselect last object
            if (this.selected !== null) this.selected.selected = false;

            let c = this.getObjectInCenter(this.scene.queue, origin, direction);
            // If pointer is currently pointing at object
            if (c.distance !== Infinity) {
                c.object.selected = true;
                this.selected = c.object;
            } else {
                this.selected = null;
            }
            // console.log(this.selected);
            // this.selected.color = [0, 0, 0];
        }, 10);
    }

    getObjectInCenter = (part, o, dir) => {
        if (Array.isArray(part) || part.indexable) {
            if (part.length === 0) return;
            // Get object with least distance
            let least = this.getObjectInCenter(part[0], o, dir);
            // Iterate over all sub elements
            for (let i = 1; i < part.length; i++) {
                let t = this.getObjectInCenter(part[i], o, dir);
                if (least.distance > t.distance) least = t;
            }
            return least;
        } else {      
            if (part.length === 2) {
                let n = part.normal;
                let t0 = [part.vertices.slice(0, 3), part.vertices.slice(3, 6), part.vertices.slice(6, 9)];
                let t1 = [part.vertices.slice(9, 12), part.vertices.slice(12, 15), part.vertices.slice(15, 18)];
                return {
                    distance: Math.min(Math.rayTriangle (o, dir, t0[0], t0[1], t0[2], n), Math.rayTriangle (o, dir, t1[0], t1[1], t1[2], n)),
                    object: part
                };
            } else if (part.length === 1) {
                let n = part.normal;
                let t = [part.vertices.slice(0, 3), part.vertices.slice(3, 6), part.vertices.slice(6, 9)];
                return {
                    distance: Math.rayTriangle (o, dir, t[0], t[1], t[2], n),
                    object: part
                };
            }
        }
    }
}