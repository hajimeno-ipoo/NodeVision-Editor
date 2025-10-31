import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type Edge as FlowEdge,
  type Node as FlowNode
} from 'reactflow';
import type { NodeVisionProject } from '../../shared/project-types.js';
import { duplicateSelection, generateUniqueNodeId } from '../utils/graph.js';

type ProjectChangeMeta = {
  pushHistory?: boolean;
};

const initialNodes: FlowNode[] = [
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

const initialEdges: FlowEdge[] = [
  { id: 'media-to-exposure', source: 'media-input', target: 'exposure', animated: true },
  { id: 'media-to-contrast', source: 'media-input', target: 'contrast', animated: true, style: { strokeDasharray: '4 2' } },
  { id: 'merge-to-preview', source: 'exposure', target: 'preview', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'contrast-to-preview', source: 'contrast', target: 'preview', markerEnd: { type: MarkerType.ArrowClosed } }
];

type QuickMenuContext = 'canvas' | 'node';

interface QuickMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  context: QuickMenuContext;
  nodeId?: string;
}

interface NodeGraphCanvasProps {
  project?: NodeVisionProject;
  onProjectChange?: (project: NodeVisionProject, meta?: ProjectChangeMeta) => void;
  onSelectionChange?: (selection: { nodes: string[]; edges: string[] }) => void;
}

