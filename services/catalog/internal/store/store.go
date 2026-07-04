// Package store holds the catalog's data access behind an interface, so a
// Postgres-backed implementation can drop in later without touching handlers.
package store

import (
	"context"
	"errors"
	"sync"
)

// Item is a product in the catalog.
type Item struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Price float64 `json:"price"`
	Stock int     `json:"stock"`
}

// ErrNotFound is returned when an item id does not exist.
var ErrNotFound = errors.New("item not found")

// Store is the catalog data interface (memory today, Postgres tomorrow).
type Store interface {
	List(ctx context.Context) ([]Item, error)
	Get(ctx context.Context, id string) (Item, error)
}

// MemStore is an in-memory Store seeded with sample products.
type MemStore struct {
	mu    sync.RWMutex
	items map[string]Item
	order []string
}

// NewMemStore returns a seeded in-memory store.
func NewMemStore() *MemStore {
	m := &MemStore{items: map[string]Item{}}
	for _, it := range seed() {
		m.items[it.ID] = it
		m.order = append(m.order, it.ID)
	}
	return m
}

func seed() []Item {
	return []Item{
		{ID: "sku-001", Name: "Aeron Chair", Price: 1295.00, Stock: 12},
		{ID: "sku-002", Name: "Standing Desk", Price: 599.00, Stock: 30},
		{ID: "sku-003", Name: "Mechanical Keyboard", Price: 149.99, Stock: 87},
		{ID: "sku-004", Name: "4K Monitor", Price: 429.50, Stock: 41},
	}
}

// List returns all items in insertion order.
func (m *MemStore) List(_ context.Context) ([]Item, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Item, 0, len(m.order))
	for _, id := range m.order {
		out = append(out, m.items[id])
	}
	return out, nil
}

// Get returns a single item or ErrNotFound.
func (m *MemStore) Get(_ context.Context, id string) (Item, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	it, ok := m.items[id]
	if !ok {
		return Item{}, ErrNotFound
	}
	return it, nil
}
