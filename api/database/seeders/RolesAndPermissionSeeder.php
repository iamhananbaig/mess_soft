<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class RolesAndPermissionSeeder extends Seeder
{
    public function run(): void
    {
        // Reset cached roles and permissions
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();

        // Permissions
        $permissions = [
            'pos:use',
            'menu:view', 'menu:create', 'menu:edit', 'menu:delete',
            'inventory:view', 'inventory:stock-in', 'inventory:adjust',
            'recipes:manage',
            'reports:view',
            'employees:view', 'employees:manage',
            'consumptions:create', 'consumptions:view',
            'sales:view-own', 'sales:view-all',
        ];

        foreach ($permissions as $perm) {
            Permission::create(['name' => $perm]);
        }

        // Roles
        $superAdmin = Role::create(['name' => 'super-admin']);
        $admin = Role::create(['name' => 'admin']);
        $manager = Role::create(['name' => 'manager']);
        $cashier = Role::create(['name' => 'cashier']);
        $employee = Role::create(['name' => 'employee']);

        // Role → Permissions
        $superAdmin->givePermissionTo(Permission::all());

        $admin->givePermissionTo([
            'pos:use', 'menu:view', 'menu:create', 'menu:edit', 'menu:delete',
            'inventory:view', 'inventory:stock-in', 'inventory:adjust',
            'recipes:manage', 'reports:view', 'employees:view', 'employees:manage',
            'consumptions:create', 'consumptions:view', 'sales:view-own', 'sales:view-all',
        ]);

        $manager->givePermissionTo([
            'pos:use', 'menu:view', 'menu:edit',
            'inventory:view', 'inventory:stock-in',
            'reports:view', 'employees:view',
            'consumptions:create', 'consumptions:view', 'sales:view-own', 'sales:view-all',
        ]);

        $cashier->givePermissionTo([
            'pos:use', 'menu:view', 'sales:view-own',
        ]);

        $employee->givePermissionTo([
            'menu:view', 'sales:view-own',
        ]);
    }
}
