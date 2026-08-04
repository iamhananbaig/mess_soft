<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\InventoryItem;
use App\Models\ManualConsumption;
use App\Models\MenuItem;
use App\Models\Recipe;
use App\Models\StockMovement;
use Tests\TestCase;

class ReportTest extends TestCase
{
    public function test_daily_report(): void
    {
        $cat = Category::create(['name' => 'Drinks']);
        $coke = MenuItem::create(['category_id' => $cat->id, 'name' => 'Coke', 'price' => 60]);
        $cokeInv = InventoryItem::create(['name' => 'Coke', 'unit' => 'pcs', 'cost_per_unit' => 40, 'current_stock' => 60]);
        Recipe::create(['menu_item_id' => $coke->id, 'inventory_item_id' => $cokeInv->id, 'quantity' => 1]);

        $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $coke->id, 'quantity' => 3]],
        ]);

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/daily');

        $response->assertOk()->assertJsonStructure([
            'date', 'total_sales', 'total_transactions', 'items_sold',
        ]);
        $this->assertEquals(180, $response->json('total_sales'));
        $this->assertEquals(1, $response->json('total_transactions'));
        $this->assertEquals(3, $response->json('items_sold'));
    }

    public function test_daily_report_by_date(): void
    {
        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/daily?date=2025-01-01');

        $response->assertOk()->assertJsonFragment(['date' => '2025-01-01']);
    }

    public function test_items_report(): void
    {
        $cat = Category::create(['name' => 'Drinks']);
        $coke = MenuItem::create(['category_id' => $cat->id, 'name' => 'Coke', 'price' => 60]);
        $cokeInv = InventoryItem::create(['name' => 'Coke', 'unit' => 'pcs', 'cost_per_unit' => 40, 'current_stock' => 60]);
        Recipe::create(['menu_item_id' => $coke->id, 'inventory_item_id' => $cokeInv->id, 'quantity' => 1]);

        $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $coke->id, 'quantity' => 3]],
        ]);

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/items');

        $response->assertOk();
        $this->assertCount(1, $response->json());
        $this->assertEquals(3, $response->json()[0]['total_quantity']);
    }

    public function test_stock_report(): void
    {
        InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'cost_per_unit' => 15, 'current_stock' => 50]);
        InventoryItem::create(['name' => 'Patty', 'unit' => 'pcs', 'cost_per_unit' => 80, 'current_stock' => 20]);

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/stock');

        $response->assertOk();
        $this->assertCount(2, $response->json());
        $this->assertArrayHasKey('total_value', $response->json()[0]);
    }

    public function test_waste_report_expiry(): void
    {
        $item = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'cost_per_unit' => 15, 'current_stock' => 50]);

        StockMovement::create([
            'inventory_item_id' => $item->id,
            'type' => 'expiry',
            'quantity' => -5,
            'note' => 'Expired batch',
            'user_id' => $this->testUser->id,
        ]);

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/waste');

        $response->assertOk()->assertJsonStructure(['expired', 'manual']);
        $this->assertCount(1, $response->json('expired'));
    }

    public function test_waste_report_manual_consumption(): void
    {
        $item = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'cost_per_unit' => 15, 'current_stock' => 50]);

        ManualConsumption::create([
            'inventory_item_id' => $item->id,
            'quantity' => 3,
            'reason' => 'Staff lunch',
            'user_id' => $this->testUser->id,
        ]);

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/waste');

        $response->assertOk();
        $this->assertCount(1, $response->json('manual'));
        $this->assertEquals('Staff lunch', $response->json('manual.0.reason'));
    }
}
