<?php

namespace Tests\Feature;

use App\Models\User;
use Tests\TestCase;

class UserManagementTest extends TestCase
{
    private function asUser(User $user): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders(['Authorization' => 'Bearer '.$user->createToken('t')->plainTextToken]);
    }

    private function login(string $email, string $password)
    {
        // Sanctum switches the default guard after a token request; a fresh request starts on 'web'.
        $this->app['auth']->forgetGuards();
        $this->app['auth']->shouldUse('web');

        return $this->withHeaders(['Authorization' => ''])->postJson('/api/v1/login', compact('email', 'password'));
    }

    public function test_admin_creates_user_who_can_log_in(): void
    {
        $this->withHeaders($this->authHeaders())->postJson('/api/v1/employees', [
            'name' => 'New Cashier', 'email' => 'New@Test.com', 'password' => 'secret123', 'role' => 'cashier',
        ])->assertCreated()->assertJsonPath('roles.0.name', 'cashier');

        $this->login('new@test.com', 'secret123')->assertOk();
    }

    public function test_user_can_hold_multiple_roles(): void
    {
        $id = $this->withHeaders($this->authHeaders())->postJson('/api/v1/employees', [
            'name' => 'Reg Staff', 'email' => 'reg@test.com', 'password' => 'secret123', 'roles' => ['cashier', 'manager'],
        ])->assertCreated()->json('id');

        $user = User::find($id);
        $this->assertTrue($user->hasAllRoles(['cashier', 'manager']));
        $this->assertTrue($user->can('sales:void-approve'));

        $this->withHeaders($this->authHeaders())
            ->postJson("/api/v1/employees/{$id}/role", ['roles' => ['cashier']])->assertOk();
        $this->assertFalse($user->fresh()->hasRole('manager'));
    }

    public function test_create_validation(): void
    {
        $this->withHeaders($this->authHeaders())->postJson('/api/v1/employees', [
            'name' => '', 'email' => 'test@test.com', 'password' => 'short', 'role' => 'nope',
        ])->assertUnprocessable()->assertJsonValidationErrors(['name', 'email', 'password', 'role']);
    }

    public function test_admin_cannot_create_super_admin(): void
    {
        $this->withHeaders($this->authHeaders())->postJson('/api/v1/employees', [
            'name' => 'X', 'email' => 'x@test.com', 'password' => 'secret123', 'role' => 'super-admin',
        ])->assertForbidden();
        $this->assertDatabaseMissing('users', ['email' => 'x@test.com']);
    }

    public function test_cashier_cannot_create_users(): void
    {
        $cashier = User::create(['name' => 'C', 'email' => 'c@test.com', 'password' => 'secret123']);
        $cashier->assignRole('cashier');

        $this->asUser($cashier)->postJson('/api/v1/employees', [
            'name' => 'X', 'email' => 'x@test.com', 'password' => 'secret123', 'role' => 'cashier',
        ])->assertForbidden();
    }

    public function test_admin_resets_password_and_signs_user_out(): void
    {
        $cashier = User::create(['name' => 'C', 'email' => 'c@test.com', 'password' => 'oldpass123']);
        $cashier->assignRole('cashier');
        $cashier->createToken('session');

        $this->withHeaders($this->authHeaders())
            ->putJson("/api/v1/employees/{$cashier->id}/password", ['password' => 'newpass123'])
            ->assertOk();

        $this->assertSame(0, $cashier->tokens()->count());
        $this->login('c@test.com', 'oldpass123')->assertUnauthorized();
        $this->login('c@test.com', 'newpass123')->assertOk();
    }

    public function test_admin_cannot_reset_super_admin_or_own_password(): void
    {
        $boss = User::create(['name' => 'B', 'email' => 'b@test.com', 'password' => 'secret123']);
        $boss->assignRole('super-admin');

        $this->withHeaders($this->authHeaders())
            ->putJson("/api/v1/employees/{$boss->id}/password", ['password' => 'newpass123'])->assertForbidden();
        $this->withHeaders($this->authHeaders())
            ->putJson("/api/v1/employees/{$this->testUser->id}/password", ['password' => 'newpass123'])->assertUnprocessable();
    }

    public function test_user_changes_own_password(): void
    {
        $this->testUser->createToken('other-device');

        $this->withHeaders($this->authHeaders())->putJson('/api/v1/me/password', [
            'current_password' => 'password',
            'password' => 'brandnew123',
            'password_confirmation' => 'brandnew123',
        ])->assertOk();

        // Current session kept, other sessions revoked.
        $this->assertSame(1, $this->testUser->tokens()->count());
        $this->login('test@test.com', 'brandnew123')->assertOk();
    }

    public function test_change_own_password_requires_correct_current_password(): void
    {
        $this->withHeaders($this->authHeaders())->putJson('/api/v1/me/password', [
            'current_password' => 'wrong',
            'password' => 'brandnew123',
            'password_confirmation' => 'brandnew123',
        ])->assertUnprocessable()->assertJsonValidationErrors(['current_password']);
    }
}
