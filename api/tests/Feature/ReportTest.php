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
        $cokeInv = InventoryItem::create(['name' => 'Coke', 'unit' => 'pcs', 'current_stock' => 60]);
        Recipe::create(['menu_item_id' => $coke->id, 'inventory_item_id' => $cokeInv->id, 'quantity' => 1]);

        $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $coke->id, 'quantity' => 3]],
            'amount_received' => 180,
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
        $cokeInv = InventoryItem::create(['name' => 'Coke', 'unit' => 'pcs', 'current_stock' => 60]);
        Recipe::create(['menu_item_id' => $coke->id, 'inventory_item_id' => $cokeInv->id, 'quantity' => 1]);

        $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $coke->id, 'quantity' => 3]],
            'amount_received' => 180,
        ]);

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/items');

        $response->assertOk();
        $this->assertCount(1, $response->json());
        $this->assertEquals(3, $response->json()[0]['total_quantity']);
    }

    public function test_stock_report(): void
    {
        InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 50]);
        InventoryItem::create(['name' => 'Patty', 'unit' => 'pcs', 'current_stock' => 20]);

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/stock');

        $response->assertOk();
        $this->assertCount(2, $response->json());
    }

    public function test_waste_report_expiry(): void
    {
        $item = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 50]);

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
        $item = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 50]);

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

    public function test_stock_summary(): void
    {
        $bun = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 74]);

        StockMovement::create(['inventory_item_id' => $bun->id, 'type' => 'in', 'source' => 'stock-in', 'quantity' => 30, 'user_id' => $this->testUser->id]);
        StockMovement::create(['inventory_item_id' => $bun->id, 'type' => 'out', 'source' => 'sale', 'quantity' => -2, 'user_id' => $this->testUser->id]);
        StockMovement::create(['inventory_item_id' => $bun->id, 'type' => 'out', 'source' => 'manual', 'quantity' => -3, 'user_id' => $this->testUser->id]);
        StockMovement::create(['inventory_item_id' => $bun->id, 'type' => 'expiry', 'source' => 'expiry', 'quantity' => -2, 'user_id' => $this->testUser->id]);
        StockMovement::create(['inventory_item_id' => $bun->id, 'type' => 'adjustment', 'source' => 'adjustment', 'quantity' => 1, 'user_id' => $this->testUser->id]);

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/stock-summary');

        $response->assertOk();
        $this->assertCount(1, $response->json());

        $data = $response->json()[0];
        $this->assertEquals($bun->id, $data['id']);
        $this->assertEquals('Bun', $data['name']);
        $this->assertEquals('pcs', $data['unit']);
        $this->assertEquals(50.0, $data['opening']);
        $this->assertEquals(30.0, $data['additions']);
        $this->assertEquals(-2.0, $data['pos_consumption']);
        $this->assertEquals(-3.0, $data['manual_consumption']);
        $this->assertEquals(-2.0, $data['expired']);
        $this->assertEquals(1.0, $data['adjustments']);
        $this->assertEquals(74.0, $data['closing']);
    }

    public function test_stock_summary_empty(): void
    {
        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/stock-summary');

        $response->assertOk();
        $this->assertCount(0, $response->json());
    }

    public function test_stock_summary_excludes_inactive_items(): void
    {
        InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 50, 'is_active' => false]);

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/stock-summary');

        $response->assertOk();
        $this->assertCount(0, $response->json());
    }

    public function test_stock_summary_with_date_range(): void
    {
        $bun = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 28]);

        StockMovement::create(['inventory_item_id' => $bun->id, 'type' => 'in', 'source' => 'stock-in', 'quantity' => 30, 'created_at' => now()->subDays(2), 'user_id' => $this->testUser->id]);
        StockMovement::create(['inventory_item_id' => $bun->id, 'type' => 'out', 'source' => 'sale', 'quantity' => -2, 'created_at' => now()->subDays(1), 'user_id' => $this->testUser->id]);

        $from = now()->subDays(5)->format('Y-m-d');
        $to = now()->format('Y-m-d');
        $response = $this->withHeaders($this->authHeaders())->getJson("/api/v1/reports/stock-summary?from={$from}&to={$to}");

        $response->assertOk();
        $data = $response->json()[0];
        $this->assertEquals(30.0, $data['additions']);
        $this->assertEquals(-2.0, $data['pos_consumption']);
        $this->assertEquals(0.0, $data['opening']);
        $this->assertEquals(28.0, $data['closing']);
    }

    public function test_ledger(): void
    {
        $bun = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 28]);

        StockMovement::create(['inventory_item_id' => $bun->id, 'type' => 'in', 'source' => 'stock-in', 'quantity' => 30, 'reference' => 'PO-001', 'user_id' => $this->testUser->id]);
        StockMovement::create(['inventory_item_id' => $bun->id, 'type' => 'out', 'source' => 'sale', 'quantity' => -2, 'user_id' => $this->testUser->id]);
        StockMovement::create(['inventory_item_id' => $bun->id, 'type' => 'out', 'source' => 'manual', 'quantity' => -3, 'note' => 'Staff lunch', 'user_id' => $this->testUser->id]);

        $response = $this->withHeaders($this->authHeaders())->getJson("/api/v1/reports/ledger?inventory_item_id={$bun->id}");

        $response->assertOk();
        $this->assertEquals($bun->id, $response->json('item.id'));
        $this->assertEquals('Bun', $response->json('item.name'));
        $this->assertEquals('pcs', $response->json('item.unit'));
        $this->assertEquals(3.0, $response->json('opening_stock'));
        $this->assertEquals(28.0, $response->json('closing_stock'));

        $movements = $response->json('movements');
        $this->assertCount(3, $movements);

        $this->assertEquals(33.0, $movements[0]['balance']);
        $this->assertEquals('Stock In', $movements[0]['source_label']);
        $this->assertEquals('PO-001', $movements[0]['reference']);

        $this->assertEquals(31.0, $movements[1]['balance']);
        $this->assertEquals('POS Sale', $movements[1]['source_label']);

        $this->assertEquals(28.0, $movements[2]['balance']);
        $this->assertEquals('Manual Consumption', $movements[2]['source_label']);
        $this->assertEquals('Staff lunch', $movements[2]['note']);
    }

    public function test_ledger_validation(): void
    {
        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/ledger');

        $response->assertUnprocessable();
    }

    public function test_ledger_invalid_item(): void
    {
        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/ledger?inventory_item_id=999');

        $response->assertUnprocessable();
    }
}
