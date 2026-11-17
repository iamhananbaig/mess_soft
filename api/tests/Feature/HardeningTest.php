<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\Recipe;
use App\Models\StockMovement;
use App\Models\User;
use Database\Seeders\RolesAndPermissionSeeder;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class HardeningTest extends TestCase
{
    public function test_sale_checks_combined_demand_for_shared_ingredient(): void
    {
        $cat = Category::create(['name' => 'Burgers']);
        $chicken = MenuItem::create(['category_id' => $cat->id, 'name' => 'Chicken Burger', 'price' => 350]);
        $beef = MenuItem::create(['category_id' => $cat->id, 'name' => 'Beef Burger', 'price' => 400]);
        $bun = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 1]);
        Recipe::create(['menu_item_id' => $chicken->id, 'inventory_item_id' => $bun->id, 'quantity' => 1]);
        Recipe::create(['menu_item_id' => $beef->id, 'inventory_item_id' => $bun->id, 'quantity' => 1]);

        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [
                ['menu_item_id' => $chicken->id, 'quantity' => 1],
                ['menu_item_id' => $beef->id, 'quantity' => 1],
            ],
            'amount_received' => 1000,
        ]);

        $response->assertUnprocessable();
        $this->assertDatabaseHas('inventory_items', ['id' => $bun->id, 'current_stock' => 1]);
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_sale_rejects_inactive_menu_item(): void
    {
        $cat = Category::create(['name' => 'Drinks']);
        $item = MenuItem::create(['category_id' => $cat->id, 'name' => 'Old Drink', 'price' => 50, 'is_active' => false]);

        $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]],
            'amount_received' => 50,
        ])->assertUnprocessable();
    }

    public function test_deactivating_employee_revokes_their_tokens(): void
    {
        $cashier = User::create(['name' => 'Cashier', 'email' => 'c@test.com', 'password' => bcrypt('password')]);
        $cashier->assignRole('cashier');
        $cashier->createToken('auth-token');

        $this->withHeaders($this->authHeaders())
            ->putJson("/api/v1/employees/{$cashier->id}", ['is_active' => false])
            ->assertOk();

        $this->assertSame(0, $cashier->tokens()->count());
    }

    public function test_admin_cannot_grant_super_admin_role(): void
    {
        $cashier = User::create(['name' => 'Cashier', 'email' => 'c@test.com', 'password' => bcrypt('password')]);
        $cashier->assignRole('cashier');

        $this->withHeaders($this->authHeaders())
            ->postJson("/api/v1/employees/{$cashier->id}/role", ['role' => 'super-admin'])
            ->assertForbidden();

        $this->assertFalse($cashier->fresh()->hasRole('super-admin'));
    }

    public function test_admin_cannot_modify_super_admin_account(): void
    {
        $boss = User::create(['name' => 'Boss', 'email' => 'boss@test.com', 'password' => bcrypt('password')]);
        $boss->assignRole('super-admin');

        $this->withHeaders($this->authHeaders())
            ->putJson("/api/v1/employees/{$boss->id}", ['is_active' => false])
            ->assertForbidden();
        $this->withHeaders($this->authHeaders())
            ->postJson("/api/v1/employees/{$boss->id}/role", ['role' => 'cashier'])
            ->assertForbidden();

        $this->assertTrue($boss->fresh()->hasRole('super-admin'));
    }

    public function test_super_admin_can_grant_super_admin_role(): void
    {
        $this->testUser->syncRoles(['super-admin']);
        $admin = User::create(['name' => 'Admin', 'email' => 'a@test.com', 'password' => bcrypt('password')]);
        $admin->assignRole('admin');

        $this->withHeaders($this->authHeaders())
            ->postJson("/api/v1/employees/{$admin->id}/role", ['role' => 'super-admin'])
            ->assertOk();
    }

    public function test_adjust_accepts_negative_decimal(): void
    {
        $item = InventoryItem::create(['name' => 'Oil', 'unit' => 'kg', 'current_stock' => 5]);

        $this->withHeaders($this->authHeaders())
            ->postJson("/api/v1/inventory/{$item->id}/adjust", ['quantity' => -1.5])
            ->assertOk();

        $this->assertEquals(3.5, (float) $item->fresh()->current_stock);
    }

    public function test_stock_summary_closing_reflects_past_period_end(): void
    {
        // Stock today is 20: 10 opened the period, +5 inside it, +5 after it ended.
        $bun = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 20]);
        StockMovement::create(['inventory_item_id' => $bun->id, 'type' => 'in', 'source' => 'stock-in', 'quantity' => 5, 'user_id' => $this->testUser->id])
            ->forceFill(['created_at' => now()->subDays(10)])->save();
        StockMovement::create(['inventory_item_id' => $bun->id, 'type' => 'in', 'source' => 'stock-in', 'quantity' => 5, 'user_id' => $this->testUser->id])
            ->forceFill(['created_at' => now()->subDays(2)])->save();

        $from = now()->subDays(12)->format('Y-m-d');
        $to = now()->subDays(5)->format('Y-m-d');

        $summary = $this->withHeaders($this->authHeaders())
            ->getJson("/api/v1/reports/stock-summary?from={$from}&to={$to}")
            ->assertOk()->json()[0];
        $this->assertEquals(10.0, $summary['opening']);
        $this->assertEquals(15.0, $summary['closing']);

        $ledger = $this->withHeaders($this->authHeaders())
            ->getJson("/api/v1/reports/ledger?inventory_item_id={$bun->id}&from={$from}&to={$to}")
            ->assertOk();
        $this->assertEquals(10.0, $ledger->json('opening_stock'));
        $this->assertEquals(15.0, $ledger->json('closing_stock'));
    }

    public function test_permission_seeder_is_idempotent_and_keeps_custom_permissions(): void
    {
        Role::findByName('cashier')->revokePermissionTo('sales:view');

        $this->seed(RolesAndPermissionSeeder::class);

        $this->assertFalse(Role::findByName('cashier')->fresh()->hasPermissionTo('sales:view'));
        $this->assertTrue(Role::findByName('super-admin')->hasPermissionTo('employees:edit'));
    }
}
