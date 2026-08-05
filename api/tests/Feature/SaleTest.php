<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\Recipe;
use Tests\TestCase;

class SaleTest extends TestCase
{
    public function test_create_sale_simple_item(): void
    {
        $cat = Category::create(['name' => 'Drinks']);
        $coke = MenuItem::create(['category_id' => $cat->id, 'name' => 'Coke', 'price' => 60]);
        $cokeInv = InventoryItem::create(['name' => 'Coke Bottle', 'unit' => 'bottle', 'current_stock' => 60]);
        Recipe::create(['menu_item_id' => $coke->id, 'inventory_item_id' => $cokeInv->id, 'quantity' => 1]);

        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $coke->id, 'quantity' => 2]],
            'amount_received' => 150,
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('sales', ['total_amount' => 120, 'amount_received' => 150, 'change' => 30]);
        $this->assertDatabaseHas('inventory_items', ['id' => $cokeInv->id, 'current_stock' => 58]);
        $this->assertDatabaseHas('stock_movements', [
            'inventory_item_id' => $cokeInv->id,
            'type' => 'out',
            'quantity' => -2,
        ]);
    }

    public function test_create_sale_recipe_item(): void
    {
        $cat = Category::create(['name' => 'Burgers']);
        $burger = MenuItem::create(['category_id' => $cat->id, 'name' => 'Chicken Burger', 'price' => 350]);
        $bun = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 100]);
        $patty = InventoryItem::create(['name' => 'Chicken Patty', 'unit' => 'pcs', 'current_stock' => 50]);
        $lettuce = InventoryItem::create(['name' => 'Lettuce', 'unit' => 'g', 'current_stock' => 2000]);

        Recipe::create(['menu_item_id' => $burger->id, 'inventory_item_id' => $bun->id, 'quantity' => 1]);
        Recipe::create(['menu_item_id' => $burger->id, 'inventory_item_id' => $patty->id, 'quantity' => 1]);
        Recipe::create(['menu_item_id' => $burger->id, 'inventory_item_id' => $lettuce->id, 'quantity' => 50]);

        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $burger->id, 'quantity' => 2]],
            'amount_received' => 700,
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('sales', ['total_amount' => 700]);
        $this->assertDatabaseHas('inventory_items', ['id' => $bun->id, 'current_stock' => 98]);
        $this->assertDatabaseHas('inventory_items', ['id' => $patty->id, 'current_stock' => 48]);
        $this->assertDatabaseHas('inventory_items', ['id' => $lettuce->id, 'current_stock' => 1900]);
    }

    public function test_sale_insufficient_stock_rejected(): void
    {
        $cat = Category::create(['name' => 'Burgers']);
        $burger = MenuItem::create(['category_id' => $cat->id, 'name' => 'Burger', 'price' => 300]);
        $bun = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 2]);

        Recipe::create(['menu_item_id' => $burger->id, 'inventory_item_id' => $bun->id, 'quantity' => 1]);

        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $burger->id, 'quantity' => 5]],
            'amount_received' => 1500,
        ]);

        $response->assertStatus(422)->assertJson(['message' => 'Insufficient stock for Bun']);
        $this->assertDatabaseMissing('sales', ['total_amount' => 1500]);
    }

    public function test_sale_validation(): void
    {
        $response = $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [],
            'amount_received' => 0,
        ]);

        $response->assertUnprocessable();
    }

    public function test_list_sales(): void
    {
        $cat = Category::create(['name' => 'Drinks']);
        $coke = MenuItem::create(['category_id' => $cat->id, 'name' => 'Coke', 'price' => 60]);
        $cokeInv = InventoryItem::create(['name' => 'Coke', 'unit' => 'pcs', 'current_stock' => 60]);
        Recipe::create(['menu_item_id' => $coke->id, 'inventory_item_id' => $cokeInv->id, 'quantity' => 1]);

        $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $coke->id, 'quantity' => 1]],
            'amount_received' => 60,
        ]);
        $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $coke->id, 'quantity' => 1]],
            'amount_received' => 60,
        ]);

        $response = $this->withHeaders($this->authHeaders())->getJson('/api/v1/sales');

        $response->assertOk();
        $this->assertCount(2, $response->json('data'));
    }

    public function test_show_sale(): void
    {
        $cat = Category::create(['name' => 'Drinks']);
        $coke = MenuItem::create(['category_id' => $cat->id, 'name' => 'Coke', 'price' => 60]);
        $cokeInv = InventoryItem::create(['name' => 'Coke', 'unit' => 'pcs', 'current_stock' => 60]);
        Recipe::create(['menu_item_id' => $coke->id, 'inventory_item_id' => $cokeInv->id, 'quantity' => 1]);

        $createResponse = $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $coke->id, 'quantity' => 1]],
            'amount_received' => 60,
        ]);

        $saleId = $createResponse->json('id');
        $response = $this->withHeaders($this->authHeaders())->getJson("/api/v1/sales/{$saleId}");

        $response->assertOk()->assertJsonFragment(['id' => $saleId]);
    }

    public function test_receipt_data(): void
    {
        $cat = Category::create(['name' => 'Drinks']);
        $coke = MenuItem::create(['category_id' => $cat->id, 'name' => 'Coke', 'price' => 60]);
        $cokeInv = InventoryItem::create(['name' => 'Coke', 'unit' => 'pcs', 'current_stock' => 60]);
        Recipe::create(['menu_item_id' => $coke->id, 'inventory_item_id' => $cokeInv->id, 'quantity' => 1]);

        $createResponse = $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $coke->id, 'quantity' => 2]],
            'amount_received' => 150,
        ]);

        $saleId = $createResponse->json('id');
        $response = $this->withHeaders($this->authHeaders())->getJson("/api/v1/sales/{$saleId}/receipt");

        $response->assertOk()->assertJsonStructure([
            'canteen_name', 'branch_name', 'date', 'time', 'receipt_number', 'cashier', 'items', 'total', 'payment_method', 'amount_received', 'change',
        ]);
        $this->assertEquals(120, $response->json('total'));
        $this->assertEquals(150, $response->json('amount_received'));
        $this->assertEquals(30, $response->json('change'));
    }
}
