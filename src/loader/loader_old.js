'use strict';
			
import { FlexLight } from "../flexlight.js";
window.FlexLight = FlexLight;
console.log(FlexLight);

load();

function load() {
  
  if(document.currentScript !== null) document.currentScript.remove();

  
  const urlParams = new URLSearchParams(location.search);
  const script = document.createElement('script');
  let sceneName = urlParams.get('v') ?? 'wave';
  script.src = './build/loader/examples/' + sceneName + '.js';
  document.head.appendChild(script);

	window.addEventListener('load', function() {
    let config = engine.config;
    // Get form elements
    const scriptForm = document.getElementById('scriptForm');
    const parameterForm = document.getElementById('parameterForm');
    const selectors = ['antialiasing'];
    const tickBoxes = ['filter', 'temporal', 'hdr'];
    const buttons = ['screenshot'];
    const sliders = ['renderQuality', 'samplesPerRay', 'maxReflections', 'minImportancy'];

    parameterForm.children['pathtracing'].checked = (localStorage.getItem('pathtracing') ?? 'true') === 'true';
    parameterForm.children['api'].value = localStorage.getItem('api') ?? 'webgl2';
    // Set renderer and api
    engine.api = parameterForm.children['api'].value;
    engine.renderer = parameterForm.children['pathtracing'].checked ? 'pathtracer' : 'rasterizer';

    selectors.forEach((item) => {
      config[item] = localStorage.getItem(item) ?? config[item];
      parameterForm.children[item].value = config[item];
    });
    // Restore values in pathtracer
    tickBoxes.forEach((item) => {
      config[item] = (localStorage.getItem(item) ?? 'true') === 'true';
      parameterForm.children[item].checked = config[item];
    });

    buttons.forEach((item) => {
      document.getElementById(item).addEventListener('click', () => {
        engine.screenshot();
      });
    });

    sliders.forEach((item) => {
      config[item] = Number(localStorage.getItem(item) ?? config[item]);
      parameterForm.children[item].value = config[item];
    });
    // Load slider variables
    document.querySelectorAll('output').forEach((item, i) => {
      item.value = config[sliders[i]];
      // Define silder
      var slider = document.getElementById(sliders[i]);
      // Live update slider variables
      slider.addEventListener('input', () => item.value = slider.value);
    });

		if (urlParams.has('v')) {
			scriptForm[0].value = urlParams.get('v');
		} else {
			scriptForm.submit();
		}
    // Reload if scene changes
    scriptForm.addEventListener('change', () => {
      urlParams.set('v', scriptForm[0].value);
      location.search = urlParams.toString();
    });
    // Update gl quality params on form change
    parameterForm.addEventListener('change', () => {
      let pathtracing = document.getElementById('pathtracing').checked;
      let api = document.getElementById('api').value;

      if ((localStorage.getItem('pathtracing') === 'true') !== pathtracing) {
        localStorage.setItem('pathtracing', pathtracing);
        engine.renderer = pathtracing ? 'pathtracer' : 'rasterizer';
      }

      if (localStorage.getItem('api') !== api) {
        localStorage.setItem('api', api);
        engine.api = api;
      }

      selectors.forEach((item) => {
        config[item] = parameterForm.children[item].value;
        localStorage.setItem(item, config[item]);
      });

      tickBoxes.forEach((item) => {
        config[item] = parameterForm.children[item].checked;
        localStorage.setItem(item, config[item]);
      });

      sliders.forEach((item) => {
        config[item] = Number(parameterForm.children[item].value);
        localStorage.setItem(item, config[item]);
      });
    });
	}, {once: true});
}
