"use strict";

import { createConfigUI } from "../../config-ui/config-ui.js";
import { FlexLight, Instance, PointLight, Prototype, Vector, Camera, Scene } from "../../flexlight/flexlight.js";

const staticPath = './static/';
// Create new canvas
const canvas = document.createElement("canvas");
// Append it to body
document.body.appendChild(canvas);
// Create new engine object for canvas
const engine = new FlexLight (canvas);
engine.io = 'web';


const controlPanel = document.getElementById("controlPanel");
if (!controlPanel) throw new Error("Control panel not found");

const configUI = createConfigUI(engine);
controlPanel.appendChild(configUI);



let camera: Camera = engine.camera;
let scene: Scene = engine.scene;
/*
[
	staticPath + "textures/grass.jpg",     // 0
].forEach(item => {
	let img = new Image();
	img.src = item;
	scene.textures.push(img);
});
*/

// Set camera perspective and position.
[camera.position.x, camera.position.y, camera.position.z] = [0, 10, 0];
[camera.direction.x, camera.direction.y] = [-2.38, 0.8];

let light1 = new PointLight(new Vector(100, 500, 100), new Vector(2000000, 0, 0), 100);
let light2 = new PointLight(new Vector(-100, 100, 500), new Vector(1500000, 0, 0), 100);

scene.addPointLight(light1);
scene.addPointLight(light2);

scene.ambientLight = new Vector(0.01, 0.01, 0.01);

// scene.queue.push(plane);

// Start render engine.
engine.renderer.render();

// const search = new URLSearchParams(location.search);
let urlParams = new URL(String(document.location)).searchParams;



// console.log(search.getAll());


const loadObj = async (model: string) => {	
	console.log('loading ' + model);
	const objPath = staticPath + 'objects/' + model + '.obj';
	const mtlPath = staticPath + 'objects/' + model + '.mtl';
	const prototype = await Prototype.fromObj(objPath, mtlPath);
	
	const instance = new Instance(prototype);
	scene.addInstance(instance);
}

let model = urlParams.get('model') ?? 'sphere';
loadObj(model);
// obj.emissiveness = 0;
// obj.scale(5);
// obj.move(5, 0, - 5);
/*
obj.roughness = .1;
console.log(obj);
obj.metallicity = 0.1;
obj.translucency = 0.9;
obj.ior = 9.5;
obj.color = [255, 200, 90];
*/
// scene.queue.push(obj);
// engine.renderer.updateScene();

// Add FPS counter to top-right corner
const fpsCounter = document.createElement("div");
// Append it to body.
document.body.appendChild(fpsCounter);
// setTimeout(() => engine.renderer.freeze = true, 1000);

/*
// init iterator variable for simple animations
let iterator = 0;

setInterval(() => {
	// increase iterator
	iterator += 0.01;
	// precalculate sin and cos
	let [sin, cos] = [Math.sin(iterator), Math.cos(iterator)];
	// animate light sources
	scene.primaryLightSources[0] = [50*sin, 50, 50*cos];
	scene.primaryLightSources[0].variation = 10;
	scene.primaryLightSources[0].intensity = 10000;
	engine.renderer.updatePrimaryLightSources();
}, 100/6);
*/
// Update Counter periodically.
setInterval(() => {
	fpsCounter.textContent = String(Math.round(engine.renderer.fps));
}, 1000);
