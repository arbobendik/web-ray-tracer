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

	// Create pbr textures.
	let normalTex = await scene.textureFromRME([1, 0, 0], 1, 1);
	let clearTex = await scene.textureFromRME([0, 1, 0], 1, 1);
	scene.pbrTextures.push(normalTex, clearTex);

	let translucencyTex = await scene.textureFromTPO([1, 0, 2.42 / 4], 1, 1);
	scene.translucencyTextures.push(translucencyTex); // 0

	// Set camera perspective and position.
	[camera.x, camera.y, camera.z] = [0, 3, 0];
	[camera.fx, camera.fy] = [- 2.38, 0.2];

	// Generate plane.
	let plane = scene.Plane([- 50, - 1, - 50], [50, - 1, - 50], [50, - 1, 50], [- 50, - 1, 50], [0, 1, 0]);
	plane.textureNums = [- 1, 0, - 1];

	scene.primaryLightSources = [[40, 50, 40]];
	scene.primaryLightSources[0].intensity = 20000;

	scene.ambientLight = [0.1, 0.1, 0.1];
	
	scene.queue.push(plane);

	// Start render engine.
	engine.renderer.render();

	var obj = await scene.importObj(staticPath + 'objects/bike.obj');
	// obj.scale(5);
	obj.move(20, 0, - 20);
	// obj.staticPermanent = true;
	scene.queue.push(obj);

	// Add FPS counter to top-right corner
	var fpsCounter = document.createElement("div");
	// Append it to body.
	document.body.appendChild(fpsCounter);
	// setTimeout(() => engine.renderer.freeze = true, 1000);
	
	// Update Counter periodically.
	setInterval(() => {
		fpsCounter.textContent = engine.renderer.fps;
	}, 100);
}
