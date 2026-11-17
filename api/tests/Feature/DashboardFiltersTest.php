<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\Recipe;
use App\Models\User;
use Tests\TestCase;

class DashboardFiltersTest extends TestCase
{
    private MenuItem $tea;

    private MenuItem $chips;

    protected function setUp(): void
    {
        parent::setUp();
        $drinks = Category::create(['name' => 'Drinks']);
        $snacks = Category::create(['name' => 'Snacks']);
        $this->tea = MenuItem::create(['category_id' => $drinks->id, 'name' => 'Tea', 'price' => 100]);
        $this->chips = MenuItem::create(['category_id' => $snacks->id, 'name' => 'Chips', 'price' => 50]);
        $this->withHeaders($this->authHeaders())->putJson('/api/v1/settings/pos', ['payment_methods' => ['cash', 'card']])->assertOk();
    }

    private function sell(MenuItem $item, int $qty, string $method = 'cash'): void
    {
        $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $item->id, 'quantity' => $qty]],
            'payment_method' => $method,
            'amount_received' => $method === 'cash' ? $item->price * $qty : null,
        ])->assertCreated();
    }

    public function test_dashboard_summarises_today_and_alerts(): void
    {
        $milk = InventoryItem::create(['name' => 'Milk', 'unit' => 'l', 'current_stock' => 2, 'reorder_level' => 5, 'avg_cost' => 100,
            'expiry_date' => now()->addDays(2)->format('Y-m-d')]);
        Recipe::create(['menu_item_id' => $this->tea->id, 'inventory_item_id' => $milk->id, 'quantity' => 0.1]);

        $this->sell($this->tea, 2);           // 200, cost 2 × 10 = 20
        $this->sell($this->chips, 1, 'card'); // 50

        $d = $this->withHeaders($this->authHeaders())->getJson('/api/v1/dashboard')->assertOk()->json();
        $this->assertSame(250, $d['today']['revenue']);
        $this->assertSame(2, $d['today']['transactions']);
        $this->assertEquals(230.0, $d['today']['profit']);
        $this->assertCount(30, $d['trend']);
        $this->assertSame(250, end($d['trend'])['revenue']);
        $this->assertCount(24, $d['hourly']);
        $this->assertSame('Tea', $d['top_items'][0]['name']);
        $this->assertSame(['Cash', 'Card'], array_column($d['payments'], 'label'));
        $this->assertSame('Milk', $d['alerts']['low_stock'][0]['name']);
        $this->assertSame('Milk', $d['alerts']['expiring'][0]['name']);
        $this->assertSame(1, $d['alerts']['open_drawers']);
    }

    public function test_reports_filter_by_payment_category_and_cashier(): void
    {
        $this->sell($this->tea, 1);
        $this->sell($this->chips, 2, 'card');

        $byCard = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/daily?payment_method=card')->json();
        $this->assertSame(100, $byCard['total_sales']);

        $snacks = Category::where('name', 'Snacks')->first();
        $items = $this->withHeaders($this->authHeaders())->getJson("/api/v1/reports/items?category_id={$snacks->id}")->json();
        $this->assertCount(1, $items);

        $other = User::create(['name' => 'Other', 'email' => 'o@test.com', 'password' => 'password1']);
        $receipts = $this->withHeaders($this->authHeaders())->getJson("/api/v1/reports/receipts?user_id={$other->id}")->json('receipts');
        $this->assertCount(0, $receipts);
        $this->assertCount(2, $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/receipts')->json('receipts'));

        $cashiers = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/cashiers')->json();
        $this->assertSame([$this->testUser->id], array_column($cashiers, 'id'));
    }

    public function test_consumptions_filter(): void
    {
        $sugar = InventoryItem::create(['name' => 'Sugar', 'unit' => 'kg', 'current_stock' => 10]);
        $salt = InventoryItem::create(['name' => 'Salt', 'unit' => 'kg', 'current_stock' => 10]);
        foreach ([[$sugar, 'Staff tea'], [$salt, 'Spilled']] as [$item, $reason]) {
            $this->withHeaders($this->authHeaders())->postJson('/api/v1/consumptions', ['inventory_item_id' => $item->id, 'quantity' => 1, 'reason' => $reason])->assertCreated();
        }

        $this->assertCount(1, $this->withHeaders($this->authHeaders())->getJson("/api/v1/consumptions?inventory_item_id={$salt->id}")->json('data'));
        $this->assertCount(1, $this->withHeaders($this->authHeaders())->getJson('/api/v1/consumptions?search=staff')->json('data'));
    }
}
