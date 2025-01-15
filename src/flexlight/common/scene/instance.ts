"use strict";

import { Transform } from "./transform";
import { Material } from "./material";
import { Prototype } from "./prototype";
import { AlbedoTexture, EmissiveTexture, MetallicTexture, NormalTexture, RoughnessTexture } from "./texture";

export class Instance {
    readonly prototype: Prototype;
    transform: Transform | undefined = undefined;
    material: Material | undefined = undefined;

    // Texture instances
    normal: NormalTexture | undefined = undefined;
    albedo: AlbedoTexture | undefined = undefined;
    emissive: EmissiveTexture | undefined = undefined;
    roughness: RoughnessTexture | undefined = undefined;
    metallic: MetallicTexture | undefined = undefined;

    constructor(prototype: Prototype) {
        // Set prototype
        this.prototype = prototype;
    }
}