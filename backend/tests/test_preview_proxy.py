from __future__ import annotations

import unittest

FASTAPI_AVAILABLE = True

try:
  from backend.app.main import (
    ProjectPayload,
    compute_proxy_decision,
  )
except ModuleNotFoundError as error:
  if error.name == "fastapi":
    FASTAPI_AVAILABLE = False
    ProjectPayload = None  # type: ignore[assignment]
    compute_proxy_decision = None  # type: ignore[assignment]
  else:
    raise


def create_project(metadata: dict | None = None) -> ProjectPayload:
  if not FASTAPI_AVAILABLE or ProjectPayload is None:
    raise RuntimeError("FastAPI is not available; project factory should not be used")
  return ProjectPayload(
    schemaVersion="1.0.0",
    mediaColorSpace="Rec.709",
    projectFps=30.0,
    projectResolution={"width": 1920, "height": 1080},
    nodes=[],
    edges=[],
    assets=[],
    metadata=metadata or {},
  )


class ProxyDecisionTests(unittest.TestCase):

  @unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI dependency is not installed")
  def test_1080p_defaults_to_full_resolution(self) -> None:
    project = create_project()
    decision = compute_proxy_decision(project, 1920, 1080, None)
    self.assertFalse(decision.enabled)
    self.assertEqual(decision.reason, "auto")
    self.assertAlmostEqual(decision.scale, 1.0, places=6)

  @unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI dependency is not installed")
  def test_4k_triggers_proxy_half_resolution(self) -> None:
    project = create_project()
    decision = compute_proxy_decision(project, 3840, 2160, None)
    self.assertTrue(decision.enabled)
    self.assertEqual(decision.reason, "resolution_4k")
    self.assertLessEqual(decision.scale, 0.5)

  @unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI dependency is not installed")
  def test_project_metadata_can_disable_proxy(self) -> None:
    project = create_project({"previewProxy": {"enabled": False}})
    decision = compute_proxy_decision(project, 3840, 2160, None)
    self.assertFalse(decision.enabled)
    self.assertEqual(decision.reason, "project_metadata_off")


if __name__ == "__main__":
  unittest.main()
