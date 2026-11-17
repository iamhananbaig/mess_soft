<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Grants the new void permissions to existing roles exactly once.
 *
 * The roles seeder only applies defaults to newly created roles (so it never
 * overwrites changes made on the Permissions page), which means new permissions
 * must reach existing production roles through a migration like this one.
 */
return new class extends Migration
{
    private const GRANTS = [
        'sales:void-request' => ['super-admin', 'admin', 'manager', 'cashier', 'employee'],
        'sales:void-approve' => ['super-admin', 'admin', 'manager'],
    ];

    public function up(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (self::GRANTS as $permission => $roles) {
            Permission::findOrCreate($permission, 'web');
            foreach ($roles as $roleName) {
                Role::where('name', $roleName)->where('guard_name', 'web')->first()?->givePermissionTo($permission);
            }
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        Permission::whereIn('name', array_keys(self::GRANTS))->where('guard_name', 'web')->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
