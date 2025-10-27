import { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type Edge,
  type Node
} from 'reactflow';
import type { NodeVisionProject } from '../../shared/project-types';

type ProjectChangeMeta = {
  pushHistory?: boolean;
};

const initialNodes: Node[] = [
  {
    id: 'media-input',
    position: { x: 0, y: 80 },
    data: { label: 'MediaInput\n(Assets/clip01.mp4)' },
    type: 'input'
  },
  {
    id: 'exposure',
    position: { x: 240, y: 40 },
    data: { label: 'ExposureAdjust\n(+0.35 EV)' }
  },
  {
    id: 'contrast',
    position: { x: 240, y: 180 },
    data: { label: 'Contrast\n(1.12)' }
  },
  {
    id: 'preview',
    position: { x: 520, y: 120 },
    data: { label: 'PreviewDisplay' },
    type: 'output'
  }
];

const initialEdges: Edge[] = [
  { id: 'media-to-exposure', source: 'media-input', target: 'exposure', animated: true },
  { id: 'media-to-contrast', source: 'media-input', target: 'contrast', animated: true, style: { strokeDasharray: '4 2' } },
  { id: 'merge-to-preview', source: 'exposure', target: 'preview', markerEnd: { type: 'arrowclosed' } },
  { id: 'contrast-to-preview', source: 'contrast', target: 'preview', markerEnd: { type: 'arrowclosed' } }
];

interface NodeGraphCanvasProps {
  project?: NodeVisionProject;
  onProjectChange?: (project: NodeVisionProject, meta?: ProjectChangeMeta) => void;
  onSelectionChange?: (selection: { nodes: string[]; edges: string[] }) => void;
}

export function NodeGraphCanvas({ project, onProjectChange, onSelectionChange }: NodeGraphCanvasProps) {
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);

  const projectSnapshot = useMemo(() => project, [project]);

  const syncProject = useCallback(
    (nextNodes: Node[], nextEdges: Edge[], meta?: ProjectChangeMeta) => {
      if (!projectSnapshot || !onProjectChange) {
        return;
      }

      const nodeLookup = new Map(projectSnapshot.nodes.map((node) => [node.id, node]));

      const updatedEdges = nextEdges.map((edge) => {
        const fromHandle = edge.sourceHandle ? `:${edge.sourceHandle}` : '';
        const toHandle = edge.targetHandle ? `:${edge.targetHandle}` : '';
        return {
          from: `${edge.source}${fromHandle}`,
          to: `${edge.target}${toHandle}`,
          disabled: edge.animated ? true : undefined
        };
      });

      const inputsByNode = new Map<string, Record<string, string>>();
      for (const edge of updatedEdges) {
        const [toNodeId, toPort] = edge.to.split(':');
        if (!toNodeId || !toPort) {
          continue;
        }
        const current = inputsByNode.get(toNodeId) ?? {};
        current[toPort] = edge.from;
        inputsByNode.set(toNodeId, current);
      }

      const updatedNodes = nextNodes.map((flowNode) => {
        const base = nodeLookup.get(flowNode.id);
        const nextPosition = {
          x: flowNode.position.x ?? 0,
          y: flowNode.position.y ?? 0
        };
        if (base) {
          return {
            ...base,
            position: {
              x: nextPosition.x,
              y: nextPosition.y
            },
            inputs: inputsByNode.get(base.id) ?? base.inputs ?? {}
          };
        }

        return {
          id: flowNode.id,
          type:
            typeof flowNode.data?.nodeType === 'string'
              ? flowNode.data.nodeType
              : typeof flowNode.data?.label === 'string'
                ? flowNode.data.label
                : flowNode.id,
          displayName: typeof flowNode.data?.displayName === 'string' ? flowNode.data.displayName : undefined,
          params: isRecord(flowNode.data?.params) ? flowNode.data?.params ?? {} : {},
          inputs: inputsByNode.get(flowNode.id) ?? {},
          outputs: Array.isArray(flowNode.data?.outputs) ? flowNode.data?.outputs : [],
          cachePolicy: undefined,
          position: nextPosition
        };
      });

      const nextProject: NodeVisionProject = {
        ...projectSnapshot,
        nodes: updatedNodes,
        edges: updatedEdges
      };

      onProjectChange(nextProject, meta);
    },
    [onProjectChange, projectSnapshot]
  );

  useEffect(() => {
    if (!project) {
      setNodes(initialNodes.map((node) => ({ ...node, data: { ...node.data } })));
      setEdges(initialEdges.map((edge) => ({ ...edge })));
      return;
    }

    const derivedNodes: Node[] = project.nodes.map((node, index) => {
      const position = node.position ?? {
        x: 220 * (index % 4),
        y: 140 * Math.floor(index / 4)
      };
      const label = node.displayName ? `${node.displayName}\n(${node.type})` : node.type;
      return {
        id: node.id,
        position: {
          x: position.x ?? 0,
          y: position.y ?? 0
        },
        data: {
          label
        },
        type: node.inputs && Object.keys(node.inputs).length === 0 ? 'input' : node.outputs.length === 0 ? 'output' : undefined
      };
    });

    const derivedEdges: Edge[] = project.edges.map((edge, idx) => {
      const [fromNode] = edge.from.split(':');
      const [toNode] = edge.to.split(':');
      return {
        id: `${edge.from}->${edge.to}-${idx}`,
        source: fromNode,
        target: toNode,
        sourceHandle: edge.from.includes(':') ? edge.from.split(':')[1] : undefined,
        targetHandle: edge.to.includes(':') ? edge.to.split(':')[1] : undefined,
        animated: !!edge.disabled,
        markerEnd: { type: 'arrowclosed' },
        style: edge.disabled ? { strokeDasharray: '4 2', opacity: 0.6 } : undefined
      };
    });

    setNodes(derivedNodes);
    setEdges(derivedEdges);
  }, [project, setEdges, setNodes]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const pushHistory = changes.some((change) => {
        if (change.type === 'position') {
          return change.dragging === false;
        }
        return change.type !== 'reset';
      });
      setNodes((current) => {
        const updated = applyNodeChanges(changes, current);
        syncProject(updated, edges, { pushHistory });
        return updated;
      });
    },
    [edges, setNodes, syncProject]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const pushHistory = changes.some((change) => change.type !== 'reset');
      setEdges((current) => {
        const updated = applyEdgeChanges(changes, current);
        syncProject(nodes, updated, { pushHistory });
        return updated;
      });
    },
    [nodes, setEdges, syncProject]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => {
        const updated = addEdge(connection, current);
        syncProject(nodes, updated, { pushHistory: true });
        return updated;
      });
    },
    [nodes, setEdges, syncProject]
  );

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      if (!onSelectionChange) {
        return;
      }
      onSelectionChange({
        nodes: selectedNodes.map((item) => item.id),
        edges: selectedEdges.map((item) => {
          const fromHandle = item.sourceHandle ? `:${item.sourceHandle}` : '';
          const toHandle = item.targetHandle ? `:${item.targetHandle}` : '';
          return `${item.source}${fromHandle}->${item.target}${toHandle}`;
        })
      });
    },
    [onSelectionChange]
  );

  return (
    <div className="graph-container">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onSelectionChange={handleSelectionChange}
        fitView
        minZoom={0.4}
        maxZoom={1.5}
      >
        <Background gap={18} color="#2a2d3a" />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
