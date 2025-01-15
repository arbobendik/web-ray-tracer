"use strict";
import { ConfigElement } from "./element.js";
export class ConfigForm {
    constructor(form, config, hook = () => { }) {
        Object.defineProperty(this, "_form", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_hook", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this._form = form;
        this._config = config;
        this._hook = hook;
    }
    addCheckbox(name, key, val = undefined) {
        console.log("Adding checkbox");
        const checkbox = new ConfigElement(this._config, key, name, "checkbox", this._hook);
        // Set value if provided
        if (val)
            checkbox.value = val;
        // console.log(checkbox);
        this._form.appendChild(checkbox);
    }
    addSlider(name, key, min, max, step, val = undefined) {
        const slider = new ConfigElement(this._config, key, name, "range", this._hook);
        slider.min = min.toString();
        slider.max = max.toString();
        slider.step = step.toString();
        // Set value if provided
        if (val)
            slider.value = val;
        this._form.appendChild(slider);
    }
    addSelect(name, key, options, val = undefined) {
        const select = new ConfigElement(this._config, key, name, "select", this._hook, options);
        // Set value if provided
        if (val)
            select.value = val;
        this._form.appendChild(select);
    }
}
Object.defineProperty(ConfigForm, "classConstructor", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: (function () {
        // Define custom element
        console.log("Defining custom element");
        customElements.define("config-element", ConfigElement);
    })()
});
