<?php

namespace Tests\Feature;

use App\Models\Category;
use Tests\TestCase;

class CategoryTest extends TestCase
{
    public function test_list_categories(): void
    {
        Category::create(['name' => 'Drinks', 'sort_order' => 2]);
        Category::create(['name' => 'Burgers', 'sort_order' => 1]);

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/categories');

        $response->assertOk();
        $data = $response->json();
        $this->assertEquals('Burgers', $data[0]['name']);
        $this->assertEquals('Drinks', $data[1]['name']);
    }

    public function test_create_category(): void
    {
        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/categories', [
            'name' => 'Snacks',
            'sort_order' => 3,
        ]);

        $response->assertCreated()->assertJsonFragment(['name' => 'Snacks']);
        $this->assertDatabaseHas('categories', ['name' => 'Snacks']);
    }

    public function test_create_category_unique_name(): void
    {
        Category::create(['name' => 'Drinks']);

        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/categories', ['name' => 'Drinks']);

        $response->assertUnprocessable();
    }

    public function test_create_category_validation(): void
    {
        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/categories', ['name' => '']);
        $response->assertUnprocessable();
    }

    public function test_update_category(): void
    {
        $category = Category::create(['name' => 'Drinks']);

        $response = $this->withHeaders($this->authHeaders())->putJson("/api/v1/categories/{$category->id}", [
            'name' => 'Beverages',
        ]);

        $response->assertOk()->assertJsonFragment(['name' => 'Beverages']);
    }

    public function test_delete_category(): void
    {
        $category = Category::create(['name' => 'Drinks']);

        $response = $this->withHeaders($this->authHeaders())->deleteJson("/api/v1/categories/{$category->id}");

        $response->assertOk()->assertJson(['message' => 'Category deleted']);
        $this->assertDatabaseMissing('categories', ['id' => $category->id]);
    }
}
