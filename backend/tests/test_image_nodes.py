from __future__ import annotations

import unittest

FASTAPI_AVAILABLE = True

try:
  from fastapi.testclient import TestClient
  from backend.app.main import app
except ModuleNotFoundError as error:
  if error.name == "fastapi":
    FASTAPI_AVAILABLE = False
    TestClient = None  # type: ignore[assignment]
    app = None  # type: ignore[assignment]
  else:
    raise


class ImageNodeProcessingTests(unittest.TestCase):

  @unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI dependency is not installed")
  def setUp(self) -> None:
    self.client = TestClient(app)  # type: ignore[arg-type]

  @unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI dependency is not installed")
  def tearDown(self) -> None:
    self.client.close()

  @unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI dependency is not installed")
  def test_resize_crop_blend_pipeline(self) -> None:
    project = {
      "schemaVersion": "1.0.0",
      "mediaColorSpace": "Rec.709",
      "projectFps": 30,
      "projectResolution": {"width": 1920, "height": 1080},
      "nodes": [
        {
          "id": "n1",
          "type": "MediaInput",
          "displayName": "Media",
          "params": {
            "placeholderWidth": 1920,
            "placeholderHeight": 1080,
          },
          "inputs": {},
          "outputs": ["video"],
          "cachePolicy": "auto",
        },
        {
          "id": "n2",
          "type": "Resize",
          "displayName": "Resize 1280x720",
          "params": {"width": 1280, "height": 720, "keepAspectRatio": True},
          "inputs": {"image": "n1:video"},
          "outputs": ["image"],
          "cachePolicy": "auto",
        },
        {
          "id": "n3",
          "type": "Crop",
          "displayName": "Crop 640x360",
          "params": {"x": 80, "y": 60, "width": 640, "height": 360},
          "inputs": {"image": "n2:image"},
          "outputs": ["image"],
          "cachePolicy": "auto",
        },
        {
          "id": "n4",
          "type": "Resize",
          "displayName": "Resize Secondary",
          "params": {"width": 640, "height": 360, "keepAspectRatio": False},
          "inputs": {"image": "n1:video"},
          "outputs": ["image"],
          "cachePolicy": "auto",
        },
        {
          "id": "n5",
          "type": "Blend",
          "displayName": "Blend",
          "params": {"alpha": 0.6},
          "inputs": {"primary": "n3:image", "secondary": "n4:image"},
          "outputs": ["image"],
          "cachePolicy": "auto",
        },
        {
          "id": "n6",
          "type": "PreviewDisplay",
          "displayName": "Preview",
          "params": {},
          "inputs": {"primary": "n5:image"},
          "outputs": [],
          "cachePolicy": "auto",
        },
      ],
      "edges": [
        {"from": "n1:video", "to": "n2:image"},
        {"from": "n2:image", "to": "n3:image"},
        {"from": "n1:video", "to": "n4:image"},
        {"from": "n3:image", "to": "n5:primary"},
        {"from": "n4:image", "to": "n5:secondary"},
        {"from": "n5:image", "to": "n6:primary"},
      ],
      "assets": [],
      "metadata": {
        "createdWith": "NodeVision Editor",
      },
    }

    response = self.client.post("/preview/generate", json={"project": project, "forceProxy": False})
    self.assertEqual(response.status_code, 200)
    payload = response.json()
    self.assertEqual(payload["width"], 640)
    self.assertEqual(payload["height"], 360)
    self.assertEqual(payload["proxy"]["enabled"], False)
    self.assertTrue(payload["imageBase64"])


if __name__ == "__main__":
  unittest.main()
