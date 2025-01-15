// tmp/config-ui/element.js
var TypeScriptAssign = (obj, key, val) => obj[key] = val;
var ConfigElement = class extends HTMLElement {
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
      value: void 0
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
      value: void 0
    });
    Object.defineProperty(this, "rangeDisplay", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "select", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.object = object;
    this.key = key;
    this.name = name;
    this.type = type;
    this.hook = hook;
    this.options = options;
    this.label = document.createElement("label");
    this.attemptRender();
  }
  connectedCallback() {
    this.appendChild(this.label);
    console.log(this.label);
  }
  createInput() {
    let input = document.createElement("input");
    input.name = this.name;
    input.value = this._value?.toString() ?? "";
    input.type = this.type;
    switch (this.type) {
      case "checkbox":
        input.addEventListener("change", (event) => {
          if (!(event.target instanceof HTMLInputElement))
            return;
          this.value = input.checked;
        });
        break;
      case "range":
        let rangeDisplay = document.createElement("span");
        rangeDisplay.textContent = this._value?.toString() ?? "";
        this.rangeDisplay = rangeDisplay;
        this.label.appendChild(rangeDisplay);
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
    if (!this.options)
      throw new Error("Options are not set for select element");
    let select = document.createElement("select");
    for (let option of this.options) {
      let optionElement = document.createElement("option");
      optionElement.value = option;
      optionElement.textContent = option;
      select.appendChild(optionElement);
    }
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
    this.label.replaceChildren();
    this.label.textContent = this.name;
    this.label.htmlFor = this.name;
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
  set min(min) {
    if (this.input)
      this.input.min = min;
  }
  get min() {
    return this.input?.min;
  }
  set max(max) {
    if (this.input)
      this.input.max = max;
  }
  get max() {
    return this.input?.max;
  }
  set step(step) {
    if (this.input)
      this.input.step = step;
  }
  get step() {
    return this.input?.step;
  }
  get value() {
    return this._value;
  }
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
};

// tmp/config-ui/form.js
var ConfigForm = class {
  constructor(form, config, hook = () => {
  }) {
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
  addCheckbox(name, key, val = void 0) {
    console.log("Adding checkbox");
    const checkbox = new ConfigElement(this._config, key, name, "checkbox", this._hook);
    if (val)
      checkbox.value = val;
    this._form.appendChild(checkbox);
  }
  addSlider(name, key, min, max, step, val = void 0) {
    const slider = new ConfigElement(this._config, key, name, "range", this._hook);
    slider.min = min.toString();
    slider.max = max.toString();
    slider.step = step.toString();
    if (val)
      slider.value = val;
    this._form.appendChild(slider);
  }
  addSelect(name, key, options, val = void 0) {
    const select = new ConfigElement(this._config, key, name, "select", this._hook, options);
    if (val)
      select.value = val;
    this._form.appendChild(select);
  }
};
Object.defineProperty(ConfigForm, "classConstructor", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: function() {
    console.log("Defining custom element");
    customElements.define("config-element", ConfigElement);
  }()
});

// tmp/config-ui/config-ui.js
var getStartValueCheckbox = (property) => {
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
var isNumber = (n) => String(Number.parseFloat(n)) === n;
var getStartValueSlider = (property) => {
  const value = localStorage.getItem(property.name);
  if (!value)
    return property.defaultValue;
  else if (isNumber(value))
    return Number(value);
  else
    throw new Error(`Unsupported value: ${value}`);
};
var getStartValueSelect = (property) => {
  const value = localStorage.getItem(property.name);
  if (!value)
    return property.defaultValue;
  else
    return value;
};
function createConfigUI(engine) {
  const form = document.createElement("form");
  const localStorageHook = (name, value) => {
    localStorage.setItem(name, value.toString());
  };
  const flexLightForm = new ConfigForm(form, engine, localStorageHook);
  flexLightForm.addSelect("Backend", "api", ["webgl2", "webgpu"], getStartValueSelect({ name: "Backend", defaultValue: "webgl2" }));
  flexLightForm.addSelect("Renderer", "rendererType", ["rasterizer", "pathtracer"], getStartValueSelect({ name: "Renderer", defaultValue: "rasterizer" }));
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
export {
  createConfigUI
};
