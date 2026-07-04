package store

import (
	"context"
	"errors"
	"testing"
)

func TestMemStore_ListAndGet(t *testing.T) {
	s := NewMemStore()

	items, err := s.List(context.Background())
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(items) != 4 {
		t.Fatalf("expected 4 seeded items, got %d", len(items))
	}

	it, err := s.Get(context.Background(), "sku-001")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if it.Name != "Aeron Chair" {
		t.Fatalf("unexpected item: %+v", it)
	}
}

func TestMemStore_GetNotFound(t *testing.T) {
	s := NewMemStore()
	if _, err := s.Get(context.Background(), "missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}
