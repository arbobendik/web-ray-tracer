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
	engine = new FlexLight(canvas);
	engine.io = 'web';

	let camera = engine.camera;
	let scene = engine.scene;
	// Upload texture to GPU
	[
		staticPath + "textures/holz.jpg",     // 0
	].forEach(item => {
		let img = new Image();
	  img.src = item;
	  scene.textures.push(img);
	});
  // Change raytracer internal texture size
  scene.standardTextureSizes = [512, 512];
	// Create 2 pbr metallic textures.
	let roughTex = await scene.textureFromRME([1, 0.3, 0], 1, 1);
  	let smoothTex = await scene.textureFromRME([0.4, 0.2, 0], 1, 1);
  	let backMirrorTex = await scene.textureFromRME([
		new Array(11).fill([1, 0.1, 0]).flat(),
		new Array(10).fill([0, 0.5, 0]).flat(), [1, 0.1, 0],
		new Array(11).fill([1, 0.1, 0]).flat(),
  	].flat(), 11, 3);
	scene.pbrTextures.push(roughTex, smoothTex, backMirrorTex);

	scene.translucencyTextures.push(await scene.textureFromTPO([1, 0, 0.6], 1, 1));
	// Move camera out of center.
	camera.x = 35;
	camera.y = 35;
	camera.z = -53;
	camera.fx = 0.47;
	camera.fy = 0.44;
	// Set primary light source.
	scene.primaryLightSources = [
		[-58.03, 26, 7.5], [-58.03, 26, -10.5],
		[43.03, 26, 0], [43.03, 26, -11.5],
		[-20, 26, -40], [-10, 26, -40], [0, 26, -40], [10, 26, -40], [20, 26, -40]
	];
	// Set ambientLight to 0.
	scene.ambientLight = [0, 0, 0];
	// Modify brightness.
  	for (let i = 0; i < 9; i++) scene.primaryLightSources[i].intensity = 1000;
	// Generate side planes of box.
	let bottom_plane = scene.Plane([-43.03, 0, -28], [43.03, 0, -28], [43.03, 0, 27.28], [-43.03, 0, 27.28]);
  	let back_plane = scene.Plane([-24.5, 0, 27.28], [24.5, 0, 27.28], [24.5, 22, 27.28], [-24.5, 22, 27.28]);
  	let left_plane = scene.Plane([-43.03, 0, 0], [-24.5, 0, 27.28], [-24.5, 22, 27.28], [-43.03, 22, 0]);
  	let right_plane = scene.Plane([43.03, 0, 0], [43.03, 22, 0], [24.5, 22, 27.28], [24.5, 0, 27.28]);

  	// Make planes diffuse.
	bottom_plane.textureNums = [0, 1, -1];
	back_plane.textureNums = [-1, 2, -1];
	left_plane.textureNums = [-1, 0, -1];
	right_plane.textureNums = [-1, 0, -1];

	// Create cube in center.
	let cube = scene.Cuboid(-3, 3, 0, 17, 2, 8);
	cube.color = [255, 80, 120];

	let box = [
		bottom_plane, back_plane, left_plane, right_plane,
    	cube,
	];
	// Push both objects to render queue.
	scene.queue.push(box);
	// Start render engine.
	engine.renderer.render();

	// Add FPS counter to top-right corner.
	var fpsCounter = document.createElement("div");
	// Append it to body.
	document.body.appendChild(fpsCounter);
	// Update Counter periodically.
	setInterval(async function(){
		fpsCounter.textContent = engine.renderer.fps;
	}, 100);
}
