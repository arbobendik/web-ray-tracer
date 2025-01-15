"use strict";
import { ConfigForm } from "./form.js";
const getStartValueCheckbox = (property) => {
    const value = localStorage.getItem(property.name);
    if (!value)
        return property.defaultValue;
    else if (value === "true")
        return true;
    else if (value === "false")
        return false;
    else
        throw new Error(`Unsupported value: ${value}`);
};
const isNumber = (n) => String(Number.parseFloat(n)) === n;
const getStartValueSlider = (property) => {
    const value = localStorage.getItem(property.name);
    if (!value)
        return property.defaultValue;
    else if (isNumber(value))
        return Number(value);
    else
        throw new Error(`Unsupported value: ${value}`);
};
const getStartValueSelect = (property) => {
    const value = localStorage.getItem(property.name);
    if (!value)
        return property.defaultValue;
    else
        return value;
};
export function createConfigUI(engine) {
    const form = document.createElement("form");
    const localStorageHook = (name, value) => {
        localStorage.setItem(name, value.toString());
    };
    // Add FlexLight settings to parameter form
    const flexLightForm = new ConfigForm(form, engine, localStorageHook);
    flexLightForm.addSelect("Backend", "api", ["webgl2", "webgpu"], getStartValueSelect({ name: "Backend", defaultValue: "webgl2" }));
    flexLightForm.addSelect("Renderer", "rendererType", ["rasterizer", "pathtracer"], getStartValueSelect({ name: "Renderer", defaultValue: "rasterizer" }));
    // Add Config settings to parameter form
    const configForm = new ConfigForm(form, engine.config, localStorageHook);
    configForm.addSelect("Antialiasing", "antialiasingAsString", ["undefined", "fxaa", "taa"], getStartValueSelect({ name: "Antialiasing", defaultValue: "fxaa" }));
    configForm.addCheckbox("Temporal averaging", "temporal", true);
    configForm.addCheckbox("HDR", "hdr", getStartValueCheckbox({ name: "HDR", defaultValue: true }));
    configForm.addSlider("Render quality", "renderQuality", 0.1, 2, 0.1, getStartValueSlider({ name: "Render quality", defaultValue: 1 }));
    configForm.addSlider("Samples per ray", "samplesPerRay", 1, 32, 1, getStartValueSlider({ name: "samplesPerRay", defaultValue: 1 }));
    configForm.addSlider("Max reflections", "maxReflections", 1, 16, 1, getStartValueSlider({ name: "Max reflections", defaultValue: 5 }));
    configForm.addSlider("Min importancy", "minImportancy", 0, 1, 0.01, getStartValueSlider({ name: "Min importancy", defaultValue: 0.3 }));
    return form;
}
;
