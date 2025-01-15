"use strict";

import { AntialiasingModule } from './antialiasing-module';
import { WebGPUAntialiasingType } from '../../../flexlight';
// Ignore all shader imports, the bundler will handle them as intended.
// @ts-ignore
import FXAAShader from '../shaders/fxaa.wgsl';

export class FXAA extends AntialiasingModule {
    readonly type: WebGPUAntialiasingType = "fxaa";
    private pipeline: GPUComputePipeline | undefined;
    private texture: GPUTexture | undefined;
    private device: GPUDevice;
    private canvas: HTMLCanvasElement;
    private bindGroupLayout: GPUBindGroupLayout;
    private bindGroup: GPUBindGroup | undefined;
    private uniformBuffer: GPUBuffer;

    constructor(device: GPUDevice, canvas: HTMLCanvasElement) {
        super();
        this.device = device;
        this.canvas = canvas;
        
        this.bindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba32float", viewDimension: "2d" } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }
            ]
        });

        this.uniformBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Create initial texture
        this.createTexture();
    }

    get textureInView(): GPUTextureView | undefined {
        return this.texture?.createView({ dimension: "2d" });
    }

    get textureInView2dArray(): GPUTextureView | undefined {
        return this.texture?.createView({ dimension: "2d-array", arrayLayerCount: 1 });
    }

    createTexture = () => {
        // Free old texture buffers
        try {
            this.texture?.destroy();
        } catch {}
        // Create texture for FXAA input
        this.texture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height, 1],
            format: "rgba32float",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | 
                   GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC
        });
    };

    createBindGroup = (textureOut: GPUTexture) => {
        if (!this.texture) throw new Error("Texture not created. Attempting to create bind group.");

        this.bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: this.texture.createView() },
                { binding: 1, resource: textureOut.createView() },
                { binding: 2, resource: { buffer: this.uniformBuffer }}
            ]
        });

        // Create pipeline
        this.pipeline = this.device.createComputePipeline({
            label: "fxaa pipeline",
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [ this.bindGroupLayout ] }),
            compute: {
                module: this.device.createShaderModule({ code: FXAAShader }),
                entryPoint: "compute"
            }
        });


        const fxaaParams = new Float32Array([
            1.0 / 16.0,
            1.0 / 4.0,
            1.0 / 4.0
        ]);

        this.device.queue.writeBuffer(this.uniformBuffer, 0, fxaaParams);
    };

    renderFrame = (commandEncoder: GPUCommandEncoder) => {
        if (!this.pipeline) throw new Error("Pipeline not created. Attempting to render frame.");
        if (!this.bindGroup) throw new Error("Bind group not created. Attempting to render frame.");

        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.pipeline);
        computePass.setBindGroup(0, this.bindGroup);

        // Dispatch workgroups (32x32 threads per workgroup)
        const workgroupsX = Math.ceil(this.canvas.width / 8);
        const workgroupsY = Math.ceil(this.canvas.height / 8);
        computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
        computePass.end();
    }
}
