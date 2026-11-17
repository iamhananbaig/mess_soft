<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\Sale;
use App\Models\User;
use Tests\TestCase;

class CashClosingTest extends TestCase
{
    private User $cashierA;

    private User $cashierB;

    private User $manager;

    private MenuItem $tea;

    protected function setUp(): void
    {
        parent::setUp();
        $this->cashierA = User::create(['name' => 'Ali', 'email' => 'a@test.com', 'password' => 'password1']);
        $this->cashierA->assignRole('cashier');
        $this->cashierB = User::create(['name' => 'Bilal', 'email' => 'b@test.com', 'password' => 'password1']);
        $this->cashierB->assignRole('cashier');
        $this->manager = User::create(['name' => 'Manager', 'email' => 'm@test.com', 'password' => 'password1']);
        $this->manager->assignRole('manager');

        $cat = Category::create(['name' => 'Drinks']);
        $this->tea = MenuItem::create(['category_id' => $cat->id, 'name' => 'Tea', 'price' => 100]);
    }

    private function as(User $user): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders(['Authorization' => 'Bearer '.$user->createToken('t')->plainTextToken]);
    }

    private function sell(User $cashier, int $qty): int
    {
        return $this->as($cashier)->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $this->tea->id, 'quantity' => $qty]],
            'amount_received' => 100 * $qty,
        ])->assertCreated()->json('id');
    }

    private function voidSale(int $saleId): void
    {
        $requestId = $this->as($this->cashierA)->postJson("/api/v1/sales/{$saleId}/void-requests", ['reason' => 'x'])->json('id');
        $this->as($this->manager)->postJson("/api/v1/void-requests/{$requestId}/approve")->assertOk();
    }

    private function report(): array
    {
        return $this->as($this->manager)->getJson('/api/v1/cash-closing?date='.today()->format('Y-m-d'))->assertOk()->json();
    }

    private function row(array $report, User $cashier): array
    {
        return collect($report['cashiers'])->firstWhere('user_id', $cashier->id);
    }

    public function test_report_splits_by_cashier_and_excludes_voids(): void
    {
        $this->sell($this->cashierA, 3);              // 300
        $voided = $this->sell($this->cashierA, 2);    // 200, voided
        $this->sell($this->cashierB, 1);              // 100
        $this->voidSale($voided);

        $report = $this->report();
        $a = $this->row($report, $this->cashierA);
        $this->assertSame(1, $a['sales_count']);
        $this->assertSame(500, $a['gross_amount']);
        $this->assertSame(1, $a['voided_count']);
        $this->assertSame(200, $a['voided_amount']);
        $this->assertSame(300, $a['expected_cash']);
        $this->assertNull($a['closing']);

        $this->assertSame(100, $this->row($report, $this->cashierB)['expected_cash']);
        $this->assertSame(400, $report['totals']['expected_cash']);
        $this->assertSame(2, $report['totals']['cashier_count']);
    }

    public function test_manager_closes_drawer_with_variance(): void
    {
        $this->sell($this->cashierA, 3); // expected 300

        $this->as($this->manager)->postJson('/api/v1/cash-closing', [
            'date' => today()->format('Y-m-d'), 'user_id' => $this->cashierA->id, 'counted_cash' => 280, 'note' => 'Rs.20 short',
        ])->assertCreated()->assertJson(['expected_cash' => 300, 'counted_cash' => 280, 'variance' => -20]);

        $a = $this->row($this->report(), $this->cashierA);
        $this->assertSame(-20, $a['closing']['variance']);
        $this->assertSame('Manager', $a['closing']['closed_by']);
        $this->assertFalse($a['changed_since_close']);
    }

    public function test_cannot_close_twice(): void
    {
        $this->sell($this->cashierA, 1);
        $payload = ['date' => today()->format('Y-m-d'), 'user_id' => $this->cashierA->id, 'counted_cash' => 100];

        $this->as($this->manager)->postJson('/api/v1/cash-closing', $payload)->assertCreated();
        $this->as($this->manager)->postJson('/api/v1/cash-closing', $payload)->assertUnprocessable();
    }

    public function test_cannot_close_with_pending_void(): void
    {
        $saleId = $this->sell($this->cashierA, 1);
        $this->as($this->cashierA)->postJson("/api/v1/sales/{$saleId}/void-requests", ['reason' => 'x'])->assertCreated();

        $this->as($this->manager)->postJson('/api/v1/cash-closing', [
            'date' => today()->format('Y-m-d'), 'user_id' => $this->cashierA->id, 'counted_cash' => 100,
        ])->assertUnprocessable()->assertJsonFragment(['message' => 'Resolve 1 pending void request(s) for this cashier before closing']);
    }

    public function test_void_after_close_is_flagged(): void
    {
        $saleId = $this->sell($this->cashierA, 2);
        $this->as($this->manager)->postJson('/api/v1/cash-closing', [
            'date' => today()->format('Y-m-d'), 'user_id' => $this->cashierA->id, 'counted_cash' => 200,
        ])->assertCreated();

        $this->voidSale($saleId);

        $a = $this->row($this->report(), $this->cashierA);
        $this->assertSame(200, $a['closing']['expected_cash']); // snapshot unchanged
        $this->assertSame(0, $a['expected_cash']);              // live figure
        $this->assertTrue($a['changed_since_close']);
    }

    public function test_cashier_cannot_close_or_view(): void
    {
        $this->as($this->cashierA)->getJson('/api/v1/cash-closing')->assertForbidden();
        $this->as($this->cashierA)->postJson('/api/v1/cash-closing', [
            'date' => today()->format('Y-m-d'), 'user_id' => $this->cashierA->id, 'counted_cash' => 0,
        ])->assertForbidden();
    }

    public function test_cannot_close_future_date(): void
    {
        $this->as($this->manager)->postJson('/api/v1/cash-closing', [
            'date' => today()->addDay()->format('Y-m-d'), 'user_id' => $this->cashierA->id, 'counted_cash' => 0,
        ])->assertUnprocessable();
    }

    public function test_other_days_not_included(): void
    {
        $saleId = $this->sell($this->cashierA, 1);
        Sale::whereKey($saleId)->update(['created_at' => now()->subDay()]);

        $this->assertSame([], $this->report()['cashiers']);
    }
}
