import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export interface Config {
  catalogUrl: string;
  ordersUrl: string;
  failureRate: number; // [0,1] chance of injected 500
  latencyMs: number; // artificial latency per request
}

export function createApp(cfg: Config): Express {
  const app = express();
  app.use(express.json());

  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  const requests = new Counter({
    name: "http_requests_total",
    help: "Total HTTP requests.",
    labelNames: ["method", "route", "status"],
    registers: [registry],
  });
  const duration = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request latency in seconds.",
    labelNames: ["method", "route"],
    registers: [registry],
  });

  const isInfra = (p: string) =>
    p === "/healthz" || p === "/readyz" || p === "/metrics";
  const routeLabel = (p: string) =>
    p.startsWith("/api/items/") ? "/api/items/:id" : p;

  // chaos + RED metrics (skipped for infra endpoints)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isInfra(req.path)) return next();
    const route = routeLabel(req.path);

    const proceed = () => {
      if (cfg.failureRate > 0 && Math.random() < cfg.failureRate) {
        requests.labels(req.method, route, "500").inc();
        res.status(500).json({ error: "injected failure" });
        return;
      }
      const end = duration.startTimer({ method: req.method, route });
      res.on("finish", () => {
        end();
        requests.labels(req.method, route, String(res.statusCode)).inc();
      });
      next();
    };

    if (cfg.latencyMs > 0) setTimeout(proceed, cfg.latencyMs);
    else proceed();
  });

  app.get("/healthz", (_req, res) => res.send("ok"));
  app.get("/readyz", (_req, res) => res.send("ok"));
  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", registry.contentType);
    res.send(await registry.metrics());
  });

  app.get("/", (_req, res) => res.type("html").send(PAGE));

  // Proxy to the Go catalog service.
  app.get("/api/items", async (req, res) => {
    try {
      const r = await fetch(`${cfg.catalogUrl}/items`, { headers: traceHeaders(req) });
      res.status(r.status).type("application/json").send(await r.text());
    } catch {
      res.status(502).json({ error: "catalog unavailable" });
    }
  });

  // Checkout -> Python orders service.
  app.post("/api/checkout", async (req, res) => {
    try {
      const r = await fetch(`${cfg.ordersUrl}/orders`, {
        method: "POST",
        headers: { "content-type": "application/json", ...traceHeaders(req) },
        body: JSON.stringify(req.body),
      });
      res.status(r.status).type("application/json").send(await r.text());
    } catch {
      res.status(502).json({ error: "orders unavailable" });
    }
  });

  return app;
}

// Forward W3C trace context so the backend services' OTel spans join this trace.
function traceHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const traceparent = req.header("traceparent");
  const tracestate = req.header("tracestate");
  if (traceparent) headers.traceparent = traceparent;
  if (tracestate) headers.tracestate = tracestate;
  return headers;
}

