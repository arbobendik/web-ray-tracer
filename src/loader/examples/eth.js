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
	// Create pbr textures.
	let normalTex = await scene.textureFromRME([1, 0, 0], 1, 1);
	scene.pbrTextures.push(normalTex);

	// Set camera perspective and position.
	[camera.x, camera.y, camera.z] = [4.5, 10, -7];
	[camera.fx, camera.fy] = [0, 0.85];

	// Generate plane.
	let plane = scene.Plane([-50,0,-50],[50,0,-50],[50,0,50],[-50,0,50]);
    plane.color = [8, 64, 126];

	let e = scene.Bounding([
		scene.Bounding([
			scene.Bounding([
				scene.Plane([0,1,0],[1,1,0],[2,1,4],[1,1,4]),
				scene.Plane([0,1,0],[0,0,0],[3,0,0],[3,1,0]),
				scene.Plane([4,1,4],[4,0,4],[1,0,4],[1,1,4]),
				scene.Plane([1,0,4],[0,0,0],[0,1,0],[1,1,4]),
				scene.Plane([1,0,0],[2,0,4],[2,1,4],[1,1,0])
			]),
	
			scene.Bounding([
				scene.Plane([1.75,1,3],[1.75,0,3],[4,0,3],[4,1,3]),
				scene.Plane([4,1,3],[4,1,4],[2,1,4],[1.75,1,3])
			]),
		]),
		
		scene.Bounding([
			scene.Bounding([
				scene.Plane([1.375,1,1.5],[1.375,0,1.5],[3.375,0,1.5],[3.375,1,1.5]),
				scene.Plane([3.625,1,2.5],[3.625,0,2.5],[1.625,0,2.5],[1.635,1,2.5]),
				scene.Plane([3.375,1,1.5],[3.625,1,2.5],[1.625,1,2.5],[1.375,1,1.5]),
				scene.Plane([3.375,0,1.5],[3.625,0,2.5],[3.625,1,2.5],[3.375,1,1.5])
			]),

			scene.Bounding([
				scene.Plane([3.25,1,1],[3.25,0,1],[1.25,0,1],[1.25,1,1]),
				scene.Plane([3,1,0],[3.25,1,1],[1.25,1,1],[1,1,0]),
				scene.Plane([3,0,0],[3.25,0,1],[3.25,1,1],[3,1,0])
			])
		])
	]);

	let t = scene.Bounding([
		scene.Bounding([
			scene.Plane([4,1,3],[4,0,3],[7,0,3],[7,1,3]),
			scene.Plane([7,1,4],[7,0,4],[4,0,4],[4,1,4]),
			scene.Plane([7,1,3],[7,1,4],[4,1,4],[4,1,3])
		]),

		scene.Bounding([
			scene.Plane([4,1,0],[5,1,0],[5.75,1,3],[4.75,1,3]),
			scene.Plane([4,1,0],[4,0,0],[5,0,0],[5,1,0]),
			scene.Plane([4.75,0,3],[4,0,0],[4,1,0],[4.75,1,3]),
			scene.Plane([5,0,0],[5.75,0,3],[5.75,1,3],[5,1,0]),
		]),
	]);

	let h = scene.Bounding([
		scene.Bounding([
			scene.Plane([8,1,4],[8,0,4],[7,0,4],[7,1,4]),
			scene.Plane([6,1,0],[7,1,0],[8,1,4],[7,1,4]),
			scene.Plane([6,1,0],[6,0,0],[7,0,0],[7,1,0]),
			scene.Plane([7,0,4],[6,0,0],[6,1,0],[7,1,4]),
			scene.Plane([7,0,0],[8,0,4],[8,1,4],[7,1,0])
		]),

		scene.Bounding([
			scene.Plane([7.375,1,1.5],[7.375,0,1.5],[8.375,0,1.5],[8.375,1,1.5]),
			scene.Plane([8.625,1,2.5],[8.625,0,2.5],[7.625,0,2.5],[7.635,1,2.5]),
			scene.Plane([8.375,1,1.5],[8.625,1,2.5],[7.625,1,2.5],[7.375,1,1.5])
		]),

		scene.Bounding([
			scene.Plane([10,1,4],[10,0,4],[9,0,4],[9,1,4]),
			scene.Plane([8,1,0],[9,1,0],[10,1,4],[9,1,4]),
			scene.Plane([8,1,0],[8,0,0],[9,0,0],[9,1,0]),
			scene.Plane([9,0,4],[8,0,0],[8,1,0],[9,1,4]),
			scene.Plane([9,0,0],[10,0,4],[10,1,4],[9,1,0])
		])
	]);

	let eth = scene.Bounding([e, t, h]);
	eth.textureNums = [-1, 0, -1];

	scene.primaryLightSources = [[40, 50, 40]];
	scene.primaryLightSources[0].intensity = 50000;
	scene.primaryLightSources[0].variation = 20;
	scene.ambientLight = [0.2, 0.2, 0.2];
	
	scene.queue.push(plane, eth);
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