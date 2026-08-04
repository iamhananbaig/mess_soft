<?php

namespace Tests\Feature;

use App\Models\User;
use Tests\TestCase;

class EmployeeTest extends TestCase
{
    public function test_list_employees(): void
    {
        User::create(['name' => 'Cashier', 'email' => 'cashier@test.com', 'password' => bcrypt('password')]);

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/employees');

        $response->assertOk();
        $this->assertCount(2, $response->json());
    }

    public function test_update_employee(): void
    {
        $employee = User::create(['name' => 'Cashier', 'email' => 'cashier@test.com', 'password' => bcrypt('password')]);

        $response = $this->withHeaders($this->authHeaders())->putJson("/api/v1/employees/{$employee->id}", [
            'name' => 'Cashier Updated',
        ]);

        $response->assertOk()->assertJsonFragment(['name' => 'Cashier Updated']);
    }

    public function test_update_employee_role(): void
    {
        $employee = User::create(['name' => 'Cashier', 'email' => 'cashier@test.com', 'password' => bcrypt('password')]);
        $employee->assignRole('cashier');

        $response = $this->withHeaders($this->authHeaders())->postJson("/api/v1/employees/{$employee->id}/role", [
            'role' => 'manager',
        ]);

        $response->assertOk();
        $this->assertTrue($employee->fresh()->hasRole('manager'));
    }

    public function test_update_employee_role_validation(): void
    {
        $employee = User::create(['name' => 'Cashier', 'email' => 'cashier@test.com', 'password' => bcrypt('password')]);

        $response = $this->withHeaders($this->authHeaders())->postJson("/api/v1/employees/{$employee->id}/role", [
            'role' => 'nonexistent',
        ]);

        $response->assertUnprocessable();
    }
}