// Self-contained interactive UI (no external assets, no template literals or
// ${} inside, so it can live safely in this TS template string).
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shop · polyglot demo</title>
<style>
  :root{--bg:#0f172a;--card:#1e293b;--accent:#38bdf8;--good:#22c55e;--text:#e2e8f0;--muted:#94a3b8}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text)}
  header{padding:20px 28px;border-bottom:1px solid #334155;display:flex;align-items:baseline;gap:14px}
  header h1{margin:0;font-size:22px}
  header .tag{color:var(--muted);font-size:13px}
  main{display:grid;grid-template-columns:1fr 320px;gap:24px;padding:24px 28px;max-width:1100px;margin:0 auto}
  h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 12px}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
  .card{background:var(--card);border:1px solid #334155;border-radius:12px;padding:16px}
  .card h3{margin:0 0 6px;font-size:16px}
  .price{color:var(--accent);font-weight:700;font-size:18px}
  .stock{color:var(--muted);font-size:12px;margin:4px 0 12px}
  button{background:var(--accent);color:#06283d;border:0;border-radius:8px;padding:9px 12px;font-weight:600;cursor:pointer;width:100%}
  button:disabled{opacity:.45;cursor:not-allowed}
  aside{background:var(--card);border:1px solid #334155;border-radius:12px;padding:18px;height:fit-content}
  .line{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #29384f;font-size:14px}
  .total{display:flex;justify-content:space-between;margin:14px 0;font-weight:700}
  .ok{background:#052e16;border:1px solid var(--good);color:#bbf7d0;border-radius:10px;padding:14px;margin-bottom:14px;font-size:14px}
  .ok b{color:#fff}
  code{background:#0b1220;padding:1px 6px;border-radius:6px;color:var(--accent)}
  footer{color:var(--muted);font-size:12px;text-align:center;padding:18px}
  .empty{color:var(--muted);font-size:14px}
</style>
</head>
<body>
<header>
  <h1>🛒 Shop</h1>
  <span class="tag">polyglot demo — gateway (Node/TS) calls catalog (Go) + orders (Python)</span>
</header>
<main>
  <section>
    <h2>Products <span id="src" class="tag"></span></h2>
    <div id="grid" class="grid"></div>
  </section>
  <aside>
    <h2>Cart</h2>
    <div id="confirm"></div>
    <div id="lines"><div class="empty">Cart is empty.</div></div>
    <div class="total"><span>Units</span><span id="units">0</span></div>
    <button id="checkout" disabled>Checkout</button>
  </aside>
</main>
<footer>gateway &rarr; <code>/api/items</code> (catalog) &middot; <code>POST /api/checkout</code> (orders) &middot; <code>/metrics</code></footer>
<script>
  var cart = {};
  function money(n){ return '$' + Number(n).toFixed(2); }
  function units(){ var u=0; for (var k in cart) u+=cart[k].qty; return u; }

  function renderCart(){
    var lines = document.getElementById('lines');
    var keys = Object.keys(cart);
    if (keys.length === 0){ lines.innerHTML = '<div class="empty">Cart is empty.</div>'; }
    else {
      lines.innerHTML = '';
      keys.forEach(function(k){
        var c = cart[k];
        var row = document.createElement('div'); row.className='line';
        row.innerHTML = '<span>'+c.name+'</span><span>x'+c.qty+'</span>';
        lines.appendChild(row);
      });
    }
    document.getElementById('units').textContent = units();
    document.getElementById('checkout').disabled = (units() === 0);
  }

  function add(it){
    if(!cart[it.id]) cart[it.id] = { sku: it.id, name: it.name, qty: 0 };
    cart[it.id].qty++;
    renderCart();
  }

  async function load(){
    try{
      var res = await fetch('/api/items');
      var items = await res.json();
      document.getElementById('src').textContent = '(' + items.length + ' from catalog)';
      var grid = document.getElementById('grid');
      grid.innerHTML = '';
      items.forEach(function(it){
        var card = document.createElement('div'); card.className='card';
        card.innerHTML = '<h3>'+it.name+'</h3><div class="price">'+money(it.price)+
          '</div><div class="stock">'+it.stock+' in stock</div>';
        var b = document.createElement('button'); b.textContent = 'Add to cart';
        b.addEventListener('click', function(){ add(it); });
        card.appendChild(b);
        grid.appendChild(card);
      });
      renderCart();
      if (location.search.indexOf('demo=checkout') >= 0){ add(items[0]); add(items[0]); add(items[2]); checkout(); }
      else if (location.search.indexOf('demo=cart') >= 0){ add(items[0]); add(items[0]); add(items[3]); }
    }catch(e){
      document.getElementById('grid').innerHTML = '<div class="empty">catalog unavailable</div>';
    }
  }

  async function checkout(){
    var list = []; for (var k in cart) list.push({ sku: cart[k].sku, qty: cart[k].qty });
    if (list.length === 0) return;
    var res = await fetch('/api/checkout', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ customer:'demo-user', items:list }) });
    var o = await res.json();
    var c = document.getElementById('confirm');
    c.innerHTML = '<div class="ok">✅ Order <b>'+String(o.id).slice(0,8)+'</b> placed &middot; '+
      o.units+' units &middot; status <b>'+o.status+'</b><br><span style="color:#86efac">orders service (Python) responded 201</span></div>';
    cart = {}; renderCart();
  }

  document.getElementById('checkout').addEventListener('click', checkout);
  load();
</script>
</body></html>`;
