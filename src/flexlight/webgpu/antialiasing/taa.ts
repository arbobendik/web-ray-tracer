'use strict';

import { Matrix, Vector, vector_scale } from '../../common/lib/math';
import { AntialiasingModule } from './antialiasing-module';
import { WebGPUAntialiasingType } from '../../../flexlight';
// Ignore all shader imports, the bundler will handle them as intended.
// @ts-ignore
import TAAShader from '../shaders/taa.wgsl';

const FRAMES = 4;

export class TAA extends AntialiasingModule {
    readonly type: WebGPUAntialiasingType = "taa";
    private pipeline: GPUComputePipeline;
    private texture: GPUTexture | undefined;
    private device: GPUDevice;
    private canvas: HTMLCanvasElement;
    private frameIndex = 0;

    private randomVecs: Matrix<4, 2>;
    private bindGroupLayout: GPUBindGroupLayout;
    private bindGroup: GPUBindGroup | undefined;
    private uniformBuffer: GPUBuffer;

    constructor(device: GPUDevice, canvas: HTMLCanvasElement) {
        super();
        this.device = device;
        this.canvas = canvas;
        this.randomVecs = this.genPseudoRandomVecsWith0Sum(FRAMES);

        this.bindGroupLayout = device.createBindGroupLayout({
            entries: [
              { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float', viewDimension: '2d-array' } },
              { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba32float', viewDimension: '2d' } },
              { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }
            ]
        });
        
        // Create pipeline
        this.pipeline = device.createComputePipeline({
            label: "taa pipeline",
            layout: device.createPipelineLayout({ bindGroupLayouts: [ this.bindGroupLayout ] }),
            compute: {
                module: device.createShaderModule({ code: TAAShader }),
                entryPoint: "compute"
            }
        });

        this.uniformBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        this.createTexture();
    }

    get textureInView(): GPUTextureView | undefined {
        return this.texture?.createView({ dimension: "2d", baseArrayLayer: this.frameIndex, arrayLayerCount: 1 });
    }

    get textureInView2dArray(): GPUTextureView | undefined {
        return this.texture?.createView({ dimension: "2d-array", baseArrayLayer: this.frameIndex, arrayLayerCount: 1 });
    }

    createTexture = () => {
        // Create texture
        this.texture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height, FRAMES],
            format: 'rgba32float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | 
                   GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC
        });
    };

    createBindGroup = (textureOut: GPUTexture) => {
        if (!this.texture) throw new Error("Texture not created. Attempting to create bind group.");

        this.bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: this.texture?.createView({ dimension: "2d-array", arrayLayerCount: FRAMES }) },
                { binding: 1, resource: textureOut.createView() },
                { binding: 2, resource: { buffer: this.uniformBuffer }}
            ]
        });
    };

    renderFrame = async (commandEncoder: GPUCommandEncoder) => {
        // Cycle through random vecs
        this.frameIndex = (this.frameIndex + 1) % FRAMES;
        const taaParams = new Float32Array([
            this.frameIndex,
            FRAMES,
            this.randomVecs[this.frameIndex]!.x,
            this.randomVecs[this.frameIndex]!.y
        ]);

        this.device.queue.writeBuffer(this.uniformBuffer, 0, taaParams);
        // Rotate textures
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.pipeline);
        computePass.setBindGroup(0, this.bindGroup);

        // Dispatch workgroups (32x32 threads per workgroup)
        const workgroupsX = Math.ceil(this.canvas.width / 8);
        const workgroupsY = Math.ceil(this.canvas.height / 8);
        computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
        computePass.end();
    }

    // Jitter and genPseudoRandomVecsWith0Sum methods remain the same
    jitter = (): Vector<2> => {
        // Cycle through random vecs
        let frameIndex = (this.frameIndex + 1) % FRAMES;
        // Scaling factor
        let scale = 0.3 / Math.min(this.canvas.width, this.canvas.height);
        // Return as easy to handle 2-dimensional vector
        return vector_scale(this.randomVecs[frameIndex]!, scale);
    }

    // Generate n d-dimensional pseudo random vectors that all add up to 0.
    genPseudoRandomVecsWith0Sum<N extends number>(n: N): Matrix<N, 2> {
        const vecs = new Matrix<N, 2>({ matrix_height: n, matrix_width: 2 });
        // Only move forward if we have more than 2 vectors
        if (n <= 2) return vecs;
        // Generate first two vectors
        vecs[0] = new Vector<2>(0, 1);
        vecs[1] = new Vector<2>(1, 0);
        const combined = new Vector<2>(1, 1);
        
        for (let i = 2; i < n; i++) {
            for (let j = 0; j < 2; j++) {
                const min = Math.max(- Math.min(i + 1, n - 1 - i), combined[j]! - 1);
                const max = Math.min(Math.min(i + 1, n - 1 - i), combined[j]! + 1);
                vecs[i]![j] = 0.5 * ((max + min) + (max - min) * Math.sign(Math.random() - 0.5) * (Math.random() * 0.5) ** (1 / 2)) - combined[j]!;
                combined[j]! += vecs[i]![j]!;
            }
        }

        return vecs;
    }
}