export function NodeGraphCanvas({ project, onProjectChange, onSelectionChange }: NodeGraphCanvasProps) {
  const [nodes, setNodes] = useNodesState<FlowNode>(initialNodes);
  const [edges, setEdges] = useEdgesState<FlowEdge>(initialEdges);
  const reactFlowInstance = useReactFlow<FlowNode, FlowEdge>();
  const [selectedElements, setSelectedElements] = useState<{ nodes: FlowNode[]; edges: FlowEdge[] }>({ nodes: [], edges: [] });
  const [quickMenu, setQuickMenu] = useState<QuickMenuState>({ isOpen: false, x: 0, y: 0, context: 'canvas' });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const quickMenuRef = useRef<HTMLDivElement | null>(null);

  const projectSnapshot = useMemo(() => project, [project]);

  const syncProject = useCallback(
    (nextNodes: FlowNode[], nextEdges: FlowEdge[], meta?: ProjectChangeMeta) => {
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
          const displayName =
            typeof flowNode.data?.displayName === 'string' && flowNode.data.displayName.trim().length > 0
              ? flowNode.data.displayName
              : base.displayName;
          return {
            ...base,
            displayName,
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

    const derivedNodes: FlowNode[] = project.nodes.map((node, index): FlowNode => {
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
      } satisfies FlowNode;
    });

    const derivedEdges: FlowEdge[] = project.edges.map((edge, idx): FlowEdge => {
      const [fromNode] = edge.from.split(':');
      const [toNode] = edge.to.split(':');
      return {
        id: `${edge.from}->${edge.to}-${idx}`,
        source: fromNode,
        target: toNode,
        sourceHandle: edge.from.includes(':') ? edge.from.split(':')[1] : undefined,
        targetHandle: edge.to.includes(':') ? edge.to.split(':')[1] : undefined,
        animated: !!edge.disabled,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: edge.disabled ? { strokeDasharray: '4 2', opacity: 0.6 } : undefined
      } satisfies FlowEdge;
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
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: FlowNode[]; edges: FlowEdge[] }) => {
      if (!onSelectionChange) {
        setSelectedElements({ nodes: selectedNodes, edges: selectedEdges });
        return;
      }
      setSelectedElements({ nodes: selectedNodes, edges: selectedEdges });
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

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tagName = target.tagName;
      return target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const hasSelection = selectedElements.nodes.length > 0 || selectedElements.edges.length > 0;

      if ((event.key === 'Delete' || event.key === 'Backspace') && hasSelection) {
        event.preventDefault();
        const nodesToRemove = new Set(selectedElements.nodes.map((node) => node.id));
        const edgesToRemove = new Set(selectedElements.edges.map((edge) => edge.id));

        if (nodesToRemove.size === 0 && edgesToRemove.size === 0) {
          return;
        }

        const filteredNodes = nodes.filter((node) => !nodesToRemove.has(node.id));
        const filteredEdges = edges.filter(
          (edge) => !edgesToRemove.has(edge.id) && !nodesToRemove.has(edge.source) && !nodesToRemove.has(edge.target)
        );

        setNodes(filteredNodes);
        setEdges(filteredEdges);
        syncProject(filteredNodes, filteredEdges, { pushHistory: true });
        setSelectedElements({ nodes: [], edges: [] });
        if (onSelectionChange) {
          onSelectionChange({ nodes: [], edges: [] });
        }
        setQuickMenu((state) => (state.isOpen ? { ...state, isOpen: false } : state));
        return;
      }

      if ((event.key === 'd' || event.key === 'D') && (event.metaKey || event.ctrlKey) && selectedElements.nodes.length > 0) {
        event.preventDefault();
        const selectedIds = selectedElements.nodes.map((node) => node.id);
        const duplicationResult = duplicateSelection(nodes, edges, selectedIds);
        if (duplicationResult.duplicatedNodes.length === 0) {
          return;
        }

        const nextNodes = [...nodes, ...duplicationResult.duplicatedNodes];
        const nextEdges = [...edges, ...duplicationResult.duplicatedEdges];

        setNodes(nextNodes);
        setEdges(nextEdges);
        syncProject(nextNodes, nextEdges, { pushHistory: true });
        setSelectedElements({ nodes: duplicationResult.duplicatedNodes, edges: duplicationResult.duplicatedEdges });
        if (onSelectionChange) {
          onSelectionChange({
            nodes: duplicationResult.duplicatedNodes.map((node) => node.id),
            edges: duplicationResult.duplicatedEdges.map((edge) => {
              const fromHandle = edge.sourceHandle ? `:${edge.sourceHandle}` : '';
              const toHandle = edge.targetHandle ? `:${edge.targetHandle}` : '';
              return `${edge.source}${fromHandle}->${edge.target}${toHandle}`;
            })
          });
        }
        setQuickMenu((state) => (state.isOpen ? { ...state, isOpen: false } : state));
      }
    };

    const handleQuickMenuKey = (event: KeyboardEvent) => {
      if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault();
        const bounds = containerRef.current?.getBoundingClientRect();
        const x = bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2;
        const y = bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2;
        const context: QuickMenuContext = selectedElements.nodes.length > 0 ? 'node' : 'canvas';
        const nodeId = selectedElements.nodes[0]?.id;
        setQuickMenu({ isOpen: true, x, y, context, nodeId });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keydown', handleQuickMenuKey);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleQuickMenuKey);
    };
  }, [edges, onSelectionChange, selectedElements.edges, selectedElements.nodes, setEdges, setNodes, syncProject]);

  const edgeOptions = useMemo(
    () => ({
      type: 'smoothstep' as const,
      animated: false,
      style: {
        stroke: '#9d8cff',
        strokeWidth: 2
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#c4b5fd'
      }
    }),
    []
  );

  const connectionLineStyle = useMemo(
    () => ({
      stroke: '#f97316',
      strokeWidth: 2.6,
      strokeDasharray: '8 4'
    }),
    []
  );

  const openQuickMenu = useCallback((x: number, y: number, context: QuickMenuContext, nodeId?: string) => {
    setQuickMenu({ isOpen: true, x, y, context, nodeId });
  }, []);

  const closeQuickMenu = useCallback(() => {
    setQuickMenu((state) => (state.isOpen ? { ...state, isOpen: false } : state));
  }, []);

  const handlePaneContextMenu = useCallback(
    (event: ReactMouseEvent | ReactPointerEvent) => {
      event.preventDefault();
      openQuickMenu(event.clientX, event.clientY, 'canvas');
    },
    [openQuickMenu]
  );

  const handleNodeContextMenu = useCallback(
    (event: ReactMouseEvent, node: FlowNode) => {
      event.preventDefault();
      openQuickMenu(event.clientX, event.clientY, 'node', node.id);
    },
    [openQuickMenu]
  );

  const handleAddNodeAt = useCallback(
    (clientX: number, clientY: number) => {
      const bounds = containerRef.current?.getBoundingClientRect();
      const projected = bounds
        ? reactFlowInstance.project({ x: clientX - bounds.left, y: clientY - bounds.top })
        : { x: clientX, y: clientY };

      const usedIds = new Set(nodes.map((node) => node.id));
      const newId = generateUniqueNodeId('node', usedIds);
      const displayName = `Node ${newId}`;
      const newNode: FlowNode = {
        id: newId,
        position: {
          x: projected.x,
          y: projected.y
        },
        data: {
          label: displayName,
          displayName,
          nodeType: 'CustomNode'
        },
        selected: true
      } satisfies FlowNode;

      const nextNodes = [...nodes, newNode];
      setNodes(nextNodes);
      syncProject(nextNodes, edges, { pushHistory: true });
      setSelectedElements({ nodes: [newNode], edges: [] });
      if (onSelectionChange) {
        onSelectionChange({ nodes: [newNode.id], edges: [] });
      }
    },
    [edges, nodes, onSelectionChange, reactFlowInstance, setNodes, syncProject]
  );

  const handleEditNodeLabel = useCallback(
    (nodeId: string | undefined) => {
      if (!nodeId) {
        return;
      }
      const currentNode = nodes.find((node) => node.id === nodeId);
      const currentLabel =
        typeof currentNode?.data?.displayName === 'string'
          ? currentNode.data.displayName
          : typeof currentNode?.data?.label === 'string'
            ? currentNode.data.label
            : '';
      const nextLabel = window.prompt('ノードのラベルを入力してください', currentLabel ?? '');
      if (nextLabel === null) {
        return;
      }
      const trimmed = nextLabel.trim();
      if (trimmed.length === 0) {
        return;
      }

      setNodes((currentNodes) => {
        const nextNodes = currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  label: trimmed,
                  displayName: trimmed
                }
              }
            : node
        );
        syncProject(nextNodes, edges, { pushHistory: true });
        return nextNodes;
      });
    },
    [edges, nodes, setNodes, syncProject]
  );

  const handleQuickAction = useCallback(
    (action: 'add-node' | 'edit-label') => {
      if (action === 'add-node') {
        handleAddNodeAt(quickMenu.x, quickMenu.y);
      } else if (action === 'edit-label') {
        handleEditNodeLabel(quickMenu.nodeId);
      }
      closeQuickMenu();
    },
    [closeQuickMenu, handleAddNodeAt, handleEditNodeLabel, quickMenu.nodeId, quickMenu.x, quickMenu.y]
  );

  useEffect(() => {
    if (!quickMenu.isOpen) {
      return;
    }

    const handleGlobalClick = (event: MouseEvent) => {
      if (!quickMenuRef.current) {
        return;
      }
      const target = event.target instanceof globalThis.Node ? event.target : null;
      if (!target || !quickMenuRef.current.contains(target)) {
        closeQuickMenu();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeQuickMenu();
      }
    };

    window.addEventListener('mousedown', handleGlobalClick);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closeQuickMenu, quickMenu.isOpen]);

  return (
    <div className="graph-container" ref={containerRef}>
      <ReactFlow
        className="graph-flow"
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onSelectionChange={handleSelectionChange}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        defaultEdgeOptions={edgeOptions}
        connectionLineStyle={connectionLineStyle}
        panOnScroll
        selectionOnDrag
        attributionPosition="bottom-right"
        fitView
        minZoom={0.4}
        maxZoom={1.5}
      >
        <Background gap={18} color="#2a2d3a" />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
      </ReactFlow>
      {quickMenu.isOpen ? (
        <div
          ref={quickMenuRef}
          className="graph-quick-menu"
          style={{ top: quickMenu.y, left: quickMenu.x }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" onClick={() => handleQuickAction('add-node')}>
            ノード追加
          </button>
          {quickMenu.context === 'node' ? (
            <button type="button" onClick={() => handleQuickAction('edit-label')}>
              ラベル編集
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
