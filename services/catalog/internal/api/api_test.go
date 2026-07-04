package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aomar97/shop-catalog/internal/store"
)

func TestListItems_OK(t *testing.T) {
	h := New(store.NewMemStore(), Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/items", nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	var items []store.Item
	if err := json.Unmarshal(rr.Body.Bytes(), &items); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(items) == 0 {
		t.Fatal("expected items")
	}
}

func TestGetItem_NotFound(t *testing.T) {
	h := New(store.NewMemStore(), Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/items/missing", nil))
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

func TestHealth_OK(t *testing.T) {
	h := New(store.NewMemStore(), Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
}

func TestChaos_AlwaysFails(t *testing.T) {
	h := New(store.NewMemStore(), Config{FailureRate: 1.0})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/items", nil))
	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500 (chaos)", rr.Code)
	}
}
