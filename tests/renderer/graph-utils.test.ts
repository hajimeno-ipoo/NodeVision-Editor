import { describe, expect, it } from 'vitest';
import {
  duplicateSelection,
  generateUniqueEdgeId,
  generateUniqueNodeId,
  type GraphEdge,
  type GraphNode,
  type GraphNodeData
} from '../../src/renderer/utils/graph.js';

function createNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {} as GraphNodeData,
    ...overrides
  };
}

function createEdge(id: string, source: string, target: string, overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id,
    source,
    target,
    ...overrides
  };
}

describe('graph utils', () => {
  it('generates unique node identifiers', () => {
    const used = new Set<string>(['node', 'node-copy', 'node-copy-2']);
    const next = generateUniqueNodeId('node', used);
    expect(next).toBe('node-copy-3');
    expect(used.has('node-copy-3')).toBe(true);
  });

  it('returns base node identifier when unused', () => {
    const used = new Set<string>(['existing']);
    const next = generateUniqueNodeId('fresh-node', used);
    expect(next).toBe('fresh-node');
  });

  it('generates unique edge identifiers', () => {
    const used = new Set<string>(['edge-copy', 'edge-copy-2']);
    const next = generateUniqueEdgeId('edge', used);
    expect(next).toBe('edge-copy-3');
    expect(used.has('edge-copy-3')).toBe(true);
  });

  it('duplicateSelection returns empty result when nothing selected', () => {
    const nodes: GraphNode[] = [createNode('a'), createNode('b')];
    const edges: GraphEdge[] = [createEdge('edge-a-b', 'a', 'b')];
    const result = duplicateSelection(nodes, edges, []);
    expect(result.duplicatedNodes).toHaveLength(0);
    expect(result.duplicatedEdges).toHaveLength(0);
  });

  it('duplicates selected nodes and internal edges', () => {
    const nodes: GraphNode[] = [
      createNode('a', { position: { x: 10, y: 10 }, data: { label: 'Node A' } as GraphNodeData }),
      createNode('b', { position: { x: 50, y: 50 }, data: { label: 'Node B' } as GraphNodeData }),
      createNode('c', { position: { x: 90, y: 90 }, data: { label: 'Node C' } as GraphNodeData })
    ];
    const edges: GraphEdge[] = [
      createEdge('edge-a-b', 'a', 'b'),
      createEdge('edge-b-c', 'b', 'c'),
      createEdge('edge-c-a', 'c', 'a')
    ];

    const { duplicatedNodes, duplicatedEdges } = duplicateSelection(nodes, edges, ['a', 'b']);

    expect(duplicatedNodes).toHaveLength(2);
    const duplicatedIds = duplicatedNodes.map((node) => node.id);
    expect(duplicatedIds.every((id) => id.startsWith('a-copy') || id.startsWith('b-copy'))).toBe(true);
    expect(duplicatedNodes.every((node) => node.selected)).toBe(true);

    expect(duplicatedEdges).toHaveLength(1);
    const duplicatedEdge = duplicatedEdges[0];
    expect(duplicatedEdge.source.startsWith('a-copy')).toBe(true);
    expect(duplicatedEdge.target.startsWith('b-copy')).toBe(true);
    expect(duplicatedEdge.selected).toBe(true);
  });

  it('skips edges that do not connect duplicated nodes', () => {
    const nodes: GraphNode[] = [createNode('solo'), createNode('other')];
    const edges: GraphEdge[] = [createEdge('edge', 'solo', 'other')];
    const { duplicatedNodes, duplicatedEdges } = duplicateSelection(nodes, edges, ['solo']);
    expect(duplicatedNodes).toHaveLength(1);
    expect(duplicatedEdges).toHaveLength(0);
  });

  it('skips edges pointing to non-existent selections', () => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [createEdge('ghost', 'ghost', 'ghost')];
    const { duplicatedNodes, duplicatedEdges } = duplicateSelection(nodes, edges, ['ghost']);
    expect(duplicatedNodes).toHaveLength(0);
    expect(duplicatedEdges).toHaveLength(0);
  });

  it('defaults duplicate positions when original coordinates missing', () => {
    const nodes: GraphNode[] = [
      createNode('floating', {
        // force undefined coordinates to exercise fallback branches
        position: { x: undefined as unknown as number, y: undefined as unknown as number }
      })
    ];
    const edges: GraphEdge[] = [];
    const { duplicatedNodes } = duplicateSelection(nodes, edges, ['floating']);
    expect(duplicatedNodes).toHaveLength(1);
    expect(duplicatedNodes[0].position).toEqual({ x: 36, y: 36 });
  });
});
