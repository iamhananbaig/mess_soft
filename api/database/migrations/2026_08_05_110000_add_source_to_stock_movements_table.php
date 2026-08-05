<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->string('source')->nullable()->after('type');
        });

        DB::table('stock_movements')->where('type', 'in')->update(['source' => 'stock-in']);
        DB::table('stock_movements')->where('type', 'adjustment')->update(['source' => 'adjustment']);
        DB::table('stock_movements')->where('type', 'expiry')->update(['source' => 'expiry']);
        DB::table('stock_movements')->where('type', 'out')->where('note', 'LIKE', 'Sale #%')->update(['source' => 'sale']);
        DB::table('stock_movements')->where('type', 'out')->where('note', 'NOT LIKE', 'Sale #%')->update(['source' => 'manual']);
    }

    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropColumn('source');
        });
    }
};
