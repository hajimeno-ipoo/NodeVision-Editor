from __future__ import annotations

import json
from pathlib import Path
from typing import Any, List, Literal, Optional, NamedTuple
from base64 import b64encode
from datetime import datetime
from io import BytesIO

import math
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

RESAMPLE_LANCZOS = getattr(getattr(Image, "Resampling", Image), "LANCZOS", Image.BICUBIC)

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, ValidationError, ConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_VERSION = "0.2.0"
DEFAULT_PROJECT_SLOT = "latest"
STORAGE_DIR = PROJECT_ROOT / "storage"
BENCH_LOG_PATH = PROJECT_ROOT / "tmp" / "preview_bench.log"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


class HealthResponse(BaseModel):
  status: Literal["ok"]
  service: str
  version: str


class InfoResponse(BaseModel):
  name: str
  description: str
  backendVersion: str
  endpoints: list[str]


class NodeCatalogItem(BaseModel):
  nodeId: str
  displayName: str
  category: str
  inputs: list[str] = Field(default_factory=list)
  outputs: list[str] = Field(default_factory=list)


class ProjectSummary(BaseModel):
  nodes: int
  edges: int
  assets: int
  fps: float
  colorSpace: str
  schemaVersion: str


class NodePosition(BaseModel):
  x: float | None = None
  y: float | None = None


class ProjectNode(BaseModel):
  id: str
  type: str
  displayName: str | None = None
  params: dict[str, Any] = Field(default_factory=dict)
  inputs: dict[str, Any] = Field(default_factory=dict)
  outputs: list[str] = Field(default_factory=list)
  cachePolicy: str | None = None
  position: NodePosition | None = None


class ProjectEdge(BaseModel):
  from_: str = Field(alias="from")
  to: str
  disabled: bool | None = None

  model_config = ConfigDict(populate_by_name=True)


class ProjectAsset(BaseModel):
  id: str
  path: str
  hash: str
  proxyPath: str | None = None
  colorSpace: str | None = None
  bitDepth: int | None = None


class ProjectPayload(BaseModel):
  schemaVersion: str
  mediaColorSpace: str
  projectFps: float
  projectResolution: dict[str, Any] | None = None
  nodes: list[ProjectNode] = Field(default_factory=list)
  edges: list[ProjectEdge] = Field(default_factory=list)
  assets: list[ProjectAsset] = Field(default_factory=list)
  metadata: dict[str, Any] = Field(default_factory=dict)


class ProjectSaveRequest(BaseModel):
  project: ProjectPayload
  slot: str | None = Field(default=DEFAULT_PROJECT_SLOT)


class ProjectSaveResponse(BaseModel):
  slot: str
  path: str
  summary: ProjectSummary


class ProjectLoadRequest(BaseModel):
  slot: str | None = Field(default=DEFAULT_PROJECT_SLOT)


class ProjectLoadResponse(BaseModel):
  slot: str
  path: str
  project: ProjectPayload
  summary: ProjectSummary


class ValidationIssue(BaseModel):
  path: str
  message: str
  type: str


class PreviewSourceInfo(BaseModel):
  width: int
  height: int


class PreviewProxyInfo(BaseModel):
  enabled: bool
  width: int
  height: int
  scale: float
  reason: str
  averageDelayMs: float | None = None
  targetDelayMs: float | None = None


class PreviewResponse(BaseModel):
  imageBase64: str
  width: int
  height: int
  source: PreviewSourceInfo
  proxy: PreviewProxyInfo
  generatedAt: str


class PreviewGenerateRequest(BaseModel):
  project: ProjectPayload
  forceProxy: bool | None = None


class ProxyDecision(NamedTuple):
  enabled: bool
  scale: float
  reason: str
  average_delay_ms: float | None
  target_delay_ms: float


def parse_float(value: Any) -> float | None:
  try:
    result = float(value)
  except (TypeError, ValueError):
    return None
  if not math.isfinite(result):
    return None
  return result


def clamp_scale(value: Any, default: float = 0.5) -> float:
  parsed = parse_float(value)
  if parsed is None:
    return default
  return min(max(parsed, 0.1), 1.0)


def compute_latency_target(width: int, height: int) -> float:
  width = max(width, 1)
  height = max(height, 1)
  if width >= 2560 or height >= 1440:
    return 250.0
  return 150.0


