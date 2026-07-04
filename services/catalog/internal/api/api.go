// Package api exposes the catalog HTTP handlers with metrics + a chaos knob.
package api

import (
	"encoding/json"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aomar97/shop-catalog/internal/obs"
	"github.com/aomar97/shop-catalog/internal/store"
)

// Config carries the deliberate failure/latency knobs used by Repos 3 & 4
// (observability alerts and progressive-delivery auto-rollback demos).
type Config struct {
	FailureRate float64 // probability [0,1] of returning HTTP 500
	LatencyMS   int     // artificial latency added per request
}

type handler struct {
	store store.Store
	cfg   Config
}

// New builds the catalog HTTP handler (Go 1.22 method-based routing).
func New(s store.Store, cfg Config) http.Handler {
	h := &handler{store: s, cfg: cfg}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", h.health)
	mux.HandleFunc("GET /readyz", h.health)
	mux.Handle("GET /metrics", obs.MetricsHandler())
	mux.HandleFunc("GET /items", h.listItems)
	mux.HandleFunc("GET /items/{id}", h.getItem)
	return instrument(chaos(h.cfg, mux))
}

func (h *handler) health(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (h *handler) listItems(w http.ResponseWriter, r *http.Request) {
	items, err := h.store.List(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *handler) getItem(w http.ResponseWriter, r *http.Request) {
	it, err := h.store.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		http.Error(w, "item not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, it)
}

// chaos injects latency/failures for everything except health & metrics.
func chaos(cfg Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isInfra(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		if cfg.LatencyMS > 0 {
			time.Sleep(time.Duration(cfg.LatencyMS) * time.Millisecond)
		}
		if cfg.FailureRate > 0 && rand.Float64() < cfg.FailureRate {
			http.Error(w, "injected failure", http.StatusInternalServerError)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// instrument records RED metrics with a low-cardinality route label.
func instrument(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, code: http.StatusOK}
		next.ServeHTTP(rec, r)
		route := routeLabel(r.URL.Path)
		obs.RequestDuration.WithLabelValues(r.Method, route).Observe(time.Since(start).Seconds())
		obs.RequestsTotal.WithLabelValues(r.Method, route, strconv.Itoa(rec.code)).Inc()
	})
}

type statusRecorder struct {
	http.ResponseWriter
	code int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.code = code
	s.ResponseWriter.WriteHeader(code)
}

func isInfra(p string) bool {
	return p == "/healthz" || p == "/readyz" || p == "/metrics"
}

func routeLabel(p string) string {
	if strings.HasPrefix(p, "/items/") {
		return "/items/:id"
	}
	return p
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
