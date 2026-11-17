<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\Recipe;
use App\Models\Sale;
use App\Models\User;
use Tests\TestCase;

class VoidRequestTest extends TestCase
{
    private User $cashier;

    private User $manager;

    private InventoryItem $bun;

    private MenuItem $burger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->cashier = User::create(['name' => 'Cashier', 'email' => 'cashier@test.com', 'password' => bcrypt('password')]);
        $this->cashier->assignRole('cashier');
        $this->manager = User::create(['name' => 'Manager', 'email' => 'manager@test.com', 'password' => bcrypt('password')]);
        $this->manager->assignRole('manager');

        $cat = Category::create(['name' => 'Burgers']);
        $this->burger = MenuItem::create(['category_id' => $cat->id, 'name' => 'Burger', 'price' => 350]);
        $this->bun = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 10]);
        Recipe::create(['menu_item_id' => $this->burger->id, 'inventory_item_id' => $this->bun->id, 'quantity' => 1]);
    }

    private function as(User $user): static
    {
        // The auth guard caches the resolved user across requests within one test.
        $this->app['auth']->forgetGuards();

        return $this->withHeaders(['Authorization' => 'Bearer '.$user->createToken('t')->plainTextToken]);
    }

    private function makeSale(int $qty = 2): int
    {
        return $this->as($this->cashier)->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $this->burger->id, 'quantity' => $qty]],
            'amount_received' => 350 * $qty,
        ])->assertCreated()->json('id');
    }

    private function requestVoid(int $saleId, ?User $by = null): int
    {
        return $this->as($by ?? $this->cashier)
            ->postJson("/api/v1/sales/{$saleId}/void-requests", ['reason' => 'Wrong item'])
            ->assertCreated()->json('id');
    }

    public function test_cashier_can_request_void(): void
    {
        $saleId = $this->makeSale();
        $this->requestVoid($saleId);

        $this->assertDatabaseHas('void_requests', ['sale_id' => $saleId, 'status' => 'pending', 'requested_by' => $this->cashier->id]);
        $this->assertNull(Sale::find($saleId)->voided_at);
    }

    public function test_reason_is_required(): void
    {
        $saleId = $this->makeSale();
        $this->as($this->cashier)->postJson("/api/v1/sales/{$saleId}/void-requests", [])->assertUnprocessable();
    }

    public function test_duplicate_pending_request_rejected(): void
    {
        $saleId = $this->makeSale();
        $this->requestVoid($saleId);

        $this->as($this->cashier)
            ->postJson("/api/v1/sales/{$saleId}/void-requests", ['reason' => 'Again'])
            ->assertUnprocessable();
    }

    public function test_cashier_cannot_approve(): void
    {
        $requestId = $this->requestVoid($this->makeSale());
        $other = User::create(['name' => 'C2', 'email' => 'c2@test.com', 'password' => bcrypt('password')]);
        $other->assignRole('cashier');

        $this->as($other)->postJson("/api/v1/void-requests/{$requestId}/approve")->assertForbidden();
    }

    public function test_manager_approval_voids_sale_and_restores_stock(): void
    {
        $saleId = $this->makeSale(2);
        $this->assertEquals(8, (float) $this->bun->fresh()->current_stock);

        $requestId = $this->requestVoid($saleId);
        $this->as($this->manager)
            ->postJson("/api/v1/void-requests/{$requestId}/approve", ['note' => 'OK'])
            ->assertOk()->assertJsonPath('status', 'approved');

        $this->assertNotNull(Sale::find($saleId)->voided_at);
        $this->assertEquals(10, (float) $this->bun->fresh()->current_stock);
        $this->assertDatabaseHas('stock_movements', [
            'inventory_item_id' => $this->bun->id, 'source' => 'void', 'type' => 'in', 'quantity' => 2,
        ]);
        $this->assertDatabaseHas('void_requests', ['id' => $requestId, 'reviewed_by' => $this->manager->id, 'review_note' => 'OK']);
    }

    public function test_restores_what_was_consumed_even_if_recipe_changed(): void
    {
        $saleId = $this->makeSale(2);
        Recipe::where('menu_item_id', $this->burger->id)->update(['quantity' => 5]);

        $requestId = $this->requestVoid($saleId);
        $this->as($this->manager)->postJson("/api/v1/void-requests/{$requestId}/approve")->assertOk();

        $this->assertEquals(10, (float) $this->bun->fresh()->current_stock);
    }

    public function test_rejection_leaves_sale_and_stock_untouched(): void
    {
        $saleId = $this->makeSale(2);
        $requestId = $this->requestVoid($saleId);

        $this->as($this->manager)
            ->postJson("/api/v1/void-requests/{$requestId}/reject", ['note' => 'Customer took it'])
            ->assertOk()->assertJsonPath('status', 'rejected');

        $this->assertNull(Sale::find($saleId)->voided_at);
        $this->assertEquals(8, (float) $this->bun->fresh()->current_stock);
        // Can ask again after a rejection.
        $this->requestVoid($saleId);
    }

    public function test_cannot_review_twice(): void
    {
        $requestId = $this->requestVoid($this->makeSale());
        $this->as($this->manager)->postJson("/api/v1/void-requests/{$requestId}/approve")->assertOk();

        $this->as($this->manager)->postJson("/api/v1/void-requests/{$requestId}/approve")->assertUnprocessable();
        $this->as($this->manager)->postJson("/api/v1/void-requests/{$requestId}/reject")->assertUnprocessable();
        $this->assertEquals(10, (float) $this->bun->fresh()->current_stock);
    }

    public function test_cannot_approve_own_request(): void
    {
        $requestId = $this->requestVoid($this->makeSale(), $this->manager);

        $this->as($this->manager)->postJson("/api/v1/void-requests/{$requestId}/approve")->assertForbidden();
    }

    public function test_cannot_request_void_of_voided_sale(): void
    {
        $saleId = $this->makeSale();
        $requestId = $this->requestVoid($saleId);
        $this->as($this->manager)->postJson("/api/v1/void-requests/{$requestId}/approve")->assertOk();

        $this->as($this->cashier)
            ->postJson("/api/v1/sales/{$saleId}/void-requests", ['reason' => 'x'])
            ->assertUnprocessable();
    }

    public function test_requesters_see_only_their_own_requests(): void
    {
        $this->requestVoid($this->makeSale());
        $employee = User::create(['name' => 'E', 'email' => 'e@test.com', 'password' => bcrypt('password')]);
        $employee->assignRole('employee');
        $this->requestVoid($this->makeSale(), $employee);

        $this->assertCount(1, $this->as($this->cashier)->getJson('/api/v1/void-requests')->assertOk()->json('data'));
        $this->assertCount(2, $this->as($this->manager)->getJson('/api/v1/void-requests')->assertOk()->json('data'));
        $this->assertCount(2, $this->as($this->manager)->getJson('/api/v1/void-requests?status=pending')->json('data'));
    }

    public function test_voided_sales_excluded_from_daily_report(): void
    {
        $this->makeSale(1);
        $voidedId = $this->makeSale(2);
        $requestId = $this->requestVoid($voidedId);
        $this->as($this->manager)->postJson("/api/v1/void-requests/{$requestId}/approve")->assertOk();

        $report = $this->as($this->manager)->getJson('/api/v1/reports/daily')->assertOk();
        $this->assertEquals(350, $report->json('total_sales'));
        $this->assertEquals(1, $report->json('total_transactions'));
        $this->assertEquals(1, $report->json('items_sold'));
        $this->assertEquals(1, $report->json('voided_count'));
        $this->assertEquals(700, $report->json('voided_amount'));

        $receipts = collect($this->as($this->manager)->getJson('/api/v1/reports/receipts')->json('receipts'));
        $this->assertTrue($receipts->firstWhere('id', $voidedId)['is_voided']);

        $this->assertTrue($this->as($this->cashier)->getJson("/api/v1/sales/{$voidedId}/receipt")->json('voided'));
    }

    public function test_stock_summary_shows_void_returns(): void
    {
        $saleId = $this->makeSale(2);
        $requestId = $this->requestVoid($saleId);
        $this->as($this->manager)->postJson("/api/v1/void-requests/{$requestId}/approve")->assertOk();

        $row = collect($this->as($this->manager)->getJson('/api/v1/reports/stock-summary')->json())->firstWhere('id', $this->bun->id);
        $this->assertEquals(-2.0, $row['pos_consumption']);
        $this->assertEquals(2.0, $row['void_returns']);
        $this->assertEquals(10.0, $row['closing']);
    }
}
