"use strict";

import { Camera } from "../common/scene/camera";
import { Vector, vector_add, vector_hadamard, vector_scale } from "../common/lib/math";

export type IoType = "web";

const translationMap: Map<string, Vector<3>> = new Map([
	["right", new Vector(1, 0, 0)],
	["left", new Vector(-1, 0, 0)],
	["down", new Vector(0, -1, 0)],
	["up", new Vector(0, 1, 0)],
	["backward", new Vector(0, 0, -1)],
	["forward", new Vector(0, 0, 1)]
]);

// Generate a new io object
export class WebIo {
	private isListening: boolean = false;
	// time stamp to measure time since last frame in milliseconds
	private lastTimeMillis: number = 0;
	// Map of keys to movement vectors
  	private keyMap: Map<string, Vector<3>> = new Map();
	// Map of keys to press state
	private pressedKeys: Map<string, boolean> = new Map();
	// Current movement vector
	private movement: Vector<3> = new Vector(0, 0, 0);

	// Mouse movement sensitivity and general movement speed
	mouseX: number = 4;
	mouseY: number = 2;
	movementSpeed: number = 0.01;

	camera: Camera;

	constructor (canvas: HTMLCanvasElement, camera: Camera) {
		this.registerKey("KeyW", "forward");
		this.registerKey("KeyA", "left");
		this.registerKey("KeyS", "backward");
		this.registerKey("KeyD", "right");
		this.registerKey("Space", "up");
		this.registerKey("ShiftLeft", "down");
		this.camera = camera;
		this.setupForCanvas(canvas);
		requestAnimationFrame(this.frame);
	}

	private registerKey = (key: string, value: string) => {
		this.keyMap.set(key, translationMap.get(value) ?? new Vector(0, 0, 0));
		this.pressedKeys.set(key, false);
	}

	private frame = () => {
		this.updatePosition(performance.now());
		requestAnimationFrame(this.frame);
	}

	private updatePosition = (time: number) => {
		if (!this.isListening) return;
		const position: Vector<3> = this.camera.position;
		const direction: Vector<2> = this.camera.direction;
		const difference = (time - this.lastTimeMillis) * this.movementSpeed;
		position.x += difference * (this.movement.x * Math.cos(direction.x) - this.movement.z * Math.sin(direction.x));
		position.y += difference * this.movement.y;
		position.z += difference * (this.movement.z * Math.cos(direction.x) + this.movement.x * Math.sin(direction.x));
		// Update last time stamp
		this.lastTimeMillis = time;
	}

	// Reset all pressed keys
	// resetMovement = () => { for (const key in this.pressedKeys) this.pressedKeys.set(key, false) };

	// Update the movement vector
	private updateMovement = (value: Vector<3>) => this.movement = vector_add(this.movement, value);

	private setupForCanvas = (canvas: HTMLCanvasElement) => {
		// Make canvas focusable
		canvas.tabIndex = 0;
		// Request pointer lock when canvas is focused
		canvas.onfocus = () => { canvas.requestPointerLock(); };
		// Listen for pointer lock change
		document.onpointerlockchange = (event) => {
			// Toggle listening state
			this.isListening = !this.isListening;
			// If listening, update last time stamp to event time stamp
			if (this.isListening) {
				// If not listening, reset movement and blur canvas
				this.lastTimeMillis = event.timeStamp;
			} else {
				// Unfocus canvas
				canvas.blur();
			}
		};

		canvas.onkeydown = (event) => {
			if (event.code in this.pressedKeys) {
				// If key is already pressed, do nothing
				if (this.pressedKeys.get(event.code)) return;
				// Update position
				this.updatePosition(event.timeStamp);
				// Set key pressed state
				this.pressedKeys.set(event.code, true);
				// Update movement vector
				this.updateMovement(this.keyMap.get(event.code) ?? new Vector(0, 0, 0));
			}
		};

		canvas.onkeyup = (event) => {
			if (event.code in this.pressedKeys && this.pressedKeys.get(event.code)) {
				// If key is not pressed, do nothing
				if (!this.pressedKeys.get(event.code)) return;
				// Update position
				this.updatePosition(event.timeStamp);
				// Set key pressed state
				this.pressedKeys.set(event.code, false);
				// Update movement vector
				this.updateMovement(vector_scale(this.keyMap.get(event.code) ?? new Vector(0, 0, 0), -1));
			}
		};

		// Control camera direction with mouse
		canvas.onmousemove = (event) => {
			if (!this.isListening) return;
			const speed: Vector<2> = new Vector(this.mouseX / canvas.width, this.mouseY / canvas.height);
			const movement: Vector<2> = vector_hadamard(speed, new Vector(event.movementX, event.movementY));
			this.camera.direction.x -= movement.x;
			// Clamp y direction to be within -pi and pi
			if (2 * Math.abs(this.camera.direction.y + movement.y) < Math.PI) this.camera.direction.y += movement.y;
		};
	}
}
