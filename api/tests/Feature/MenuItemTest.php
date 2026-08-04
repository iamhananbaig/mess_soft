<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\MenuItem;
use Tests\TestCase;

class MenuItemTest extends TestCase
{
    public function test_list_menu_items(): void
    {
        $cat = Category::create(['name' => 'Burgers']);
        MenuItem::create(['category_id' => $cat->id, 'name' => 'Burger', 'price' => 300]);
        MenuItem::create(['category_id' => $cat->id, 'name' => 'Chicken', 'price' => 250, 'is_active' => false]);

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/menu');

        $response->assertOk();
        $this->assertCount(1, $response->json()); // only active
    }

    public function test_create_menu_item(): void
    {
        $cat = Category::create(['name' => 'Burgers']);

        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/menu', [
            'category_id' => $cat->id,
            'name' => 'Burger',
            'price' => 300,
            'description' => 'Tasty',
        ]);

        $response->assertCreated()->assertJsonFragment(['name' => 'Burger', 'price' => 300]);
        $this->assertDatabaseHas('menu_items', ['name' => 'Burger', 'price' => 300]);
    }

    public function test_create_menu_item_validation(): void
    {
        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/menu', [
            'category_id' => 999,
            'name' => '',
            'price' => -1,
        ]);

        $response->assertUnprocessable();
    }

    public function test_update_menu_item(): void
    {
        $cat = Category::create(['name' => 'Burgers']);
        $item = MenuItem::create(['category_id' => $cat->id, 'name' => 'Burger', 'price' => 300]);

        $response = $this->withHeaders($this->authHeaders())->putJson("/api/v1/menu/{$item->id}", [
            'price' => 350,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('menu_items', ['id' => $item->id, 'price' => 350]);
    }

    public function test_soft_delete_menu_item(): void
    {
        $cat = Category::create(['name' => 'Burgers']);
        $item = MenuItem::create(['category_id' => $cat->id, 'name' => 'Burger', 'price' => 300]);

        $response = $this->withHeaders($this->authHeaders())->deleteJson("/api/v1/menu/{$item->id}");

        $response->assertOk()->assertJson(['message' => 'Menu item deactivated']);
        $this->assertDatabaseHas('menu_items', ['id' => $item->id, 'is_active' => 0]);
    }

    public function test_show_menu_item(): void
    {
        $cat = Category::create(['name' => 'Burgers']);
        $item = MenuItem::create(['category_id' => $cat->id, 'name' => 'Burger', 'price' => 300]);

        $response = $this->withHeaders($this->authHeaders())->getJson("/api/v1/menu/{$item->id}");

        $response->assertOk();
        $response->assertJsonFragment(['name' => 'Burger']);
    }
}