def compute_preview_latency_average(width: int, height: int) -> float | None:
  if not BENCH_LOG_PATH.exists():
    return None

  target_profile = f"{width}x{height}"
  delays: list[float] = []

  try:
    with BENCH_LOG_PATH.open("r", encoding="utf-8") as fh:
      for raw_line in fh:
        line = raw_line.strip()
        if not line:
          continue
        parts = line.split(",")
        if len(parts) != 3:
          continue
        tag, profile, value = parts
        if tag != "PREVIEW_DELAY":
          continue
        base_profile = profile.split("_", 1)[0]
        if base_profile != target_profile:
          continue
        parsed = parse_float(value)
        if parsed is None:
          continue
        delays.append(parsed)
  except OSError:
    return None

  if not delays:
    return None

  return sum(delays) / len(delays)


def compute_proxy_decision(
  project: ProjectPayload,
  width: int,
  height: int,
  force_proxy: bool | None,
) -> ProxyDecision:
  target_delay = compute_latency_target(width, height)
  metadata = project.metadata or {}
  proxy_metadata: dict[str, Any] = {}
  if isinstance(metadata, dict):
    candidate = metadata.get("previewProxy")
    if isinstance(candidate, dict):
      proxy_metadata = candidate

  default_scale = clamp_scale(proxy_metadata.get("scale"), 0.5)

  if force_proxy is True:
    return ProxyDecision(True, default_scale, "client_force_on", None, target_delay)
  if force_proxy is False:
    return ProxyDecision(False, 1.0, "client_force_off", None, target_delay)

  forced = is_proxy_forced(project)
  if forced is True:
    return ProxyDecision(True, default_scale, "project_metadata_on", None, target_delay)
  if forced is False:
    return ProxyDecision(False, 1.0, "project_metadata_off", None, target_delay)

  width = max(width, 1)
  height = max(height, 1)

  if width >= 3840 or height >= 2160:
    return ProxyDecision(True, min(default_scale, 0.5), "resolution_4k", None, target_delay)
  if width >= 2560 or height >= 1440:
    return ProxyDecision(True, min(default_scale, 0.5), "resolution_qhd", None, target_delay)

  average_delay = compute_preview_latency_average(width, height)
  if average_delay is not None and average_delay > target_delay:
    return ProxyDecision(True, min(default_scale, 0.5), "historical_delay", average_delay, target_delay)

  return ProxyDecision(False, 1.0, "auto", average_delay, target_delay)


def load_media_image(
  project: ProjectPayload,
  media_node: ProjectNode,
  asset_map: dict[str, ProjectAsset],
) -> Image.Image:
  params = media_node.params or {}
  candidate_strings: list[str] = []
  media_path = params.get("path")
  if isinstance(media_path, str) and media_path:
    candidate_strings.append(media_path)

  asset: ProjectAsset | None = None
  asset_id = params.get("assetId")
  if isinstance(asset_id, str):
    asset = asset_map.get(asset_id)

  if asset is None and isinstance(media_path, str):
    for candidate_asset in asset_map.values():
      if candidate_asset.path == media_path:
        asset = candidate_asset
        break

  if asset is not None:
    if isinstance(asset.path, str):
      candidate_strings.append(asset.path)
    if isinstance(asset.proxyPath, str):
      candidate_strings.append(asset.proxyPath)

  candidates: list[Path] = []
  for candidate in candidate_strings:
    item = Path(candidate)
    if item not in candidates:
      candidates.append(item)
    cwd_candidate = Path.cwd() / candidate
    if cwd_candidate not in candidates:
      candidates.append(cwd_candidate)
    project_candidate = PROJECT_ROOT / candidate
    if project_candidate not in candidates:
      candidates.append(project_candidate)

  image: Image.Image | None = None
  for candidate in candidates:
    if not candidate.exists() or not candidate.is_file():
      continue
    try:
      with Image.open(candidate) as loaded:
        image = loaded.convert("RGB")
      break
    except OSError:
      continue
  if image is None:
    fallback_width, fallback_height = extract_resolution(project)
    width = max(int(params.get("placeholderWidth") or fallback_width), 64)
    height = max(int(params.get("placeholderHeight") or fallback_height), 64)
    image = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(image)
    for y in range(height):
      ratio = y / max(height - 1, 1)
      r = int(48 + 96 * ratio)
      g = int(80 + 100 * (1 - ratio))
      b = int(120 + 50 * math.sin(ratio * math.pi))
      draw.line((0, y, width, y), fill=(r, g, b))
    placeholder_font = ImageFont.load_default()
    label = media_node.displayName or params.get("path") or params.get("assetId") or "Media Placeholder"
    draw.rectangle((0, 0, width, 36), fill=(20, 26, 46, 192))
    draw.text((12, 12), str(label), fill="#f5f7ff", font=placeholder_font)
  return image


