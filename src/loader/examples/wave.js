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
	engine = new FlexLight(canvas);
	engine.io = 'web';

	let camera = engine.camera;
	let scene = engine.scene;
	// Create pbr textures.
	let normal_tex = await scene.textureFromRME([0.7, 1, 0], 1, 1);
	let cuboid_tex = await scene.textureFromRME([0.1, 0, 0.02], 1, 1);
	scene.pbrTextures.push(normal_tex, cuboid_tex);
	// Generate translucency texture for cube.
	let translucencyTex = await scene.textureFromTPO([0, 0, 1.3 / 4], 1, 1);
	scene.translucencyTextures.push(translucencyTex);
	// Set light source.
	scene.primaryLightSources = [[-1, 10, -1]];
	// Modify brightness.
	scene.primaryLightSources[0].intensity = 1000;
	// Generate plane.
	let this_plane = scene.Plane([-100,-1,-100], [100,-1,-100], [100,-1,100], [-100,-1,100]);
  	this_plane.textureNums = [-1, 0, -1];
	// Push both objects to render queue.
	scene.queue.push(this_plane);
	// Set power of 2 square length.
	let sideLength = 2;
	// Set camera perspective and position.
	[camera.x, camera.y, camera.z] = [4 + sideLength, sideLength + 2, 4 + sideLength];
	[camera.fx, camera.fy] = [0.75 * Math.PI, 0.6];
	// transforms and cuboid arrays
	let transforms = [];
	let cuboids = [];
	// assign each pillar a color.
	for (let i = 0; i < sideLength; i++) {
		let rowCuboids = [];
		let rowTransforms = [];
		for (let j = 0; j < sideLength; j++) {
			let transform = scene.Transform();
			let cuboid = scene.Cuboid(i, i + 1, 0, 3.1, j, j + 1);
			rowTransforms.push(transform);
			rowCuboids.push(cuboid);
			cuboid.transform = transform;
			cuboid.color = [Math.random(), Math.random(), Math.random()].map(item => item * 255);
			cuboid.roughness = 0.5;
			// Add to render queue
			scene.queue.push(cuboid);
		}
		cuboids.push(rowCuboids);
		transforms.push(rowTransforms);
	}

	scene.generateBVH();

	// Init iterator variable for simple animations.
	let t = 0;
	setInterval(() => {
		// Increase iterator.
		t += 0.015;
		// Package cuboids together in a shared bounding volume.
		for (let i = 0; i < sideLength; i++) {
			for (let j = 0; j < sideLength; j++) {
				transforms[i][j].move(0, 0.1 + Math.sin(t + i * 0.5 + j), 0);
			}
		}
	}, 100 / 6);

	// Start render engine.
	engine.renderer.render();
	// Add FPS counter to top-right corner.
	var fpsCounter = document.createElement("div");
	// Append it to body.
	document.body.appendChild(fpsCounter);
	// Update Counter periodically.
	setInterval(() => {
		fpsCounter.textContent = engine.renderer.fps;
	}, 100);
}
