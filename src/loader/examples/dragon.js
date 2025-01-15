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

	// Set camera perspective and position.
	[camera.x, camera.y, camera.z] = [-10, 14, -10];
	[camera.fx, camera.fy] = [- .9, .45];

	// camera.fov = 1;

	scene.primaryLightSources = [[50, 70, 50]];
	scene.primaryLightSources[0].intensity = 50000;
	scene.primaryLightSources[0].variation = 10;
	scene.ambientLight = [0.05, 0.05, 0.05];
	scene.ambientLight = [0.1, 0.1, 0.1];

	// Generate plane.
	let plane = scene.Plane([- 500, - 1, - 500], [500, - 1, - 500], [500, - 1, 500], [- 500, - 1, 500]);
	plane.roughness = 1;
	plane.metallicity = 0.8;
	scene.queue.push(plane);

	let dragonTransform = engine.scene.Transform();
	await dragonTransform.move(15, 0, 15);
	await dragonTransform.scale(0.5);
	var obj = await scene.importObj(staticPath + 'objects/dragon_lp.obj');

	{
		// obj.move(15, 0, 15);
		obj.transform = dragonTransform;
		obj.roughness = 0;
		obj.metallicity = 1;
		obj.translucency = 1;
		obj.ior = 1.5;
		obj.color = [255, 100, 100];
		// obj.staticPermanent = true;
	}
	
	let monkeTransform = engine.scene.Transform();
	await monkeTransform.move(5, 1, 12);
	await monkeTransform.scale(2);

	{
	
		var monke = await scene.importObj(staticPath + 'objects/monke_smooth.obj');
		monke.transform = monkeTransform;
		monke.roughness = 0.1;
		monke.metallicity = 1;
		monke.color = [255, 200, 100];
	}

	{
		var sphere = await scene.importObj(staticPath + 'objects/sphere.obj');
		await sphere.scale(4);
		await sphere.move(15, 3, 0);
		sphere.metallicity = 1;
		sphere.roughness = 0;
		sphere.translucency = 1;
		sphere.ior = 1.5;
	}

	scene.queue.push(obj, monke, sphere);
	var mirror = scene.Bounding([scene.Plane([-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0])]);
	mirror.scale(15);
	await mirror.move(10, 0, 22);
	mirror.metallicity = 1;
	mirror.roughness = 0;
	scene.queue.push(mirror);
	
	var mirror2 = scene.Bounding([scene.Plane([-1, 1, 0], [1, 1, 0], [1, -1, 0], [-1, -1, 0])]);
	mirror2.scale(15);
	await mirror2.move(10, 0, -10);
	mirror2.metallicity = 1;
	mirror2.roughness = 0;
	scene.queue.push(mirror2);
	/*

	var sphere2 = await scene.importObj('objects/sphere.obj');
	sphere2.scale(3);
	await sphere2.move(15, 3, -15);
	sphere2.metallicity = 1;
	sphere2.translucency = 1;
	scene.queue.push(sphere2);
	*/

	await scene.generateBVH();
	await engine.renderer.updateScene();

	console.log(scene.queue);

	// engine.renderer.updateScene();

	let rotationAngle = 0;
	setInterval(() => {
		// dragonTransform.rotate([0, 0, 1], 0.0025);
		///let pos = dragonTransform.position;
		rotationAngle += 0.001;
		// dragonTransform.move(Math.sin(rotationAngle) * 20, 0, Math.cos(rotationAngle) * 20);
		// monkeTransform.move(Math.sin(rotationAngle) * 20, 1, Math.cos(rotationAngle) * 20);
		// dragonTransform.rotateSpherical(rotationAngle, 0);
		
		let diff = Math.diff([camera.x, camera.y, camera.z], monkeTransform.position);
		let r = Math.length(diff);
		let theta = Math.sign(diff[2]) * Math.acos(diff[0] / Math.sqrt(diff[0] * diff[0] + diff[2] * diff[2])) - Math.PI * 0.5;
		let psi = Math.acos(diff[1] / r) - Math.PI * 0.5;
		monkeTransform.rotateSpherical(theta, psi);
		/*
		diff = Math.diff([camera.x, camera.y, camera.z], dragonTransform.position);
		r = Math.length(diff);
		theta = Math.sign(diff[2]) * Math.acos(diff[0] / Math.sqrt(diff[0] * diff[0] + diff[2] * diff[2])) - Math.PI;
		psi = Math.acos(diff[1] / r);
		dragonTransform.rotateSpherical(theta, 0);
		*/

	}, 1000 / 330);
	// Add FPS counter to top-right corner
	var fpsCounter = document.createElement("div");
	// Append it to body.
	document.body.appendChild(fpsCounter);
	// Update Counter periodically.
	setInterval(() => fpsCounter.textContent = engine.renderer.fps, 1000);
}
