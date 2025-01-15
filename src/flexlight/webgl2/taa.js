
'use strict';

import { GLLib } from "../webgl2/renderer.js";
import TAAShader from '../webgl2/shaders/taa.glsl';

const FRAMES = 9;

export class TAA {
    textureIn;

    #program;
    #tex = new Array (FRAMES);
    #textures = new Array (FRAMES);
    #vao;
    #vertexBuffer;
    #gl;
    #canvas;
    frameIndex = 0;
    #randomVecs;

    constructor (gl, canvas) {
        this.#gl = gl;
        this.#canvas = canvas;
        // Compile shaders and link them into program
        this.#program = GLLib.compile (gl, GLLib.postVertex, TAAShader);
        // Create post program buffers and uniforms
        this.#vao = gl.createVertexArray();
        this.textureIn = gl.createTexture();
        gl.bindVertexArray(this.#vao);
        gl.useProgram(this.#program);

        for (let i = 0; i < FRAMES; i++) this.#textures[i] = gl.createTexture();
        for (let i = 0; i < FRAMES; i++) this.#tex[i] = gl.getUniformLocation(this.#program, 'cache' + i);

        this.#vertexBuffer = gl.createBuffer();

        gl.bindBuffer(gl.ARRAY_BUFFER, this.#vertexBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        // Fill buffer with data for two verices
        gl.bindBuffer(gl.ARRAY_BUFFER, this.#vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from([0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0]), gl.DYNAMIC_DRAW);
        
        this.createTexture();

        // Generate pseudo random vectors to prevent shaking.
        this.#randomVecs = this.genPseudoRandomVecsWith0Sum(FRAMES);
    }

    createTexture = () => {
        this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.textureIn);
        this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA, this.#canvas.width, this.#canvas.height, 0, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, null);
        GLLib.setTexParams(this.#gl);
        
        for (let i = 0; i < FRAMES; i++) {
            this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#textures[i]);
            this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA, this.#canvas.width, this.#canvas.height, 0, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, null);
            GLLib.setTexParams(this.#gl);
        }
    };  
    
    renderFrame = () => {
        // Cycle through random vecs
        this.frameIndex = (this.frameIndex + 1) % FRAMES;
        // Rotate textures, delete last, add new
        this.#textures.unshift(this.textureIn);
        this.textureIn = this.#textures.pop();
        // Render to canvas now
        this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, null);
        for (let i = 0; i < FRAMES; i++) {
            // Make pre rendered texture TEXTUREI
            this.#gl.activeTexture(this.#gl.TEXTURE0 + i);
            this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#textures[i]);
        }
        // Switch program and vao
        this.#gl.useProgram(this.#program);
        this.#gl.bindVertexArray(this.#vao);
        // Pass pre rendered texture to shader
        for (let i = 0; i < FRAMES; i++) this.#gl.uniform1i(this.#tex[i], i);
        // Post processing drawcall
        this.#gl.drawArrays(this.#gl.TRIANGLES, 0, 6);
    }

    jitter = () => {
        // Cycle through random vecs
        let frameIndex = (this.frameIndex + 1) % FRAMES;
        // Scaling factor
        let scale = 0.3 / Math.min(this.#canvas.width, this.#canvas.height);
        // Return as easy to handle 2-dimensional vector
        return { x: this.#randomVecs[frameIndex][0] * scale, y: this.#randomVecs[frameIndex][1] * scale};
    }

    // Generate n d-dimensional pseudo random vectors that all add up to 0.
    genPseudoRandomVecsWith0Sum = (n) => {
        let vecs = new Array(n).fill(0).map(() => new Array(2));
        vecs[0] = [0, 1];
        vecs[1] = [1, 0];
        let combined = [1, 1];
        
        for (let i = 2; i < n; i++) {
            for (let j = 0; j < 2; j++) {
                let min = Math.max(- Math.min(i + 1, n - 1 - i), combined[j] - 1);
                let max = Math.min(Math.min(i + 1, n - 1 - i), combined[j] + 1);
                vecs[i][j] = 0.5 * ((max + min) + (max - min) * Math.sign(Math.random() - 0.5) * (Math.random() * 0.5) ** (1 / 2)) - combined[j];
                combined[j] += vecs[i][j];
            }
        }

        return vecs;
    }
}