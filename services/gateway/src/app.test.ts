import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./app";

const app = createApp({
  catalogUrl: "http://catalog:8080",
  ordersUrl: "http://orders:8080",
  failureRate: 0,
  latencyMs: 0,
});

test("healthz returns ok", async () => {
  const res = await request(app).get("/healthz");
  assert.equal(res.status, 200);
});

test("metrics endpoint exposes prometheus text", async () => {
  const res = await request(app).get("/metrics");
  assert.equal(res.status, 200);
  assert.match(res.text, /process_cpu_seconds_total|http_requests_total/);
});

test("home page renders", async () => {
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /polyglot demo/);
});

test("/api/items proxies catalog (fetch mocked)", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify([{ id: "sku-001", name: "Aeron Chair" }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    const res = await request(app).get("/api/items");
    assert.equal(res.status, 200);
    assert.match(res.text, /sku-001/);
  } finally {
    globalThis.fetch = original;
  }
});

test("/api/items returns 502 when catalog is down", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("connection refused");
  }) as typeof fetch;
  try {
    const res = await request(app).get("/api/items");
    assert.equal(res.status, 502);
  } finally {
    globalThis.fetch = original;
  }
});
