'use strict';

import { WebGPUAntialiasingType } from "../webgpu/antialiasing/antialiasing-module";

export type StringAntialiasingType = "undefined" | "fxaa" | "taa";

export class Config {

  // Quality settings
  private _antialiasing: WebGPUAntialiasingType = "fxaa";
  // String getter / setter for config ui
  get antialiasingAsString(): StringAntialiasingType { return String(this._antialiasing) as StringAntialiasingType; }
  set antialiasingAsString(value: StringAntialiasingType) { 
    if (value === "undefined") {
      this._antialiasing = undefined;
    } else {
      this._antialiasing = value as WebGPUAntialiasingType; 
    }
  }
  // Set as regular getter / setter
  get antialiasing(): WebGPUAntialiasingType { return this._antialiasing; }
  set antialiasing(value: WebGPUAntialiasingType) { this._antialiasing = value; }

  temporal: boolean = true;
  hdr: boolean = true;
  renderQuality: number = 1;
  samplesPerRay: number = 1;
  maxReflections: number = 5;
  minImportancy: number = 0.3;
  temporalSamples: number = 4;
}
