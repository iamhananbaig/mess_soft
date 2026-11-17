<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Sales were cash-only (enum('cash')). Allow other methods (card, JazzCash,
 * Easypaisa, bank transfer) plus a transaction reference. Existing rows stay 'cash'.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->string('payment_method', 20)->default('cash')->change();
            $table->string('payment_reference', 100)->nullable()->after('payment_method');
            $table->index(['payment_method', 'created_at']);
        });
    }

    public function down(): void
    {
        // The old column only allowed 'cash'; non-cash sales can't be represented there.
        DB::table('sales')->where('payment_method', '!=', 'cash')->update(['payment_method' => 'cash']);

        Schema::table('sales', function (Blueprint $table) {
            $table->dropIndex(['payment_method', 'created_at']);
            $table->dropColumn('payment_reference');
            $table->enum('payment_method', ['cash'])->default('cash')->change();
        });
    }
};
