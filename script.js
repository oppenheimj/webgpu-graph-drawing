import { getCircleVertexArray, getEdges, getRandomNodePositions } from './helpers.js';

const UPDATE_INTERVAL_MS = 1;
const WORKGROUP_SIZE = 256;
const N_NODES = 1000;

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("No appropriate GPUAdapter found.");
}
const device = await adapter.requestDevice(); 
const canvas = document.querySelector("canvas");
const context = canvas.getContext("webgpu");
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device: device,
  format: canvasFormat,
});


// CIRCLE VERTICES
const [vertexArray, indexArray] = getCircleVertexArray(8);
const vertexBuffer = device.createBuffer({
  label: "Circle vertices",
  size: vertexArray.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
const vertexBufferLayout = {
  arrayStride: 8,
  attributes: [{
    format: "float32x2",
    offset: 0,
    shaderLocation: 0,
  }],
};
device.queue.writeBuffer(vertexBuffer, 0, vertexArray);
const indexBuffer = device.createBuffer({
  label: "Circle indices",
  size: indexArray.byteLength,
  usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(indexBuffer, 0, indexArray);


// NODE POSITIONS
const nodePositionArray = getRandomNodePositions(N_NODES);
const nodePositionBufferA = device.createBuffer({
  label: "Node Position Buffer A",
  size: nodePositionArray.byteLength,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(nodePositionBufferA, 0, nodePositionArray);
const nodePositionBufferB = device.createBuffer({
  label: "Node Position Buffer B",
  size: nodePositionArray.byteLength,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});


// EDGES
const [edgeArray, inEdgeArray, lineDataArray] = getEdges(N_NODES);
const edgeBuffer = device.createBuffer({
  label: "Edge Buffer",
  size: edgeArray.byteLength,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(edgeBuffer, 0, edgeArray);
const inEdgeBuffer = device.createBuffer({
  label: "IN Edge Buffer",
  size: inEdgeArray.byteLength,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(inEdgeBuffer, 0, inEdgeArray);
const lineDataBuffer = device.createBuffer({
  label: "Edge Drawing Buffer",
  size: lineDataArray.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
const lineBufferLayout = {
  arrayStride: 4,
  attributes: [{
    format: "uint32",
    offset: 0,
    shaderLocation: 0,
  }],
};
device.queue.writeBuffer(lineDataBuffer, 0, lineDataArray);


// SHADERS
const lineShaderModule = device.createShaderModule({
  label: "Line shader",
  code: `
  @group(0) @binding(0) var<storage> nodePosition: array<vec2f>;

  @vertex
  fn vertexMain(@location(0) pos: u32) -> @builtin(position) vec4f {
    return vec4f(nodePosition[pos], 0, 1);
  }

  @fragment
  fn fragmentMain(@builtin(position) input: vec4f) -> @location(0) vec4f {
    return vec4f(1, 1, 1, 1);
  }
  `
});

const nodeShaderModule = device.createShaderModule({
  label: "Node shader",
  code: `
  @group(0) @binding(0) var<storage> nodePosition: array<vec2f>;

  struct VertexInput {
    @location(0) pos: vec2f,
    @builtin(instance_index) instance: u32,
  };

  struct VertexOutput {
    @builtin(position) pos: vec4f,
  };

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    let i = input.instance;
    let pos = (input.pos / 150);

    var output: VertexOutput;
    output.pos = vec4f(pos + nodePosition[i], 0, 1);
    return output;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    return vec4f(1, 1, 0, 1);
  }
  `
});

const simulationShaderModule = device.createShaderModule({
  label: "Simulation shader",
  code: `
  @group(0) @binding(0) var<storage> positionPing: array<vec2f>;
  @group(0) @binding(1) var<storage, read_write> positionPong: array<vec2f>;
  @group(0) @binding(2) var<storage> edges: array<u32>;
  @group(0) @binding(3) var<storage> inEdges: array<vec2u>;

  @compute
  @workgroup_size(${WORKGROUP_SIZE})
  fn computeMain(@builtin(global_invocation_id) global_id: vec3u) {
    let idx = global_id.x;
  
    if (idx > arrayLength(&positionPing)) {
      return;
    }

    var force = vec2f(0, 0);

    for (var i: u32 = 0; i < arrayLength(&positionPing); i++) {
      if (i == idx) {
        continue;
      }
      var repulsionForce = positionPing[idx] - positionPing[i];
      repulsionForce = normalize(repulsionForce) / pow(length(repulsionForce), 2);
      force += repulsionForce * 0.0000001;
    }

    for (var i: u32 = inEdges[idx].x; i < inEdges[idx].x + inEdges[idx].y; i++) {
      var attractionForce = positionPing[edges[i]] - positionPing[idx];
      attractionForce = normalize(attractionForce) * pow(length(attractionForce), 2);
      force += attractionForce;
    }

    let clampValue = 0.005f;
    force = clamp(force, vec2f(-clampValue, -clampValue), vec2f(clampValue, clampValue));

    positionPong[idx] = positionPing[idx] + force;
  }
  `
});


// LINE PIPELINE
const lineBindGroupLayout = device.createBindGroupLayout({
  label: "Line Bind Group Layout",
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX,
      buffer: { type: "read-only-storage" }
    },
  ]
});

const lineBindGroups = [
  device.createBindGroup({
    label: "Line Bind Group A",
    layout: lineBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: nodePositionBufferA }
      },
    ],
  }),
  device.createBindGroup({
    label: "Line Bind Group B",
    layout: lineBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: nodePositionBufferB }
      },
    ],
  })
]

const linePipelineLayout = device.createPipelineLayout({
  label: "Line Pipeline Layout",
  bindGroupLayouts: [lineBindGroupLayout],
});

const linePipeline = device.createRenderPipeline({
  label: "Line pipeline",
  layout: linePipelineLayout,
  vertex: {
    module: lineShaderModule,
    entryPoint: "vertexMain",
    buffers: [lineBufferLayout]
  },
  fragment: {
    module: lineShaderModule,
    entryPoint: "fragmentMain",
    targets: [{
      format: canvasFormat
    }],
  },
  primitive:{
    topology: 'line-list'
  }
});


// NODE PIPELINE
const nodeBindGroupLayout = device.createBindGroupLayout({
  label: "Node Bind Group Layout",
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
      buffer: { type: "read-only-storage" }
    },
    {
      binding: 1,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'storage' }
    },
    {
      binding: 2,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "read-only-storage" }
    },
    {
      binding: 3,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "read-only-storage" }
    },
  ]
});

