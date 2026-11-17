<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_closings', function (Blueprint $table) {
            $table->id();
            $table->date('date');
            // The cashier whose drawer was counted.
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            // Figures snapshotted at close time (PKR integers).
            $table->unsignedInteger('sales_count');
            $table->bigInteger('gross_amount');
            $table->unsignedInteger('voided_count');
            $table->bigInteger('voided_amount');
            $table->bigInteger('expected_cash');
            $table->bigInteger('counted_cash');
            $table->bigInteger('variance'); // counted - expected: negative = short
            $table->string('note')->nullable();
            $table->foreignId('closed_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();

            $table->unique(['date', 'user_id']);
        });

        // Grant once to existing roles (the seeder never touches existing roles).
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        Permission::findOrCreate('cash:close', 'web');
        foreach (['super-admin', 'admin', 'manager'] as $roleName) {
            Role::where('name', $roleName)->where('guard_name', 'web')->first()?->givePermissionTo('cash:close');
        }
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        Permission::where('name', 'cash:close')->where('guard_name', 'web')->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        Schema::dropIfExists('cash_closings');
    }
};
