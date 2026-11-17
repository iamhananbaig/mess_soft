<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class PermissionController extends Controller
{
    public function index(): JsonResponse
    {
        $roles = Role::with('permissions:id,name')->get();
        $permissions = Permission::all('id', 'name');

        return response()->json([
            'roles' => $roles,
            'permissions' => $permissions,
        ]);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        if ($role->name === 'super-admin') {
            return response()->json(['message' => 'Cannot modify super-admin role'], 422);
        }

        $validated = $request->validate([
            'permissions' => 'required|array',
            'permissions.*' => 'string|exists:permissions,name',
        ]);

        $before = $role->permissions->pluck('name')->sort()->values();
        $role->syncPermissions($validated['permissions']);
        $after = collect($validated['permissions'])->sort()->values();
        Activity::log('permissions.updated', "Changed permissions of role {$role->name}", null, [
            'added' => $after->diff($before)->values()->all(),
            'removed' => $before->diff($after)->values()->all(),
        ]);

        return response()->json([
            'message' => "Permissions updated for {$role->name}",
            'role' => $role->load('permissions:id,name'),
        ]);
    }
}