const nodeBindGroups = [
  device.createBindGroup({
    label: "Node Bind Group A",
    layout: nodeBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: nodePositionBufferA }
      },
      {
        binding: 1,
        resource: { buffer: nodePositionBufferB }
      },
      {
        binding: 2,
        resource: { buffer: edgeBuffer }
      },
      {
        binding: 3,
        resource: { buffer: inEdgeBuffer }
      }
    ],
  }),
  device.createBindGroup({
    label: "Node Bind Group B",
    layout: nodeBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: nodePositionBufferB }
      },
      {
        binding: 1,
        resource: { buffer: nodePositionBufferA }
      },
      {
        binding: 2,
        resource: { buffer: edgeBuffer }
      },
      {
        binding: 3,
        resource: { buffer: inEdgeBuffer }
      }
    ],
  })
]

const nodePipelineLayout = device.createPipelineLayout({
  label: "Node Pipeline Layout",
  bindGroupLayouts: [nodeBindGroupLayout],
});

const nodePipeline = device.createRenderPipeline({
  label: "Node pipeline",
  layout: nodePipelineLayout,
  vertex: {
    module: nodeShaderModule,
    entryPoint: "vertexMain",
    buffers: [vertexBufferLayout]
  },
  fragment: {
    module: nodeShaderModule,
    entryPoint: "fragmentMain",
    targets: [{
      format: canvasFormat
    }],
  }
});


// SIMULATION PIPELINE
const simulationPipeline = device.createComputePipeline({
  label: "Simulation pipeline",
  layout: nodePipelineLayout,
  compute: {
    module: simulationShaderModule,
    entryPoint: "computeMain",
  }
});

let step = 0;

function update() {
  const encoder = device.createCommandEncoder();

  const computePass = encoder.beginComputePass();
  computePass.setPipeline(simulationPipeline);
  computePass.setBindGroup(0, nodeBindGroups[step % 2]);
  const workgroupCount = Math.ceil(N_NODES / WORKGROUP_SIZE);
  computePass.dispatchWorkgroups(workgroupCount);
  computePass.end();

  step++;

  if (step % 1 == 0) {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: "clear",
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        storeOp: "store",
      }]
    });

    pass.setPipeline(linePipeline);
    pass.setBindGroup(0, lineBindGroups[step % 2]);
    pass.setVertexBuffer(0, lineDataBuffer);
    pass.draw(lineDataArray.length);
  
    pass.setPipeline(nodePipeline);
    pass.setBindGroup(0, nodeBindGroups[step % 2]);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');
    pass.drawIndexed(indexArray.length, N_NODES);

    pass.end();
  }

  device.queue.submit([encoder.finish()]);
}

setInterval(update, UPDATE_INTERVAL_MS);