<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\User;
use Illuminate\Database\QueryException;
use Tests\TestCase;

class HistoryProtectionTest extends TestCase
{
    public function test_deleting_a_user_with_sales_is_refused(): void
    {
        $cat = Category::create(['name' => 'Drinks']);
        $item = MenuItem::create(['category_id' => $cat->id, 'name' => 'Tea', 'price' => 50]);
        $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]], 'amount_received' => 50,
        ])->assertCreated();

        $this->expectException(QueryException::class);
        User::whereKey($this->testUser->id)->delete();
    }

    public function test_deleting_a_category_with_menu_items_is_refused(): void
    {
        $cat = Category::create(['name' => 'Drinks']);
        MenuItem::create(['category_id' => $cat->id, 'name' => 'Tea', 'price' => 50]);

        $this->expectException(QueryException::class);
        Category::whereKey($cat->id)->delete();
    }
}
