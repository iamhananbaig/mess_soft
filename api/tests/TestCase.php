<?php

namespace Tests;

use App\Models\User;
use Database\Seeders\RolesAndPermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    use RefreshDatabase;

    protected User $testUser;
    protected string $testToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionSeeder::class);
        $this->testUser = User::create(['name' => 'Test User', 'email' => 'test@test.com', 'password' => bcrypt('password')]);
        $this->testUser->assignRole('admin');
        $this->testToken = $this->testUser->createToken('test-token')->plainTextToken;
    }

    protected function authHeaders(): array
    {
        return ['Authorization' => "Bearer {$this->testToken}"];
    }
}
