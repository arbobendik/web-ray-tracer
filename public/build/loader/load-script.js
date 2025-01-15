"use strict";
export function loadScript(url, type = undefined) {
    const script = document.createElement("script");
    script.src = url;
    if (type)
        script.type = type;
    document.head.appendChild(script);
}
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(location.search);
    const sceneName = urlParams.get('v') ?? 'example1';
    loadScript(`./build/loader/examples/${sceneName}.js`, 'module');
});