def extract_resolution(project: ProjectPayload) -> tuple[int, int]:
  width = 1920
  height = 1080
  if project.projectResolution and isinstance(project.projectResolution, dict):
    width = int(project.projectResolution.get("width") or width)
    height = int(project.projectResolution.get("height") or height)
  return max(width, 1), max(height, 1)


def is_proxy_forced(project: ProjectPayload) -> bool | None:
  metadata = project.metadata or {}
  if isinstance(metadata, dict):
    preview_proxy = metadata.get("previewProxy")
    if isinstance(preview_proxy, dict) and "enabled" in preview_proxy:
      value = preview_proxy.get("enabled")
      if isinstance(value, bool):
        return value
  return None


def build_image_from_graph(project: ProjectPayload) -> Image.Image:
  node_map: dict[str, ProjectNode] = {node.id: node for node in project.nodes}
  asset_map: dict[str, ProjectAsset] = {asset.id: asset for asset in project.assets}
  image_cache: dict[str, Image.Image] = {}

  def resolve_single_input(node: ProjectNode) -> str | None:
    inputs = node.inputs or {}
    priority_keys = ["primary", "video", "image", "input"]
    for key in priority_keys:
      target = inputs.get(key)
      if isinstance(target, str):
        return target.split(":", 1)[0]
    for target in inputs.values():
      if isinstance(target, str):
        return target.split(":", 1)[0]
    return None

  def resolve_node(node_id: str) -> Image.Image | None:
    if node_id in image_cache:
      return image_cache[node_id]
    node = node_map.get(node_id)
    if node is None:
      return None
    base_image: Image.Image | None = None
    if node.type == "MediaInput":
      base_image = load_media_image(project, node, asset_map)
    elif node.type in {"ExposureAdjust", "ContrastAdjust", "SaturationAdjust"}:
      parent = resolve_single_input(node)
      parent_image = resolve_node(parent) if parent else None
      if parent_image is not None:
        base_image = parent_image.copy()
        params = node.params or {}
        if node.type == "ExposureAdjust":
          exposure_value = parse_float(params.get("exposure"))
          exposure = max(min(exposure_value if exposure_value is not None else 0.0, 4.0), -4.0)
          factor = 2 ** exposure
          base_image = ImageEnhance.Brightness(base_image).enhance(factor)
        elif node.type == "ContrastAdjust":
          contrast_value = parse_float(params.get("contrast"))
          contrast = max(min(contrast_value if contrast_value is not None else 1.0, 4.0), 0.0)
          base_image = ImageEnhance.Contrast(base_image).enhance(contrast)
        elif node.type == "SaturationAdjust":
          saturation_value = parse_float(params.get("saturation"))
          saturation = max(min(saturation_value if saturation_value is not None else 1.0, 4.0), 0.0)
          base_image = ImageEnhance.Color(base_image).enhance(saturation)
    elif node.type == "PreviewDisplay":
      parent = resolve_single_input(node)
      parent_image = resolve_node(parent) if parent else None
      if parent_image is not None:
        base_image = parent_image
    if base_image is not None:
      image_cache[node_id] = base_image
    return base_image

  preview_nodes = [node for node in project.nodes if node.type == "PreviewDisplay"]
  for preview_node in preview_nodes:
    image = resolve_node(preview_node.id)
    if image is not None:
      return image.convert("RGB")

  # fallback to first media input if preview missing
  for node in project.nodes:
    if node.type == "MediaInput":
      return load_media_image(project, node, asset_map)
  return Image.new("RGB", (1920, 1080), "#333333")


