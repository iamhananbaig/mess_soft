<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\Recipe;
use Tests\TestCase;

class RecipeTest extends TestCase
{
    public function test_list_recipes_for_menu_item(): void
    {
        $cat = Category::create(['name' => 'Burgers']);
        $item = MenuItem::create(['category_id' => $cat->id, 'name' => 'Burger', 'price' => 300]);
        $bun = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 50]);
        $patty = InventoryItem::create(['name' => 'Patty', 'unit' => 'pcs', 'current_stock' => 20]);

        Recipe::create(['menu_item_id' => $item->id, 'inventory_item_id' => $bun->id, 'quantity' => 1]);
        Recipe::create(['menu_item_id' => $item->id, 'inventory_item_id' => $patty->id, 'quantity' => 1]);

        $response = $this->withHeaders($this->authHeaders())->getJson("/api/v1/menu/{$item->id}/recipe");

        $response->assertOk();
        $this->assertCount(2, $response->json());
    }

    public function test_add_recipe_ingredient(): void
    {
        $cat = Category::create(['name' => 'Burgers']);
        $item = MenuItem::create(['category_id' => $cat->id, 'name' => 'Burger', 'price' => 300]);
        $bun = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 50]);

        $response = $this->withHeaders($this->authHeaders())->postJson("/api/v1/menu/{$item->id}/recipe", [
            'inventory_item_id' => $bun->id,
            'quantity' => 1,
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('recipes', [
            'menu_item_id' => $item->id,
            'inventory_item_id' => $bun->id,
            'quantity' => 1,
        ]);
    }

    public function test_prevent_duplicate_recipe_ingredient(): void
    {
        $cat = Category::create(['name' => 'Burgers']);
        $item = MenuItem::create(['category_id' => $cat->id, 'name' => 'Burger', 'price' => 300]);
        $bun = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 50]);
        Recipe::create(['menu_item_id' => $item->id, 'inventory_item_id' => $bun->id, 'quantity' => 1]);

        $response = $this->withHeaders($this->authHeaders())->postJson("/api/v1/menu/{$item->id}/recipe", [
            'inventory_item_id' => $bun->id,
            'quantity' => 2,
        ]);

        $response->assertUnprocessable()->assertJson(['message' => 'Ingredient already in recipe']);
    }

    public function test_update_recipe_quantity(): void
    {
        $cat = Category::create(['name' => 'Burgers']);
        $item = MenuItem::create(['category_id' => $cat->id, 'name' => 'Burger', 'price' => 300]);
        $bun = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 50]);
        $recipe = Recipe::create(['menu_item_id' => $item->id, 'inventory_item_id' => $bun->id, 'quantity' => 1]);

        $response = $this->withHeaders($this->authHeaders())->putJson("/api/v1/recipes/{$recipe->id}", [
            'quantity' => 2,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('recipes', ['id' => $recipe->id, 'quantity' => 2]);
    }

    public function test_delete_recipe_ingredient(): void
    {
        $cat = Category::create(['name' => 'Burgers']);
        $item = MenuItem::create(['category_id' => $cat->id, 'name' => 'Burger', 'price' => 300]);
        $bun = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 50]);
        $recipe = Recipe::create(['menu_item_id' => $item->id, 'inventory_item_id' => $bun->id, 'quantity' => 1]);

        $response = $this->withHeaders($this->authHeaders())->deleteJson("/api/v1/recipes/{$recipe->id}");

        $response->assertOk()->assertJson(['message' => 'Ingredient removed from recipe']);
        $this->assertDatabaseMissing('recipes', ['id' => $recipe->id]);
    }
}
