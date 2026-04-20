from fastapi.testclient import TestClient

from dwellverdict_modeling.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert isinstance(body["version"], str)