def overlay_preview_metadata(
  image: Image.Image,
  source_width: int,
  source_height: int,
  proxy_decision: ProxyDecision,
  project: ProjectPayload,
) -> Image.Image:
  draw = ImageDraw.Draw(image)
  font = ImageFont.load_default()
  width, height = image.size
  fps = project.projectFps if isinstance(project.projectFps, (int, float)) else 30
  reason_labels = {
    "client_force_on": "Renderer override (ON)",
    "client_force_off": "Renderer override (OFF)",
    "project_metadata_on": "Project setting (enabled)",
    "project_metadata_off": "Project setting (disabled)",
    "resolution_4k": "Auto: ≥4K safeguard",
    "resolution_qhd": "Auto: ≥1440p safeguard",
    "historical_delay": "Auto: latency exceeded",
    "auto": "Auto baseline",
  }
  proxy_scale_label = f"{proxy_decision.scale:.2f}x"
  proxy_reason = reason_labels.get(proxy_decision.reason, proxy_decision.reason)
  target_delay_label = (
    f"Target Delay: {proxy_decision.target_delay_ms:.0f}ms"
    if proxy_decision.target_delay_ms
    else None
  )
  avg_delay_label = (
    f"Avg Delay: {proxy_decision.average_delay_ms:.1f}ms"
    if proxy_decision.average_delay_ms is not None
    else None
  )
  info_lines = [
    "NodeVision Preview",
    f"Source: {source_width}x{source_height}",
    f"Proxy: {'ON' if proxy_decision.enabled else 'OFF'} ({proxy_scale_label})",
    f"Reason: {proxy_reason}",
  ]
  if target_delay_label:
    info_lines.append(target_delay_label)
  if avg_delay_label:
    info_lines.append(avg_delay_label)
  info_lines.extend([
    f"FPS: {fps}",
    datetime.utcnow().strftime("%Y-%m-%d %H:%M:%SZ"),
  ])
  line_height = 18
  padding = 12
  overlay_height = min(height, max(line_height * len(info_lines) + padding * 2, 96))
  draw.rectangle(
    (0, height - overlay_height, width, height),
    fill=(20, 26, 46, 180),
  )
  text_y = height - overlay_height + 12
  for line in info_lines:
    draw.text((16, text_y), line, fill="#f5f7ff", font=font)
    text_y += 18
  return image


def encode_image_base64(image: Image.Image) -> str:
  buffer = BytesIO()
  image.save(buffer, format="PNG")
  return b64encode(buffer.getvalue()).decode("ascii")


NODE_CATALOG: list[NodeCatalogItem] = [
  NodeCatalogItem(
    nodeId="MediaInput",
    displayName="Media Input",
    category="IO",
    inputs=[],
    outputs=["video", "audio"],
  ),
  NodeCatalogItem(
    nodeId="ExposureAdjust",
    displayName="Exposure Adjust",
    category="Color",
    inputs=["video"],
    outputs=["video"],
  ),
  NodeCatalogItem(
    nodeId="ContrastAdjust",
    displayName="Contrast Adjust",
    category="Color",
    inputs=["video"],
    outputs=["video"],
  ),
  NodeCatalogItem(
    nodeId="SaturationAdjust",
    displayName="Saturation Adjust",
    category="Color",
    inputs=["video"],
    outputs=["video"],
  ),
  NodeCatalogItem(
    nodeId="PreviewDisplay",
    displayName="Preview Display",
    category="Monitoring",
    inputs=["primary", "secondary"],
    outputs=[],
  ),
]


app = FastAPI(title="NodeVision Editor Backend Prototype", version=BACKEND_VERSION)


def normalize_project_slot(raw_slot: str | None, default: str = DEFAULT_PROJECT_SLOT) -> str:
  candidate = (raw_slot or default).strip()
  if not candidate:
    candidate = default
  sanitized = candidate.replace("\\", "_").replace("/", "_")
  while ".." in sanitized:
    sanitized = sanitized.replace("..", "_")
  filtered = "".join(ch for ch in sanitized if ch.isalnum() or ch in {"_", "-", "."})
  return filtered or default


@app.get("/health", response_model=HealthResponse, summary="サービス稼働確認")
async def get_health() -> HealthResponse:
  return HealthResponse(status="ok", service="nodevision-backend", version=BACKEND_VERSION)


@app.get("/info", response_model=InfoResponse, summary="バックエンド情報")
async def get_info() -> InfoResponse:
  return InfoResponse(
    name="NodeVision Editor Backend Prototype",
    description="Electron IPC 経由で疎通確認するための最小 API",
    backendVersion=BACKEND_VERSION,
    endpoints=["/health", "/info", "/nodes/catalog", "/projects/save", "/projects/load"],
  )


@app.get("/nodes/catalog", response_model=List[NodeCatalogItem], summary="利用可能ノード一覧")
async def get_node_catalog() -> list[NodeCatalogItem]:
  return NODE_CATALOG


@app.post("/projects/save", response_model=ProjectSaveResponse, summary="プロジェクト保存")
async def post_project_save(request: ProjectSaveRequest) -> ProjectSaveResponse:
  slot = normalize_project_slot(request.slot, DEFAULT_PROJECT_SLOT)
  path = write_project(request.project, slot)
  summary = summarize_project(request.project)
  return ProjectSaveResponse(slot=slot, path=str(path), summary=summary)


