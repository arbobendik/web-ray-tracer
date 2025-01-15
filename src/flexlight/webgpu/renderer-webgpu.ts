"use strict";

import { ApiType, Renderer } from "../common/renderer";
import { Scene } from "../common/scene/scene";
import { Camera } from "../common/scene/camera";
import { Config } from "../common/config";
import { Vector } from "../common/lib/math";


export interface WebGPUReferences {
    context: GPUCanvasContext;
    device: GPUDevice;
}

export abstract class RendererWGPU extends Renderer {
    readonly api: ApiType = "webgpu";

    // Track if engine is running
    protected isRunning: boolean = false;

    constructor(scene: Scene, canvas: HTMLCanvasElement, camera: Camera, config: Config) {
        super(scene, canvas, camera, config);
        // Check for WebGPU support first by seeing if navigator.gpu even exists
        if (!navigator.gpu) throw new Error("WebGPU not supported");
    }
    
    protected async requestWebGPUReferences(): Promise<WebGPUReferences> {
        let context = this.canvas.getContext("webgpu");
        if (!context) throw new Error("Failed to get webgpu context");
        let adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("Failed to request adapter");
        let device = await adapter.requestDevice();
        return { context, device };
    }

    protected createRenderPipeline (device: GPUDevice, code: string, label: string, ...bindGroupLayouts: Array<GPUBindGroupLayout>) {
        const module = device.createShaderModule({ code });
        return device.createRenderPipeline({
            label: label,
            layout: device.createPipelineLayout({ bindGroupLayouts: bindGroupLayouts }),
            // Vertex shader
            vertex: { module: module, entryPoint: "vertex" },
            // Fragment shader
            fragment: { module: module, entryPoint: "fragment", targets: [{ format: "rgba8unorm" }] },
            // Culling config
            primitive: { topology: "triangle-list", cullMode: "back" }
        });
    }

    protected createComputePipeline (device: GPUDevice, code: string, label: string, ...bindGroupLayouts: Array<GPUBindGroupLayout>) {
        const module = device.createShaderModule({ code });
        return device.createComputePipeline({
            label: label,
            layout: device.createPipelineLayout({ bindGroupLayouts: bindGroupLayouts }),
            compute: { module: module, entryPoint: "compute" }
        });
    }

    protected runRasterPipeline(
        commandEncoder: GPUCommandEncoder,
        pipeline: GPURenderPipeline,
        renderPassDescriptor: GPURenderPassDescriptor,
        triangleCount: number, ...renderGroups: Array<GPUBindGroup>
    ) {
        // All rendering commands happen in a render pass
        const encoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        // Set the pipeline to use when drawing
        encoder.setPipeline(pipeline);
        // Set storage buffers for rester pass
        renderGroups.forEach((group, index) => {
            encoder.setBindGroup(index, group);
        });
        // Draw vertices using the previously set pipeline
        encoder.draw(3, triangleCount);
        // End the render pass
        encoder.end();
    }

    protected runComputePipeline(
        commandEncoder: GPUCommandEncoder,
        pipeline: GPUComputePipeline,
        ...renderGroups: Array<GPUBindGroup>
    ) {
        const clusterDims: Vector<2> = new Vector(Math.ceil(this.canvas.width / 8), Math.ceil(this.canvas.height / 8));
         // Run compute shader
        const encoder = commandEncoder.beginComputePass();
        // Set the storage buffers and textures for compute pass
        encoder.setPipeline(pipeline);
        renderGroups.forEach((group, index) => {
            encoder.setBindGroup(index, group);
        });
        encoder.dispatchWorkgroups(clusterDims.x, clusterDims.y);
        // End compute pass
        encoder.end();
    }
}
