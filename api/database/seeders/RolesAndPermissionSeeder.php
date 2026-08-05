<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class RolesAndPermissionSeeder extends Seeder
{
    public function run(): void
    {
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();

        $permissions = [
            'pos:use',
            'categories:view', 'categories:create', 'categories:edit', 'categories:delete',
            'menu:view', 'menu:create', 'menu:edit', 'menu:delete',
            'recipes:manage',
            'inventory:view', 'inventory:create', 'inventory:edit',
            'sales:create', 'sales:view',
            'consumptions:create', 'consumptions:view',
            'reports:view',
            'employees:view', 'employees:edit',
        ];

        foreach ($permissions as $perm) {
            Permission::create(['name' => $perm]);
        }

        $superAdmin = Role::create(['name' => 'super-admin']);
        $admin = Role::create(['name' => 'admin']);
        $manager = Role::create(['name' => 'manager']);
        $cashier = Role::create(['name' => 'cashier']);
        $employee = Role::create(['name' => 'employee']);

        $superAdmin->givePermissionTo(Permission::all());

        $admin->givePermissionTo([
            'pos:use',
            'categories:view', 'categories:create', 'categories:edit', 'categories:delete',
            'menu:view', 'menu:create', 'menu:edit', 'menu:delete',
            'recipes:manage',
            'inventory:view', 'inventory:create', 'inventory:edit',
            'sales:create', 'sales:view',
            'consumptions:create', 'consumptions:view',
            'reports:view',
            'employees:view', 'employees:edit',
        ]);

        $manager->givePermissionTo([
            'pos:use',
            'menu:view', 'menu:edit',
            'inventory:view', 'inventory:create',
            'sales:create', 'sales:view',
            'consumptions:create', 'consumptions:view',
            'reports:view',
            'employees:view',
        ]);

        $cashier->givePermissionTo([
            'pos:use',
            'menu:view',
            'sales:create', 'sales:view',
        ]);

        $employee->givePermissionTo([
            'menu:view',
        ]);
    }
}
