<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->index('created_at');
            $table->index('user_id');
        });

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->index('created_at');
            $table->index('type');
        });

        Schema::table('manual_consumptions', function (Blueprint $table) {
            $table->index('created_at');
        });

        Schema::table('menu_items', function (Blueprint $table) {
            $table->index('name');
        });

        Schema::table('inventory_items', function (Blueprint $table) {
            $table->index('name');
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropIndex(['created_at']);
            $table->dropIndex(['user_id']);
        });

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropIndex(['created_at']);
            $table->dropIndex(['type']);
        });

        Schema::table('manual_consumptions', function (Blueprint $table) {
            $table->dropIndex(['created_at']);
        });

        Schema::table('menu_items', function (Blueprint $table) {
            $table->dropIndex(['name']);
        });

        Schema::table('inventory_items', function (Blueprint $table) {
            $table->dropIndex(['name']);
        });
    }
};
