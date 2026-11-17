<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\Recipe;
use App\Models\User;
use Tests\TestCase;

class CostsPaymentsTest extends TestCase
{
    private InventoryItem $bun;

    private InventoryItem $patty;

    private MenuItem $burger;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bun = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 0, 'reorder_level' => 5]);
        $this->patty = InventoryItem::create(['name' => 'Patty', 'unit' => 'pcs', 'current_stock' => 0, 'reorder_level' => 5]);
        $cat = Category::create(['name' => 'Burgers']);
        $this->burger = MenuItem::create(['category_id' => $cat->id, 'name' => 'Burger', 'price' => 400]);
        Recipe::create(['menu_item_id' => $this->burger->id, 'inventory_item_id' => $this->bun->id, 'quantity' => 1]);
        Recipe::create(['menu_item_id' => $this->burger->id, 'inventory_item_id' => $this->patty->id, 'quantity' => 1]);
    }

    private function stockIn(InventoryItem $item, float $qty, array $cost = []): void
    {
        $this->withHeaders($this->authHeaders())->postJson('/api/v1/inventory/stock-in', [
            'inventory_item_id' => $item->id, 'quantity' => $qty, ...$cost,
        ])->assertOk();
    }

    private function enableMethods(array $methods): void
    {
        $this->withHeaders($this->authHeaders())->putJson('/api/v1/settings/pos', ['payment_methods' => $methods])->assertOk();
    }

    public function test_weighted_average_cost_from_stock_in(): void
    {
        $this->stockIn($this->bun, 10, ['unit_cost' => 20]);   // 10 @ 20
        $this->stockIn($this->bun, 10, ['total_cost' => 300]); // 10 @ 30
        $this->assertEquals(25.0, (float) $this->bun->fresh()->avg_cost);
        $this->assertEquals(20.0, (float) $this->bun->fresh()->current_stock);

        $this->stockIn($this->bun, 5); // no cost given → average unchanged
        $this->assertEquals(25.0, (float) $this->bun->fresh()->avg_cost);
    }

    public function test_sale_snapshots_food_cost_and_reports_profit(): void
    {
        $this->stockIn($this->bun, 10, ['unit_cost' => 20]);
        $this->stockIn($this->patty, 10, ['unit_cost' => 100]);

        $menu = collect($this->withHeaders($this->authHeaders())->getJson('/api/v1/menu')->json())->firstWhere('id', $this->burger->id);
        $this->assertEquals(120.0, $menu['food_cost']);
        $this->assertEquals(70.0, $menu['margin']);

        $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $this->burger->id, 'quantity' => 2]], 'amount_received' => 800,
        ])->assertCreated();

        // Later purchases at a higher price don't change the cost of past sales.
        $this->stockIn($this->patty, 10, ['unit_cost' => 200]);

        $daily = $this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/daily')->assertOk();
        $this->assertEquals(800, $daily->json('total_sales'));
        $this->assertEquals(240.0, $daily->json('total_cost'));
        $this->assertEquals(560.0, $daily->json('gross_profit'));
        $this->assertSame(0, $daily->json('uncosted_quantity'));

        $row = collect($this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/items')->json())->firstWhere('menu_item_id', $this->burger->id);
        $this->assertEquals(560.0, $row['profit']);
        $this->assertEquals(70.0, $row['margin']);
    }

    public function test_stock_summary_includes_value(): void
    {
        $this->stockIn($this->bun, 10, ['unit_cost' => 20]);
        $row = collect($this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/stock-summary')->json())->firstWhere('id', $this->bun->id);
        $this->assertEquals(200.0, $row['closing_value']);
    }

    public function test_reorder_level_and_cost_editable(): void
    {
        $this->withHeaders($this->authHeaders())->putJson("/api/v1/inventory/{$this->bun->id}", [
            'reorder_level' => 12.5, 'avg_cost' => 18, 'expiry_date' => now()->addDays(3)->format('Y-m-d'),
        ])->assertOk()->assertJson(['reorder_level' => '12.50', 'avg_cost' => '18.0000']);
    }

    public function test_only_enabled_payment_methods_are_accepted(): void
    {
        $this->stockIn($this->bun, 10);
        $this->stockIn($this->patty, 10);
        $sale = ['items' => [['menu_item_id' => $this->burger->id, 'quantity' => 1]]];

        $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', $sale + ['payment_method' => 'jazzcash'])
            ->assertUnprocessable();

        $this->enableMethods(['cash', 'jazzcash']);
        $id = $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', $sale + ['payment_method' => 'jazzcash', 'payment_reference' => 'TX123'])
            ->assertCreated()->json('id');

        $this->withHeaders($this->authHeaders())->getJson("/api/v1/sales/{$id}/receipt")
            ->assertJson(['payment_method' => 'JazzCash', 'payment_reference' => 'TX123', 'amount_received' => 400, 'change' => 0]);
    }

    public function test_cash_closing_counts_only_cash_and_uses_float(): void
    {
        $this->stockIn($this->bun, 10);
        $this->stockIn($this->patty, 10);
        $this->enableMethods(['cash', 'card']);
        $sale = ['items' => [['menu_item_id' => $this->burger->id, 'quantity' => 1]]];
        $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', $sale + ['amount_received' => 400])->assertCreated();
        $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', $sale + ['payment_method' => 'card'])->assertCreated();

        $manager = User::create(['name' => 'M', 'email' => 'm@test.com', 'password' => 'password1']);
        $manager->assignRole('manager');
        $this->app['auth']->forgetGuards();
        $h = ['Authorization' => 'Bearer '.$manager->createToken('t')->plainTextToken];

        $row = collect($this->withHeaders($h)->getJson('/api/v1/cash-closing')->json('cashiers'))->firstWhere('user_id', $this->testUser->id);
        $this->assertSame(400, $row['expected_cash']);
        $this->assertSame(400, $row['non_cash_amount']);
        $this->assertSame('Card', $row['non_cash'][0]['label']);

        // Drawer started with Rs.1000 change; counted 1390 → Rs.10 short.
        $this->withHeaders($h)->postJson('/api/v1/cash-closing', [
            'date' => today()->format('Y-m-d'), 'user_id' => $this->testUser->id, 'opening_float' => 1000, 'counted_cash' => 1390,
        ])->assertCreated()->assertJson(['expected_cash' => 400, 'opening_float' => 1000, 'non_cash_amount' => 400, 'variance' => -10]);
    }

    public function test_daily_report_breaks_down_payments(): void
    {
        $this->stockIn($this->bun, 10);
        $this->stockIn($this->patty, 10);
        $this->enableMethods(['cash', 'easypaisa']);
        $sale = ['items' => [['menu_item_id' => $this->burger->id, 'quantity' => 1]]];
        $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', $sale + ['amount_received' => 500])->assertCreated();
        $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', $sale + ['payment_method' => 'easypaisa'])->assertCreated();

        $payments = collect($this->withHeaders($this->authHeaders())->getJson('/api/v1/reports/daily')->json('payments'))->keyBy('method');
        $this->assertSame(400, $payments['cash']['amount']);
        $this->assertSame(400, $payments['easypaisa']['amount']);
    }

    public function test_cannot_disable_every_payment_method(): void
    {
        $this->withHeaders($this->authHeaders())->putJson('/api/v1/settings/pos', ['payment_methods' => []])->assertUnprocessable();
        $this->withHeaders($this->authHeaders())->putJson('/api/v1/settings/pos', ['payment_methods' => ['bitcoin']])->assertUnprocessable();
    }
}
