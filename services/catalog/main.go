// Command catalog is the Go product-catalog service.
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/aomar97/shop-catalog/internal/api"
	"github.com/aomar97/shop-catalog/internal/obs"
	"github.com/aomar97/shop-catalog/internal/store"
)

func main() {
	port := getenv("PORT", "8080")
	cfg := api.Config{
		FailureRate: getenvFloat("FAILURE_RATE", 0),
		LatencyMS:   getenvInt("LATENCY_MS", 0),
	}

	ctx := context.Background()
	shutdownTracer, err := obs.InitTracer(ctx, "catalog", os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
	if err != nil {
		log.Printf("tracer init failed (continuing without tracing): %v", err)
	}
	defer func() { _ = shutdownTracer(context.Background()) }()

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           api.New(store.NewMemStore(), cfg),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("catalog listening on :%s (failure_rate=%.2f latency_ms=%d)", port, cfg.FailureRate, cfg.LatencyMS)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutCtx); err != nil {
		log.Printf("graceful shutdown: %v", err)
	}
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func getenvInt(k string, def int) int {
	if v := os.Getenv(k); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func getenvFloat(k string, def float64) float64 {
	if v := os.Getenv(k); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return def
}
