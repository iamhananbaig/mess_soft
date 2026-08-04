<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use Tests\TestCase;

class InventoryTest extends TestCase
{
    public function test_list_inventory(): void
    {
        InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'cost_per_unit' => 15, 'current_stock' => 50]);
        InventoryItem::create(['name' => 'Patty', 'unit' => 'pcs', 'cost_per_unit' => 80, 'current_stock' => 20]);

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/inventory');

        $response->assertOk();
        $this->assertCount(2, $response->json());
    }

    public function test_create_inventory_item(): void
    {
        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/inventory', [
            'name' => 'Cheese Slice',
            'unit' => 'pcs',
            'cost_per_unit' => 10,
            'current_stock' => 100,
        ]);

        $response->assertCreated()->assertJsonFragment(['name' => 'Cheese Slice']);
        $this->assertDatabaseHas('inventory_items', ['name' => 'Cheese Slice']);
    }

    public function test_update_inventory_item(): void
    {
        $item = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'cost_per_unit' => 15, 'current_stock' => 50]);

        $response = $this->withHeaders($this->authHeaders())->putJson("/api/v1/inventory/{$item->id}", [
            'cost_per_unit' => 18,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('inventory_items', ['id' => $item->id, 'cost_per_unit' => 18]);
    }

    public function test_stock_in(): void
    {
        $item = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'cost_per_unit' => 15, 'current_stock' => 50]);

        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/inventory/stock-in', [
            'inventory_item_id' => $item->id,
            'quantity' => 30,
            'reference' => 'PO-001',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('inventory_items', ['id' => $item->id, 'current_stock' => 80]);
        $this->assertDatabaseHas('stock_movements', [
            'inventory_item_id' => $item->id,
            'type' => 'in',
            'quantity' => 30,
            'reference' => 'PO-001',
        ]);
    }

    public function test_adjust_stock_positive(): void
    {
        $item = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'cost_per_unit' => 15, 'current_stock' => 50]);

        $response = $this->withHeaders($this->authHeaders())->postJson("/api/v1/inventory/{$item->id}/adjust", [
            'quantity' => 5,
            'note' => 'Found extra',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('inventory_items', ['id' => $item->id, 'current_stock' => 55]);
    }

    public function test_adjust_stock_negative(): void
    {
        $item = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'cost_per_unit' => 15, 'current_stock' => 50]);

        $response = $this->withHeaders($this->authHeaders())->postJson("/api/v1/inventory/{$item->id}/adjust", [
            'quantity' => -3,
            'note' => 'Damaged',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('inventory_items', ['id' => $item->id, 'current_stock' => 47]);
    }

    public function test_expire_stock(): void
    {
        $item = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'cost_per_unit' => 15, 'current_stock' => 50]);

        $response = $this->withHeaders($this->authHeaders())->postJson("/api/v1/inventory/{$item->id}/expire", [
            'quantity' => 5,
            'note' => 'Expired batch',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('inventory_items', ['id' => $item->id, 'current_stock' => 45]);
        $this->assertDatabaseHas('stock_movements', [
            'inventory_item_id' => $item->id,
            'type' => 'expiry',
            'quantity' => -5,
        ]);
    }
}
