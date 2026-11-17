<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * - opening_float: change money the drawer started with; it is in the drawer at
 *   count time but isn't sales, so variance = counted − (float + cash sales).
 * - non_cash_amount: card/wallet sales that day (not in the drawer), for the record.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cash_closings', function (Blueprint $table) {
            $table->bigInteger('opening_float')->default(0)->after('expected_cash');
            $table->bigInteger('non_cash_amount')->default(0)->after('opening_float');
        });
    }

    public function down(): void
    {
        Schema::table('cash_closings', fn (Blueprint $t) => $t->dropColumn(['opening_float', 'non_cash_amount']));
    }
};
