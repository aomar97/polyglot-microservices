import { createApp } from "./app";

const cfg = {
  catalogUrl: process.env.CATALOG_URL ?? "http://catalog:8080",
  ordersUrl: process.env.ORDERS_URL ?? "http://orders:8080",
  failureRate: Number(process.env.FAILURE_RATE ?? "0"),
  latencyMs: Number(process.env.LATENCY_MS ?? "0"),
};

const port = Number(process.env.PORT ?? "8080");

createApp(cfg).listen(port, () => {
  console.log(
    `gateway listening on :${port} (catalog=${cfg.catalogUrl} orders=${cfg.ordersUrl} failure_rate=${cfg.failureRate} latency_ms=${cfg.latencyMs})`,
  );
});
