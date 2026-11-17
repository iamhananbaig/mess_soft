<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * History must never disappear because a parent row was deleted. These foreign
 * keys were ON DELETE CASCADE (deleting a user would delete all their sales and
 * stock movements); they become RESTRICT, so such a delete is refused instead.
 * Recipes keep cascading: they are configuration, not history.
 */
return new class extends Migration
{
    /** table => [column => referenced table] */
    private const KEYS = [
        'sales' => ['user_id' => 'users'],
        'sale_items' => ['sale_id' => 'sales', 'menu_item_id' => 'menu_items'],
        'stock_movements' => ['inventory_item_id' => 'inventory_items', 'user_id' => 'users'],
        'manual_consumptions' => ['inventory_item_id' => 'inventory_items', 'user_id' => 'users'],
        'menu_items' => ['category_id' => 'categories'],
    ];

    public function up(): void
    {
        $this->rebuild('restrict');
    }

    public function down(): void
    {
        $this->rebuild('cascade');
    }

    private function rebuild(string $onDelete): void
    {
        foreach (self::KEYS as $table => $columns) {
            Schema::table($table, function (Blueprint $t) use ($columns, $onDelete) {
                foreach ($columns as $column => $references) {
                    $t->dropForeign([$column]);
                    $t->foreign($column)->references('id')->on($references)->onDelete($onDelete);
                }
            });
        }
    }
};
