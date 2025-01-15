"use strict";

const staticPath = './static/';
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
		staticPath + "textures/grass.jpg",     // 0
	].forEach(item => {
		let img = new Image();
	  	img.src = item;
	  	scene.textures.push(img);
	});

	// Set camera perspective and position.
	[camera.x, camera.y, camera.z] = [0, 1, 0];
	[camera.fx, camera.fy] = [- 2.38, 0.2];

	scene.primaryLightSources[0].intensity = 0;
	
	
	scene.ambientLight = [.01, .01, .01];
	
	// scene.queue.push(plane);

	// Start render engine.
	engine.renderer.render();

	// console.log(search.getAll());
	let model = 'cornell';
	console.log('loading ' + model);

	let modelUrl = staticPath + 'objects/' + model + '.obj';
	let materialUrl = staticPath + 'objects/' + model + '.mtl';
	var mtl = await scene.importMtl(materialUrl);
	var obj = await scene.importObj(modelUrl, mtl);
	// obj.emissiveness = 0;
	obj.scale(20);
	// obj.move(5, 0, - 5);

	scene.queue.push(obj);
	engine.renderer.updateScene();

	// Add FPS counter to top-right corner
	var fpsCounter = document.createElement("div");
	// Append it to body.
	document.body.appendChild(fpsCounter);
	// Update Counter periodically.
	setInterval(() => {
		fpsCounter.textContent = engine.renderer.fps;
	}, 1000);
}
