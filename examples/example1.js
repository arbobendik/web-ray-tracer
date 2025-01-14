"use strict";
// Declare engine global
var engine;
// Create new canvas
var canvas = document.createElement("canvas");
// Append it to body
document.body.appendChild(canvas);
// Create new engine object for canvas
engine = new FlexLight (canvas);
engine.io = 'web';

let camera = engine.camera;
let scene = engine.scene;
// Set Textures 0, 1, 2, 3, 4
[
	"textures/dirt_side.jpg",	// 0
	"textures/grass.jpg",		// 1
	"textures/dirt.jpeg",		// 2
	"textures/redstone.png",	// 3
	"textures/lamp.jpg"			// 4
].forEach((item, i) => {
	let img = new Image();
	img.src = item;
	scene.textures.push(img);
});

[
	"textures/redstone_pbr.png",	// 0
	"textures/normal.png"			// 1
].forEach((item, i) => {
	let img = new Image();
	img.src = item;
	scene.pbrTextures.push(img);
});

// Set camera perspective and position
[camera.x, camera.y, camera.z] = [8, 7, -11];
[camera.fx, camera.fy] = [0.440, 0.55];

scene.primaryLightSources = [[0.5, 1.5, 0.5], [0, 15, 2]];
// Make light dimmer (default = 200)
scene.primaryLightSources[0].intensity = 400;
scene.primaryLightSources[0].variation = 0.2;
scene.primaryLightSources[1].intensity = 300;
// Set ambient illumination
scene.ambientLight = [0.1, 0.1, 0.1];

// Set texture Sizes
scene.standardTextureSizes = [16, 16];

// Create large ground plane
let groundPlane = scene.Plane([-10,-1,-10],[10,-1,-10],[10,-1,10],[-10,-1,10],[0,1,0]);
groundPlane.textureNums = [-1, 1, -1];
scene.queue.push(groundPlane);

// Generate a few translucent cuboids on surface
let cuboids = [
	scene.Cuboid(-1.5, 4.5, -1, 2, 1.5, 2.5),
	scene.Cuboid(-1.5, 1.5, -1, 2, -2, -1),
	scene.Cuboid(0.5, 1.5, -1, 2, -1, 0),
	scene.Cuboid(-1.5, -0.5, -1, 2, - 1, 0)
];

let cuboidColors = [
	// [255, 255, 255],
	[230, 170, 0],
	[0, 150, 150],
	[150, 0, 100],
	[0, 0, 200]
]

// Color all cuboid in center
cuboids.forEach((cuboid, i) => {
	cuboid.roughness = 0;
	cuboid.metallicity = .5;
	cuboid.translucency = 1;
	cuboid.ior = 1.3;
	cuboid.color = cuboidColors[i];
	// Append to render-queue
	scene.queue.push(cuboid);
});


let grassCubes = [
	scene.Cuboid(5.5, 6.5, 1.5, 2.5, 5.8, 6.8),
	scene.Cuboid(-3, -2, -1, 0, -5.2, -4.2)
];


grassCubes.forEach(cube => {
	cube.textureNums = [0, -1, -1];
	cube.top.textureNums = [1, -1, -1];
	cube.bottom.textureNums = [2, -1, -1];
	scene.queue.push(cube);
});

// Create diffuse white "wall" cuboid
scene.queue.push(scene.Cuboid(2.5, 7.5, -1, 1.5, 5, 7));
// Spawn red cube on top of "wall"
let redCube = scene.Cuboid(4, 5, 1.5, 2.5, 5.2, 6.2);
redCube.textureNums = [3, 0, -1];
scene.queue.push(redCube);
// Spawn lantern on the floor
let lantern = scene.Cuboid(-2.5, -1.5, -1, 0, -3.8, -2.8);
lantern.textureNums = [4, -1, -1];
lantern.metallicity = 1;
lantern.emissiveness = 2;
scene.queue.push(lantern);
/*
let recreateBVH = (subTree) => {
	let list = [];
	let disasembleGraph = (item) => {
		if (item.static) {
			list.push(item);
		} else if (Array.isArray(item) || item.indexable) {
			if (item.length === 0) return;
			for (let i = 0; i < item.length; i++) disasembleGraph(item[i]);
		} else {
			list.push(item);
		}
	}

	disasembleGraph(subTree);
	let newSubTree = scene.generateBVH(list);
	
	for (let i = 0; i < Math.max(subTree.length, newSubTree.length); i++) {
		if (i < newSubTree.length) {
			subTree[i] = newSubTree[i];
		} else {
			// Dereference old children of subtree
			subTree[i] = undefined;
		}
	}
}
recreateBVH(scene.queue);
*/
scene.generateBVH();
// start render engine
engine.renderer.render();
// engine.renderer.fpsLimit = 30;
// add FPS counter to top-right corner
var fpsCounter = document.createElement("div");
// append it to body
document.body.appendChild(fpsCounter);
// update frame-counter periodically
setInterval(function(){
	fpsCounter.textContent = engine.renderer.fps;
}, 1000);
