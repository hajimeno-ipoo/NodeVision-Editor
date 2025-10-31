import type { Edge, Node } from 'reactflow';

export const DUPLICATE_OFFSET = 36;

export type GraphNodeData = {
  label?: string;
  displayName?: string;
  nodeType?: string;
  params?: Record<string, unknown>;
  outputs?: string[];
};

export type GraphEdgeData = Record<string, unknown>;

export type GraphNode = Node<GraphNodeData>;
export type GraphEdge = Edge<GraphEdgeData>;

export type GraphNodeType = GraphNode['type'];
export type GraphEdgeType = GraphEdge['type'];

export function generateUniqueNodeId(baseId: string, usedIds: Set<string>): string {
  let candidate = baseId;
  if (!usedIds.has(candidate)) {
    usedIds.add(candidate);
    return candidate;
  }

  let suffix = 1;
  candidate = `${baseId}-copy`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-copy-${suffix}`;
  }
  usedIds.add(candidate);
  return candidate;
}

export function generateUniqueEdgeId(baseId: string, usedIds: Set<string>): string {
  let candidate = `${baseId}-copy`;
  if (!usedIds.has(candidate)) {
    usedIds.add(candidate);
    return candidate;
  }

  let suffix = 2;
  candidate = `${baseId}-copy-${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-copy-${suffix}`;
  }
  usedIds.add(candidate);
  return candidate;
}

export interface DuplicateSelectionResult {
  duplicatedNodes: GraphNode[];
  duplicatedEdges: GraphEdge[];
}

export function duplicateSelection(nodes: GraphNode[], edges: GraphEdge[], selectedNodeIds: string[]): DuplicateSelectionResult {
  if (selectedNodeIds.length === 0) {
    return { duplicatedNodes: [], duplicatedEdges: [] };
  }

  const usedNodeIds = new Set(nodes.map((node) => node.id));
  const usedEdgeIds = new Set(edges.map((edge) => edge.id));
  const selectedSet = new Set(selectedNodeIds);
  const nodeIdMap = new Map<string, string>();

  const duplicatedNodes: GraphNode[] = [];
  for (const node of nodes) {
    if (!selectedSet.has(node.id)) {
      continue;
    }
    const nextId = generateUniqueNodeId(node.id, usedNodeIds);
    nodeIdMap.set(node.id, nextId);
    const duplicatedNode: GraphNode = {
      ...node,
      id: nextId,
      position: {
        x: (node.position?.x ?? 0) + DUPLICATE_OFFSET,
        y: (node.position?.y ?? 0) + DUPLICATE_OFFSET
      },
      selected: true
    };
    duplicatedNodes.push(duplicatedNode);
  }

  const duplicatedEdges: GraphEdge[] = [];
  for (const edge of edges) {
    if (!selectedSet.has(edge.source) || !selectedSet.has(edge.target)) {
      continue;
    }
    const mappedSource = nodeIdMap.get(edge.source);
    const mappedTarget = nodeIdMap.get(edge.target);
    if (!mappedSource || !mappedTarget) {
      continue;
    }
    const nextId = generateUniqueEdgeId(edge.id, usedEdgeIds);
    const duplicatedEdge: GraphEdge = {
      ...edge,
      id: nextId,
      source: mappedSource,
      target: mappedTarget,
      selected: true
    };
    duplicatedEdges.push(duplicatedEdge);
  }

  return { duplicatedNodes, duplicatedEdges };
}
