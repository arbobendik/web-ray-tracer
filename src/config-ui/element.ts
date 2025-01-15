"use strict";

// Types for ConfigElement
type InputType = "checkbox" | "range" | "select";
export type ValidValueType<IT extends InputType> = IT extends "checkbox" ? boolean : IT extends "range" ? number : IT extends "select" ? string : never;
export type ValidInputType<IT extends InputType, O extends Object, K extends keyof O> = O[K] extends ValidValueType<IT> ? O[K] : never;

const TypeScriptAssign = <O extends Object, K extends keyof O> (obj: O, key: K, val: O[K]) => obj[key] = val;

type IsRange<IT extends InputType, T> = IT extends "range" ? T : never;
type IsSelect<IT extends InputType, T> = IT extends "select" ? T : never;

type Options<IT extends InputType> = IsSelect<IT, Array<string>> extends never ? [] : Array<string>;

export class ConfigElement<IT extends InputType, O extends Object, K extends keyof O> extends HTMLElement {
    readonly name: string;
    readonly object: O;
    readonly key: K;
    readonly type: IT;
    readonly hook: ((name: string, value: ValidInputType<IT, O, K>) => void);
    readonly options: Options<IT>;

    private _value: ValidInputType<IT, O, K> | undefined = undefined;

    private label: HTMLLabelElement;
    private input: HTMLInputElement | undefined = undefined;
    private rangeDisplay: HTMLSpanElement | undefined = undefined;
    private select: HTMLSelectElement | undefined = undefined;

    
    constructor(object: O, key: K, name: string, type: IT, hook: ((name: string, value: ValidInputType<IT, O, K>) => void), options: Options<IT> = []) {
        super();
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

    private createInput(): void {
        // If type is not set, don't create input
        let input = document.createElement("input");
        input.name = this.name;
        input.value = this._value?.toString() ?? "";
        input.type = this.type;

        switch (this.type) {
            case "checkbox":
                // Add event listener
                input.addEventListener("change", (event: Event) => {
                    if (!(event.target instanceof HTMLInputElement)) return;
                    this.value = input.checked as ValidInputType<IT, O, K>;
                });
                break;
            case "range":
                // Create range display to show current value
                let rangeDisplay = document.createElement("span");
                rangeDisplay.textContent = this._value?.toString() ?? "";
                this.rangeDisplay = rangeDisplay;
                this.label.appendChild(rangeDisplay);
                // Add event listener
                input.addEventListener("change", (event: Event) => {
                    if (!(event.target instanceof HTMLInputElement)) return;
                    this.value = input.value as ValidInputType<IT, O, K>;
                });
                break;
        }
        

        this.input = input;
        this.label.appendChild(this.input);
    }

    private createSelect(): void {
        // If options are not set, don't create select
        if (!this.options) throw new Error("Options are not set for select element");
        let select = document.createElement("select");
        // Create options
        for (let option of this.options) {
            let optionElement: HTMLOptionElement = document.createElement("option");
            optionElement.value = option;
            optionElement.textContent = option;
            select.appendChild(optionElement);
        }
        // Add event listener
        select.addEventListener("change", (event: Event) => {
            if (!(event.target instanceof HTMLSelectElement)) return;
            this.value = select.value as ValidInputType<IT, O, K>;
        });

        this.select = select;
        this.select.name = this.name;
        this.select.value = this._value?.toString() ?? "";
        this.label.appendChild(this.select);
    }

    private attemptRender () {
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

    set min(min: IsRange<IT, string>) { if (this.input) this.input.min = min; }
    get min() { return this.input?.min as IsRange<IT, string>; }

    set max(max: IsRange<IT, string>) { if (this.input) this.input.max = max; }
    get max() { return this.input?.max as IsRange<IT, string>; }

    set step(step: IsRange<IT, string>) { if (this.input) this.input.step = step; }
    get step() { return this.input?.step as IsRange<IT, string>; }

    get value() { return this._value; }
    set value(value: ValidInputType<IT, O, K> | undefined) { 
        this._value = value;
        
        if (value) {
            this.hook(this.name ?? "", value);
            TypeScriptAssign(this.object, this.key, value);
        }

        let stringValue = (value ?? "").toString();
        if (this.input) this.input.value = stringValue;
        if (this.rangeDisplay) this.rangeDisplay.textContent = stringValue;
        if (this.select) this.select.value = stringValue;

        if (this.input) console.log(this.name, this.input.value, value);
        if (this.select) console.log(this.name, this.select.value, value);
    }
}
