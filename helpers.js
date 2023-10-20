export function getCircleVertexArray(nPts) {
  const vertexArray = new Float32Array((1 + nPts) * 2);
  vertexArray[0] = 0;
  vertexArray[1] = 0;
  for (let i = 0; i < nPts; ++i) {
    let angle = (Math.PI * 2) / nPts * i;
    vertexArray[2 + 2 * i] = Math.cos(angle);
    vertexArray[2 + 2 * i + 1] = Math.sin(angle);
  }

  const indexArray = new Uint32Array(3 * nPts);
  for (let i = 0; i < nPts; ++i) {
    indexArray[3 * i] = 0;
    indexArray[3 * i + 1] = i + 1;
    indexArray[3 * i + 2] = i == nPts - 1 ? 1 : i + 2;
  }

  return [vertexArray, indexArray];
}

// https://en.wikipedia.org/wiki/Preferential_attachment
export function getEdges(n) {
  let x = [0];
  let edges = [[]];
  let lineData = [];

  for (let i = 1; i < n; i++) {
    let j = x[Math.floor(Math.random() * x.length)];
    lineData.push(i);
    lineData.push(j);
    x.push(i);
    x.push(j);
    edges[i] = [j];
    edges[j].push(i);
  }

  const lineDataArray = new Uint32Array(lineData);
  const edgeArray = new Uint32Array((n - 1) * 2);
  const inEdgeArray = new Uint32Array(2 * n);
  let edgeArrayIdx = 0;

  edges.forEach((edgeList, idx) => {
    let i = edgeArrayIdx;
    let n = edgeList.length;
    edgeList.forEach(edge => {
      edgeArray[edgeArrayIdx] = edge;
      edgeArrayIdx++;
    })
    inEdgeArray[idx * 2] = i;
    inEdgeArray[idx * 2 + 1] = n;
  });

  return [edgeArray, inEdgeArray, lineDataArray];
}

export function getRandomNodePositions(n) {
  const nodePositionArray = new Float32Array(2 * n);
  for (let i = 0; i < n; ++i) {
    nodePositionArray[2 * i] = Math.random() - 0.5;
    nodePositionArray[2 * i + 1] = Math.random() - 0.5;
  }
  return nodePositionArray;
}