<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use Tests\TestCase;

class ManualConsumptionTest extends TestCase
{
    public function test_record_consumption(): void
    {
        $item = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'cost_per_unit' => 15, 'current_stock' => 50]);

        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/consumptions', [
            'inventory_item_id' => $item->id,
            'quantity' => 5,
            'reason' => 'Staff lunch',
        ]);

        $response->assertCreated()->assertJson(['message' => 'Consumption recorded']);
        $this->assertDatabaseHas('inventory_items', ['id' => $item->id, 'current_stock' => 45]);
        $this->assertDatabaseHas('manual_consumptions', [
            'inventory_item_id' => $item->id,
            'quantity' => 5,
            'reason' => 'Staff lunch',
        ]);
        $this->assertDatabaseHas('stock_movements', [
            'inventory_item_id' => $item->id,
            'type' => 'out',
            'quantity' => -5,
        ]);
    }

    public function test_consumption_insufficient_stock(): void
    {
        $item = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'cost_per_unit' => 15, 'current_stock' => 3]);

        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/consumptions', [
            'inventory_item_id' => $item->id,
            'quantity' => 10,
            'reason' => 'Staff lunch',
        ]);

        $response->assertStatus(422)->assertJson(['message' => 'Insufficient stock']);
        $this->assertDatabaseHas('inventory_items', ['id' => $item->id, 'current_stock' => 3]);
    }

    public function test_consumption_validation(): void
    {
        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/consumptions', [
            'inventory_item_id' => 999,
            'quantity' => 0,
            'reason' => '',
        ]);

        $response->assertUnprocessable();
    }

    public function test_list_consumptions(): void
    {
        $item = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'cost_per_unit' => 15, 'current_stock' => 50]);

        $this->withHeaders($this->authHeaders())->postJson('/api/v1/consumptions', [
            'inventory_item_id' => $item->id,
            'quantity' => 2,
            'reason' => 'Staff lunch',
        ]);

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/consumptions');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
    }
}
