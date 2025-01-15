"use strict";
const TypeScriptAssign = (obj, key, val) => obj[key] = val;
export class ConfigElement extends HTMLElement {
    constructor(object, key, name, type, hook, options = []) {
        super();
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "object", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "key", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "hook", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_value", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: undefined
        });
        Object.defineProperty(this, "label", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "input", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: undefined
        });
        Object.defineProperty(this, "rangeDisplay", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: undefined
        });
        Object.defineProperty(this, "select", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: undefined
        });
        // Create outer label element
        this.object = object;
        this.key = key;
        this.name = name;
        this.type = type;
        this.hook = hook;
        this.options = options;
        // Generate HTML element and render
        this.label = document.createElement("label");
        this.attemptRender();
    }
    connectedCallback() {
        this.appendChild(this.label);
        console.log(this.label);
    }
    createInput() {
        // If type is not set, don't create input
        let input = document.createElement("input");
        input.name = this.name;
        input.value = this._value?.toString() ?? "";
        input.type = this.type;
        switch (this.type) {
            case "checkbox":
                // Add event listener
                input.addEventListener("change", (event) => {
                    if (!(event.target instanceof HTMLInputElement))
                        return;
                    this.value = input.checked;
                });
                break;
            case "range":
                // Create range display to show current value
                let rangeDisplay = document.createElement("span");
                rangeDisplay.textContent = this._value?.toString() ?? "";
                this.rangeDisplay = rangeDisplay;
                this.label.appendChild(rangeDisplay);
                // Add event listener
                input.addEventListener("change", (event) => {
                    if (!(event.target instanceof HTMLInputElement))
                        return;
                    this.value = input.value;
                });
                break;
        }
        this.input = input;
        this.label.appendChild(this.input);
    }
    createSelect() {
        // If options are not set, don't create select
        if (!this.options)
            throw new Error("Options are not set for select element");
        let select = document.createElement("select");
        // Create options
        for (let option of this.options) {
            let optionElement = document.createElement("option");
            optionElement.value = option;
            optionElement.textContent = option;
            select.appendChild(optionElement);
        }
        // Add event listener
        select.addEventListener("change", (event) => {
            if (!(event.target instanceof HTMLSelectElement))
                return;
            this.value = select.value;
        });
        this.select = select;
        this.select.name = this.name;
        this.select.value = this._value?.toString() ?? "";
        this.label.appendChild(this.select);
    }
    attemptRender() {
        // Clear label
        this.label.replaceChildren();
        // Write name to label
        this.label.textContent = this.name;
        this.label.htmlFor = this.name;
        // Test if type is valid
        switch (this.type) {
            case "checkbox":
                this.createInput();
                break;
            case "range":
                this.createInput();
                break;
            case "select":
                this.createSelect();
                break;
        }
    }
    set min(min) { if (this.input)
        this.input.min = min; }
    get min() { return this.input?.min; }
    set max(max) { if (this.input)
        this.input.max = max; }
    get max() { return this.input?.max; }
    set step(step) { if (this.input)
        this.input.step = step; }
    get step() { return this.input?.step; }
    get value() { return this._value; }
    set value(value) {
        this._value = value;
        if (value) {
            this.hook(this.name ?? "", value);
            TypeScriptAssign(this.object, this.key, value);
        }
        let stringValue = (value ?? "").toString();
        if (this.input)
            this.input.value = stringValue;
        if (this.rangeDisplay)
            this.rangeDisplay.textContent = stringValue;
        if (this.select)
            this.select.value = stringValue;
        if (this.input)
            console.log(this.name, this.input.value, value);
        if (this.select)
            console.log(this.name, this.select.value, value);
    }
}
