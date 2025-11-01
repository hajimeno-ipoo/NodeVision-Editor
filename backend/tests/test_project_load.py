from __future__ import annotations

import unittest
from pathlib import Path

FASTAPI_AVAILABLE = True

try:
  from fastapi.testclient import TestClient
  from backend.app.main import app, STORAGE_DIR
except ModuleNotFoundError as error:
  if error.name == "fastapi":
    FASTAPI_AVAILABLE = False
    TestClient = None  # type: ignore[assignment]
    app = None  # type: ignore[assignment]
    STORAGE_DIR = Path(".")
  else:
    raise


PROJECT_SAMPLE = {
  "schemaVersion": "1.0.0",
  "mediaColorSpace": "Rec.709",
  "projectFps": 30.0,
  "projectResolution": {"width": 1920, "height": 1080},
  "nodes": [],
  "edges": [],
  "assets": [],
  "metadata": {}
}


class ProjectLoadEndpointTests(unittest.TestCase):

  def setUp(self) -> None:
    self.created_slots: list[str] = []
    if FASTAPI_AVAILABLE:
      self.client = TestClient(app)  # type: ignore[arg-type]

  def tearDown(self) -> None:
    if FASTAPI_AVAILABLE:
      self.client.close()
    for slot in self.created_slots:
      target = STORAGE_DIR / f"{slot}.nveproj"
      if target.exists():
        target.unlink()

  @unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI dependency is not installed")
  def test_round_trip_save_and_load_project(self) -> None:
    save_response = self.client.post("/projects/save", json={"project": PROJECT_SAMPLE, "slot": "unit-test-slot"})
    self.assertEqual(save_response.status_code, 200)
    payload = save_response.json()
    slot = payload["slot"]
    self.created_slots.append(slot)

    load_response = self.client.post("/projects/load", json={"slot": slot})
    self.assertEqual(load_response.status_code, 200)
    loaded = load_response.json()
    self.assertEqual(loaded["slot"], slot)
    self.assertEqual(loaded["summary"]["nodes"], 0)
    self.assertEqual(loaded["summary"]["assets"], 0)
    self.assertEqual(loaded["project"]["schemaVersion"], PROJECT_SAMPLE["schemaVersion"])

  @unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI dependency is not installed")
  def test_slot_sanitization_strips_traversal_characters(self) -> None:
    raw_slot = "../../dangerous/slot"
    save_response = self.client.post("/projects/save", json={"project": PROJECT_SAMPLE, "slot": raw_slot})
    self.assertEqual(save_response.status_code, 200)
    sanitized_slot = save_response.json()["slot"]
    self.created_slots.append(sanitized_slot)
    self.assertNotIn("/", sanitized_slot)
    self.assertNotIn("..", sanitized_slot)

    load_response = self.client.post("/projects/load", json={"slot": raw_slot})
    self.assertEqual(load_response.status_code, 200)
    loaded = load_response.json()
    self.assertEqual(loaded["slot"], sanitized_slot)
    self.assertTrue(loaded["path"].endswith(f"{sanitized_slot}.nveproj"))

  @unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI dependency is not installed")
  def test_node_catalog_provides_defaults(self) -> None:
    response = self.client.get("/nodes/catalog")
    self.assertEqual(response.status_code, 200)
    catalog = response.json()
    media_input = next(item for item in catalog if item["nodeId"] == "MediaInput")
    exposure = next(item for item in catalog if item["nodeId"] == "ExposureAdjust")
    self.assertEqual(media_input["defaultParams"]["path"], "Assets/clip01.mp4")
    self.assertIn("placeholderWidth", media_input["defaultParams"])
    self.assertTrue(media_input["description"])
    self.assertEqual(media_input["defaultOutputs"], ["video", "audio"])
    self.assertEqual(exposure["defaultParams"]["exposure"], 0.0)
    self.assertIn("video", exposure["defaultInputs"])
    self.assertEqual(exposure["defaultOutputs"], ["video"])
    self.assertIn("露出", exposure["description"])

  @unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI dependency is not installed")
  def test_save_and_reload_with_image_nodes(self) -> None:
    project = {
      "schemaVersion": "1.0.0",
      "mediaColorSpace": "Rec.709",
      "projectFps": 30.0,
      "projectResolution": {"width": 1920, "height": 1080},
      "nodes": [
        {
          "id": "n1",
          "type": "MediaInput",
          "displayName": "Media",
          "params": {"placeholderWidth": 1920, "placeholderHeight": 1080},
          "inputs": {},
          "outputs": ["video"],
          "cachePolicy": "auto",
        },
        {
          "id": "n2",
          "type": "Resize",
          "displayName": "Resize",
          "params": {"width": 1280, "height": 720, "keepAspectRatio": True},
          "inputs": {"image": "n1:video"},
          "outputs": ["image"],
          "cachePolicy": "auto",
        },
        {
          "id": "n3",
          "type": "Crop",
          "displayName": "Crop",
          "params": {"x": 10, "y": 10, "width": 640, "height": 360},
          "inputs": {"image": "n2:image"},
          "outputs": ["image"],
          "cachePolicy": "auto",
        },
        {
          "id": "n4",
          "type": "Blend",
          "displayName": "Blend",
          "params": {"alpha": 0.5},
          "inputs": {"primary": "n3:image", "secondary": "n2:image"},
          "outputs": ["image"],
          "cachePolicy": "auto",
        },
        {
          "id": "n5",
          "type": "PreviewDisplay",
          "displayName": "Preview",
          "params": {},
          "inputs": {"primary": "n4:image"},
          "outputs": [],
          "cachePolicy": "auto",
        },
      ],
      "edges": [
        {"from": "n1:video", "to": "n2:image"},
        {"from": "n2:image", "to": "n3:image"},
        {"from": "n3:image", "to": "n4:primary"},
        {"from": "n2:image", "to": "n4:secondary"},
        {"from": "n4:image", "to": "n5:primary"},
      ],
      "assets": [],
      "metadata": {},
    }

    slot_name = "image-pipeline"
    save_response = self.client.post("/projects/save", json={"project": project, "slot": slot_name})
    self.assertEqual(save_response.status_code, 200)
    resolved_slot = save_response.json()["slot"]
    self.created_slots.append(resolved_slot)

    load_response = self.client.post("/projects/load", json={"slot": resolved_slot})
    self.assertEqual(load_response.status_code, 200)
    loaded = load_response.json()
    loaded_nodes = loaded["project"]["nodes"]
    loaded_types = {node["type"] for node in loaded_nodes}
    self.assertTrue({"Resize", "Crop", "Blend"}.issubset(loaded_types))
    self.assertEqual(loaded["summary"]["nodes"], 5)


if __name__ == "__main__":
  unittest.main()
