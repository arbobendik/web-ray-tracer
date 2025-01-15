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
    // Create pbr textures.
    let normal_tex = await scene.textureFromRME([0.3, 1, 0], 1, 1);
    scene.pbrTextures.push(normal_tex);
    // Set camera perspective and position.
    [camera.position.x, camera.position.y, camera.position.z] = [-12, 5, -18];
    [camera.direction.x, camera.direction.y] = [-0.440, 0.235];
    // Generate plane.
    let thisPlane = scene.Plane([-100, -1, -100], [100, -1, -100], [100, -1, 100], [-100, -1, 100], [0, 1, 0]);
    thisPlane.textureNums = [-1, -1, -1];
    // Generate a few cuboids on the planes with bounding box.
    let r = [
        scene.Cuboid(-1.5, 4.5, -1, 2, 1.5, 2.5),
        scene.Cuboid(-1.5, 1.5, -1, 2, -2, -1),
        scene.Cuboid(0.5, 1.5, -1, 2, -1, 0),
        scene.Cuboid(-1.5, -0.5, -1, 2, -1, 0)
    ];
    // Color all cuboids in center.
    for (let i = 0; i < 4; i++) {
        r[i].color = [Math.random() * 255, Math.random() * 255, Math.random() * 255];
        r[i].textureNums = [-1, 0, -1];
    }
    // Spawn cube.
    let cube = scene.Cuboid(5.5, 6.5, 1.5, 2.5, 5.5, 6.5);
    // Package cube and cuboids together in a shared bounding volume.
    let objects = [r, cube];
    scene.primaryLightSources = new Array(8);
    scene.primaryLightSources[0] = [0, 10, 0];
    scene.primaryLightSources[0].intensity = 50;
    scene.primaryLightSources[2] = [10, 30, 10];
    scene.primaryLightSources[3] = [-10, 30, 10];
    scene.primaryLightSources[4] = [10, 30, -10];
    scene.primaryLightSources[5] = [-10, 30, -10];
    scene.primaryLightSources[6] = [30, 30, 30];
    scene.primaryLightSources[7] = [-30, 30, -30];
    // Set intensities
    for (let i = 2; i < 8; i++)
        scene.primaryLightSources[i].intensity = 200;
    // Test many lightsources
    for (let i = 8; i < 8; i++) {
        scene.primaryLightSources[i] = [-300 + i * 10, 300, -300];
        scene.primaryLightSources[i].intensity = 50;
    }
    // Push both objects to render queue.
    scene.queue.push(thisPlane, objects);
    // Start render engine.
    engine.renderer.render();
    // Add FPS counter to top-right corner.
    var fpsCounter = document.createElement("div");
    // Append it to body.
    document.body.appendChild(fpsCounter);
    // Update Counter periodically.
    setInterval(function () {
        fpsCounter.textContent = engine.renderer.fps;
    }, 100);
    // init iterator variable for simple animations
    let iterator = 0;
    setInterval(() => {
        // increase iterator
        iterator += 0.01;
        // precalculate sin and cos
        let [sin, cos] = [Math.sin(iterator), Math.cos(iterator)];
        // animate light sources
        scene.primaryLightSources[1] = [20 * sin, 8, 20 * cos];
        scene.primaryLightSources[1].intensity = 1000;
        engine.renderer.updatePrimaryLightSources();
        // move element
        r[0].move(0.05 * sin, 0, 0);
    }, 100 / 6);
}
