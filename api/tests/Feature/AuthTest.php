<?php

namespace Tests\Feature;

use App\Models\User;
use Tests\TestCase;

class AuthTest extends TestCase
{
    public function test_login_success(): void
    {
        $response = $this->postJson('/api/v1/login', [
            'email' => 'test@test.com',
            'password' => 'password',
        ]);

        $response->assertOk()->assertJsonStructure(['token', 'user' => ['id', 'name', 'email', 'roles', 'permissions']]);
    }

    public function test_login_invalid_credentials(): void
    {
        $response = $this->postJson('/api/v1/login', [
            'email' => 'test@test.com',
            'password' => 'wrong',
        ]);

        $response->assertUnauthorized()->assertJson(['message' => 'Invalid credentials']);
    }

    public function test_login_validation(): void
    {
        $response = $this->postJson('/api/v1/login', ['email' => 'bad', 'password' => '']);
        $response->assertUnprocessable();
    }

    public function test_me_returns_authenticated_user(): void
    {
        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/me');

        $response->assertOk()->assertJson([
            'id' => $this->testUser->id,
            'name' => 'Test User',
            'email' => 'test@test.com',
        ]);
    }

    public function test_me_requires_auth(): void
    {
        $response = $this->getJson('/api/v1/me');
        $response->assertUnauthorized();
    }

    public function test_logout_deletes_token(): void
    {
        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/logout');

        $response->assertOk()->assertJson(['message' => 'Logged out']);

        // Clear Sanctum's cached guard so the deleted token is re-checked
        $this->app->make('auth')->forgetGuards();

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/me');
        $response->assertUnauthorized();
    }
}
