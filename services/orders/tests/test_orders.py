from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/healthz").status_code == 200


def test_metrics_exposed():
    body = client.get("/metrics").text
    assert "http_requests_total" in body


def test_create_and_get_order():
    resp = client.post(
        "/orders", json={"customer": "alice", "items": [{"sku": "sku-001", "qty": 2}]}
    )
    assert resp.status_code == 201
    oid = resp.json()["id"]
    assert resp.json()["units"] == 2

    got = client.get(f"/orders/{oid}")
    assert got.status_code == 200
    assert got.json()["customer"] == "alice"


def test_missing_order_404():
    assert client.get("/orders/does-not-exist").status_code == 404


def test_invalid_qty_422():
    resp = client.post(
        "/orders", json={"customer": "bob", "items": [{"sku": "x", "qty": 0}]}
    )
    assert resp.status_code == 422
