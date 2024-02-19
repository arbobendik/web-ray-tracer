"use strict";
// Declare engine global.
var engine;
// Start scene buider
buildScene();
// Build example scene
async function buildScene() {
	// Create new canvas.
	var canvas = document.createElement("canvas");
  	// Append it to body.
	document.body.appendChild(canvas);
	engine = new FlexLight (canvas);
	engine.io = 'web';

	let camera = engine.camera;
	let scene = engine.scene;

	[
		"textures/grass.jpg",     // 0
	].forEach(item => {
		let img = new Image();
	  	img.src = item;
	  	scene.textures.push(img);
	});

	// Set camera perspective and position.
	[camera.x, camera.y, camera.z] = [0, 1, 0];
	[camera.fx, camera.fy] = [- 2.38, 0.2];

	// Generate plane.
	let plane = scene.Plane([- 50, - 1, - 50], [50, - 1, - 50], [50, - 1, 50], [- 50, - 1, 50], [0, 1, 0]);

	scene.primaryLightSources = [[40, 50, 40]];
	scene.primaryLightSources[0].intensity = 20000;

	scene.ambientLight = [0.1, 0.1, 0.1];
	
	scene.queue.push(plane);

	// Start render engine.
	engine.renderer.render();

	// const search = new URLSearchParams(location.search);
	let urlParams = new URL(document.location).searchParams;

	// console.log(search.getAll());
	let model = urlParams.get('model') ?? 'sphere';
	console.log('loading ' + model);

	let modelUrl = 'objects/' + model + '.obj';
	let materialUrl = 'objects/' + model + '.mtl';
	var mtl = await scene.importMtl(materialUrl);
	var obj = await scene.importObj(modelUrl, mtl);
	// obj.scale(5);
	obj.move(5, 0, - 5);
	obj.roughness = .1;
	console.log(obj);
	obj.metallicity = 0.1;
	obj.translucency = 0.9;
	obj.ior = 9.5;
	obj.color = [255, 200, 90];
	// obj.staticPermanent = true;
	scene.queue.push(obj);
	engine.renderer.updateScene();

	// Add FPS counter to top-right corner
	var fpsCounter = document.createElement("div");
	// Append it to body.
	document.body.appendChild(fpsCounter);
	// setTimeout(() => engine.renderer.freeze = true, 1000);
	
	// Update Counter periodically.
	setInterval(() => {
		fpsCounter.textContent = engine.renderer.fps;
	}, 1000);
}