@app.post("/preview/generate", response_model=PreviewResponse, summary="プレビュー生成")
async def post_preview_generate(request: PreviewGenerateRequest) -> PreviewResponse:
  project = request.project
  base_image = build_image_from_graph(project).convert("RGB")
  source_width, source_height = base_image.size
  proxy_decision = compute_proxy_decision(project, source_width, source_height, request.forceProxy)

  if proxy_decision.enabled:
    target_width = max(int(round(source_width * proxy_decision.scale)), 1)
    target_height = max(int(round(source_height * proxy_decision.scale)), 1)
  else:
    target_width = source_width
    target_height = source_height

  if proxy_decision.enabled and (target_width != source_width or target_height != source_height):
    preview_image = base_image.resize((target_width, target_height), RESAMPLE_LANCZOS)
  else:
    preview_image = base_image

  preview_image = overlay_preview_metadata(preview_image, source_width, source_height, proxy_decision, project)

  encoded = encode_image_base64(preview_image)
  return PreviewResponse(
    imageBase64=encoded,
    width=preview_image.width,
    height=preview_image.height,
    source=PreviewSourceInfo(width=source_width, height=source_height),
    proxy=PreviewProxyInfo(
      enabled=proxy_decision.enabled,
      width=preview_image.width,
      height=preview_image.height,
      scale=proxy_decision.scale,
      reason=proxy_decision.reason,
      averageDelayMs=proxy_decision.average_delay_ms,
      targetDelayMs=proxy_decision.target_delay_ms,
    ),
    generatedAt=datetime.utcnow().isoformat() + "Z",
  )


@app.post("/projects/load", response_model=ProjectLoadResponse, summary="プロジェクト読み込み")
async def post_project_load(request: ProjectLoadRequest) -> ProjectLoadResponse:
  slot = normalize_project_slot(request.slot, DEFAULT_PROJECT_SLOT)
  try:
    project, path = read_project(slot)
  except FileNotFoundError as error:
    raise HTTPException(status_code=404, detail={"message": str(error)}) from error
  except json.JSONDecodeError as error:
    raise HTTPException(
      status_code=422,
      detail={
        "message": "プロジェクトファイルが JSON として不正です。",
        "issues": [
          ValidationIssue(path="(root)", message=str(error), type="json_decode").dict()
        ],
      },
    ) from error
  except ValidationError as error:
    raise HTTPException(
      status_code=422,
      detail={
        "message": "プロジェクトファイルの検証に失敗しました。",
        "issues": [issue.dict() for issue in build_validation_issues(error.errors())],
      },
    ) from error

  summary = summarize_project(project)
  return ProjectLoadResponse(slot=slot, path=str(path), project=project, summary=summary)


def summarize_project(project: ProjectPayload) -> ProjectSummary:
  return ProjectSummary(
    nodes=len(project.nodes),
    edges=len(project.edges),
    assets=len(project.assets),
    fps=project.projectFps,
    colorSpace=project.mediaColorSpace,
    schemaVersion=project.schemaVersion,
  )


def write_project(project: ProjectPayload, slot: str) -> Path:
  target = STORAGE_DIR / f"{slot}.nveproj"
  with target.open("w", encoding="utf-8") as fh:
    json.dump(
      {
        **project.model_dump(by_alias=True),
        "metadata": {**project.metadata, "savedBy": "backend"},
      },
      fh,
      indent=2,
      ensure_ascii=False,
    )
    fh.write("\n")
  return target


def read_project(slot: str) -> tuple[ProjectPayload, Path]:
  normalized_slot = normalize_project_slot(slot, DEFAULT_PROJECT_SLOT)
  target = STORAGE_DIR / f"{normalized_slot}.nveproj"
  if not target.exists():
    raise FileNotFoundError(f"Project slot '{normalized_slot}' が見つかりません。")

  with target.open("r", encoding="utf-8") as fh:
    payload = json.load(fh)

  project = ProjectPayload.model_validate(payload)
  return project, target


def build_validation_issues(errors: list[dict[str, Any]]) -> list[ValidationIssue]:
  issues: list[ValidationIssue] = []
  for error in errors:
    loc = error.get("loc", ())
    path = "/" + "/".join(str(part) for part in loc) if loc else "(root)"
    issues.append(
      ValidationIssue(
        path=path,
        message=error.get("msg", "validation error"),
        type=error.get("type", "validation_error"),
      )
    )
  return issues
