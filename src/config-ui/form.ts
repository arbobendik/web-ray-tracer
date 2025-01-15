"use strict";

import { ValidInputType, ConfigElement } from "./element.js";

// Types for ConfigForm
export type ValueType = boolean | number | string;
export type KeyAssignable<O extends Object, K extends keyof O, V extends ValueType> = O[K] extends V ? K : never;

export class ConfigForm<O extends Object> {
    private _form: HTMLElement;
    private _config: O;
    private _hook: (name: string, value: ValueType) => void;

    static classConstructor = (function() {
        // Define custom element
        console.log("Defining custom element");
        customElements.define("config-element", ConfigElement);
    })();

    constructor(form: HTMLElement, config: O, hook: (name: string, value: ValueType) => void = () => {}) {
        this._form = form;
        this._config = config;
        this._hook = hook;
    }

    addCheckbox<K extends keyof O>(name: string, key: KeyAssignable<O, K, boolean>, val: ValidInputType<"checkbox", O, K> | undefined = undefined) {
        console.log("Adding checkbox");
        const checkbox = new ConfigElement<"checkbox", O, K>(this._config, key, name, "checkbox", this._hook);
        // Set value if provided
        if (val) checkbox.value = val;
        // console.log(checkbox);
        this._form.appendChild(checkbox);
    }

    addSlider<K extends keyof O>(name: string, key: KeyAssignable<O, K, number>, min: number, max: number, step: number, val: ValidInputType<"range", O, K> | undefined = undefined) {
        const slider = new ConfigElement<"range", O, K>(this._config, key, name, "range", this._hook);
        slider.min = min.toString();
        slider.max = max.toString();
        slider.step = step.toString();
        // Set value if provided
        if (val) slider.value = val;
        this._form.appendChild(slider);
    }

    addSelect<K extends keyof O,>(name: string, key: KeyAssignable<O, K, string>, options: Array<string>, val: ValidInputType<"select", O, K> | undefined = undefined) {
        const select = new ConfigElement<"select", O, K>(this._config, key, name, "select", this._hook, options);
        // Set value if provided
        if (val) select.value = val;
        this._form.appendChild(select);
    }
}
