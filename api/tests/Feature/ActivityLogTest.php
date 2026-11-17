<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Category;
use App\Models\MenuItem;
use App\Models\User;
use Tests\TestCase;

class ActivityLogTest extends TestCase
{
    public function test_price_change_is_logged_with_diff(): void
    {
        $cat = Category::create(['name' => 'Drinks']);
        $item = MenuItem::create(['category_id' => $cat->id, 'name' => 'Tea', 'price' => 50]);

        $this->withHeaders($this->authHeaders())->putJson("/api/v1/menu/{$item->id}", ['price' => 60, 'name' => 'Tea'])->assertOk();

        $log = ActivityLog::where('action', 'menu.updated')->latest('id')->first();
        $this->assertSame($this->testUser->id, $log->user_id);
        $this->assertEquals(['price' => ['from' => 50, 'to' => 60]], $log->changes); // unchanged name not recorded
    }

    public function test_role_and_permission_changes_are_logged(): void
    {
        $u = User::create(['name' => 'C', 'email' => 'c@test.com', 'password' => 'password1']);
        $u->assignRole('cashier');
        $this->withHeaders($this->authHeaders())->postJson("/api/v1/employees/{$u->id}/role", ['roles' => ['cashier', 'manager']])->assertOk();

        $log = ActivityLog::where('action', 'employee.roles_changed')->first();
        $this->assertEquals(['cashier'], $log->changes['roles']['from']);
        $this->assertEquals(['cashier', 'manager'], $log->changes['roles']['to']);
    }

    public function test_failed_and_successful_logins_are_logged(): void
    {
        $this->postJson('/api/v1/login', ['email' => 'test@test.com', 'password' => 'wrong'])->assertUnauthorized();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/login', ['email' => 'test@test.com', 'password' => 'password'])->assertOk();

        $this->assertDatabaseHas('activity_logs', ['action' => 'auth.failed', 'user_id' => null]);
        $this->assertDatabaseHas('activity_logs', ['action' => 'auth.login', 'user_id' => $this->testUser->id]);
    }

    public function test_admin_can_filter_and_cashier_cannot_view(): void
    {
        $cat = Category::create(['name' => 'Drinks']);
        $this->withHeaders($this->authHeaders())->postJson('/api/v1/menu', ['category_id' => $cat->id, 'name' => 'Tea', 'price' => 50])->assertCreated();
        $this->withHeaders($this->authHeaders())->postJson('/api/v1/categories', ['name' => 'Snacks'])->assertCreated();

        $menuOnly = $this->withHeaders($this->authHeaders())->getJson('/api/v1/activity?action=menu')->assertOk()->json('data');
        $this->assertCount(1, $menuOnly);
        $this->assertSame('menu.created', $menuOnly[0]['action']);

        $found = $this->withHeaders($this->authHeaders())->getJson('/api/v1/activity?search=Snacks')->json('data');
        $this->assertCount(1, $found);

        $cashier = User::create(['name' => 'C', 'email' => 'c@test.com', 'password' => 'password1']);
        $cashier->assignRole('cashier');
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => 'Bearer '.$cashier->createToken('t')->plainTextToken])
            ->getJson('/api/v1/activity')->assertForbidden();
    }
}
