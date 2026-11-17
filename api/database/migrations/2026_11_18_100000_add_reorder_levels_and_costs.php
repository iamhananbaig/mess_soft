<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * - Per-item reorder level (low-stock used to be a fixed 10 for every unit).
 *   Existing items get 10 so today's low-stock list doesn't change.
 * - Costs: weighted-average cost per inventory unit, the cost on each stock
 *   movement, and the cost of each sold item (snapshotted at sale time) so
 *   reports can show food cost and profit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->decimal('reorder_level', 10, 2)->default(0)->after('current_stock');
            $table->decimal('avg_cost', 12, 4)->default(0)->after('reorder_level'); // PKR per unit
        });
        DB::table('inventory_items')->update(['reorder_level' => 10]);

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->decimal('unit_cost', 12, 4)->nullable()->after('quantity');
        });

        Schema::table('sale_items', function (Blueprint $table) {
            // Cost of ONE of this menu item at the time of sale; null for sales made before costing.
            $table->decimal('unit_cost', 12, 2)->nullable()->after('unit_price');
        });
    }

    public function down(): void
    {
        Schema::table('sale_items', fn (Blueprint $t) => $t->dropColumn('unit_cost'));
        Schema::table('stock_movements', fn (Blueprint $t) => $t->dropColumn('unit_cost'));
        Schema::table('inventory_items', fn (Blueprint $t) => $t->dropColumn(['reorder_level', 'avg_cost']));
    }
};
