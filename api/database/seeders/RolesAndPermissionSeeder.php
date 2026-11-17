<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolesAndPermissionSeeder extends Seeder
{
    public function run(): void
    {
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        $permissions = [
            'pos:use',
            'categories:view', 'categories:create', 'categories:edit', 'categories:delete',
            'menu:view', 'menu:create', 'menu:edit', 'menu:delete',
            'recipes:manage',
            'inventory:view', 'inventory:create', 'inventory:edit',
            'sales:create', 'sales:view', 'sales:void-request', 'sales:void-approve',
            'consumptions:create', 'consumptions:view',
            'reports:view',
            'employees:view', 'employees:edit',
            'settings:manage', 'cash:close', 'activity:view',
        ];

        // Idempotent: the Docker entrypoint runs this seeder on every container start.
        foreach ($permissions as $perm) {
            Permission::findOrCreate($perm);
        }

        // super-admin always holds every permission, including newly added ones.
        Role::findOrCreate('super-admin')->syncPermissions(Permission::all());

        // Other roles only get their defaults when first created, so permission
        // changes made through the Permissions page are never overwritten.
        $defaults = $this->defaultRolePermissions();
        foreach ($defaults as $roleName => $rolePermissions) {
            if (Role::where('name', $roleName)->exists()) {
                continue;
            }
            Role::findOrCreate($roleName)->givePermissionTo($rolePermissions);
        }

        app()[PermissionRegistrar::class]->forgetCachedPermissions();
    }

    /**
     * @return array<string, list<string>>
     */
    private function defaultRolePermissions(): array
    {
        return [
            'admin' => [
                'pos:use',
                'categories:view', 'categories:create', 'categories:edit', 'categories:delete',
                'menu:view', 'menu:create', 'menu:edit', 'menu:delete',
                'recipes:manage',
                'inventory:view', 'inventory:create', 'inventory:edit',
                'sales:create', 'sales:view', 'sales:void-request', 'sales:void-approve',
                'consumptions:create', 'consumptions:view',
                'reports:view',
                'employees:view', 'employees:edit',
                'settings:manage', 'cash:close', 'activity:view',
            ],
            'manager' => [
                'pos:use',
                'menu:view', 'menu:edit',
                'inventory:view', 'inventory:create',
                'sales:create', 'sales:view', 'sales:void-request', 'sales:void-approve',
                'consumptions:create', 'consumptions:view',
                'reports:view', 'cash:close',
                'employees:view',
            ],
            'cashier' => [
                'pos:use',
                'menu:view',
                'sales:create', 'sales:view', 'sales:void-request',
            ],
            'employee' => [
                'pos:use',
                'menu:view',
                'sales:create', 'sales:view', 'sales:void-request',
                'consumptions:create', 'consumptions:view',
            ],
        ];
    }
}
