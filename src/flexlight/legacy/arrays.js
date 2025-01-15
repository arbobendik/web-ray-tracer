'use strict';

export class Arrays {
    static compare = (a1, a2) => {
        if (a1.length !== a2.length) return false;
        // Compare elements
        for (let i = 0; i < a1.length; i++) if (a1 !== a2) return false;
        return true;
    }

    static push = (a1, a2) => {
        if (a2.length > 256) {
            return a1.concat(a2);
        } else {
            let a1Length = a1.length;
            // Pre allocate size of a1
            a1.length = a1Length + a2.length;
            // Append items of a2 to a1
            for(let i = 0; i < a2.length; i++) a1[a1Length + i] = a2[i];
            return a1;
        }
    }
}

export class Float16Array extends Uint16Array {
    from = array => {
        // Create view arrays to convert array
        let floatView = array;
        let int32View = new Int32Array(floatView.buffer);
        for (let i = 0; i < array.length; i++) {
            let x = int32View[i];
            let bits = (x >> 16) & 0x8000;
            let m = (x >> 12) & 0x07ff;
            let e = (x >> 23) & 0xff;
            if (e < 103) {
                this[i] = bits;
                continue;
            }
            if (e > 142) {
                bits |= 0x7c00;
                bits |= ((e == 255) ? 0 : 1) && (x & 0x007fffff);
                this[i] = bits;
                continue;
            }
            if (e < 113) {
                m |= 0x0800;
                bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
                this[i] = bits;
                continue;
            }
            bits |= ((e - 112) << 10) | (m >> 1);
            bits += m & 1;
            this[i] = bits;
        }
        return this;
    }

    constructor (item) {
        if (Array.isArray(item) || item instanceof Float32Array) {
            super(item.length);
            this.from(item);
        } else if (Number.isInteger(item)) {
            super(item);
        }
    }
}