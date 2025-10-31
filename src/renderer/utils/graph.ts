import type { Edge, Node } from 'reactflow';

export const DUPLICATE_OFFSET = 36;

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
  duplicatedNodes: Node[];
  duplicatedEdges: Edge[];
}

export function duplicateSelection(nodes: Node[], edges: Edge[], selectedNodeIds: string[]): DuplicateSelectionResult {
  if (selectedNodeIds.length === 0) {
    return { duplicatedNodes: [], duplicatedEdges: [] };
  }

  const usedNodeIds = new Set(nodes.map((node) => node.id));
  const usedEdgeIds = new Set(edges.map((edge) => edge.id));
  const selectedSet = new Set(selectedNodeIds);
  const nodeIdMap = new Map<string, string>();

  const duplicatedNodes = nodes
    .filter((node) => selectedSet.has(node.id))
    .map((node) => {
      const nextId = generateUniqueNodeId(node.id, usedNodeIds);
      nodeIdMap.set(node.id, nextId);
      return {
        ...node,
        id: nextId,
        position: {
          x: (node.position?.x ?? 0) + DUPLICATE_OFFSET,
          y: (node.position?.y ?? 0) + DUPLICATE_OFFSET
        },
        selected: true,
        data: {
          ...node.data
        }
      } satisfies Node;
    });

  const duplicatedEdges = edges
    .filter((edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target))
    .map((edge) => {
      const mappedSource = nodeIdMap.get(edge.source);
      const mappedTarget = nodeIdMap.get(edge.target);
      if (!mappedSource || !mappedTarget) {
        return null;
      }
      const nextId = generateUniqueEdgeId(edge.id, usedEdgeIds);
      return {
        ...edge,
        id: nextId,
        source: mappedSource,
        target: mappedTarget,
        selected: true,
        data: {
          ...edge.data
        }
      } satisfies Edge;
    })
    .filter((edge): edge is Edge => edge !== null);

  return { duplicatedNodes, duplicatedEdges };
}
