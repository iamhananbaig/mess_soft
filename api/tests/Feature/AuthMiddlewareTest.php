<?php

namespace Tests\Feature;

use Tests\TestCase;

class AuthMiddlewareTest extends TestCase
{
    public function test_unauthenticated_requests_rejected(): void
    {
        $endpoints = [
            ['GET', '/api/v1/me'],
            ['POST', '/api/v1/logout'],
            ['GET', '/api/v1/categories'],
            ['POST', '/api/v1/categories'],
            ['GET', '/api/v1/menu'],
            ['POST', '/api/v1/menu'],
            ['GET', '/api/v1/inventory'],
            ['POST', '/api/v1/inventory'],
            ['POST', '/api/v1/inventory/stock-in'],
            ['POST', '/api/v1/sales'],
            ['GET', '/api/v1/sales'],
            ['POST', '/api/v1/consumptions'],
            ['GET', '/api/v1/consumptions'],
            ['GET', '/api/v1/reports/daily'],
            ['GET', '/api/v1/reports/items'],
            ['GET', '/api/v1/reports/stock'],
            ['GET', '/api/v1/reports/waste'],
            ['GET', '/api/v1/employees'],
        ];

        foreach ($endpoints as [$method, $uri]) {
            $response = $this->json($method, $uri);
            $response->assertUnauthorized("{$method} {$uri} should require auth");
        }
    }

    public function test_authenticated_requests_pass(): void
    {
        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/me');
        $response->assertOk();
    }
}
