<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployeeController extends Controller
{
    public function index(): JsonResponse
    {
        $employees = User::with('roles:id,name')->get();

        return response()->json($employees);
    }

    public function update(Request $request, User $employee): JsonResponse
    {
        if ($request->user()->id === $employee->id) {
            return response()->json(['message' => 'Cannot modify your own account'], 422);
        }

        if ($denied = $this->guardSuperAdmin($request, $employee)) {
            return $denied;
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'is_active' => 'sometimes|boolean',
        ]);

        $employee->update($validated);

        // A deactivated user must be logged out everywhere, not just blocked at next login.
        if (array_key_exists('is_active', $validated) && ! $validated['is_active']) {
            $employee->tokens()->delete();
        }

        return response()->json($employee->load('roles:id,name'));
    }

    public function updateRole(Request $request, User $employee): JsonResponse
    {
        if ($request->user()->id === $employee->id) {
            return response()->json(['message' => 'Cannot change your own role'], 422);
        }

        if ($denied = $this->guardSuperAdmin($request, $employee)) {
            return $denied;
        }

        $validated = $request->validate([
            'role' => 'required|string|exists:roles,name',
        ]);

        if ($validated['role'] === 'super-admin' && ! $request->user()->hasRole('super-admin')) {
            return response()->json(['message' => 'Only a super-admin can grant the super-admin role'], 403);
        }

        $employee->syncRoles([$validated['role']]);

        return response()->json($employee->load('roles:id,name'));
    }

    /**
     * Only super-admins may modify another super-admin's account.
     */
    private function guardSuperAdmin(Request $request, User $employee): ?JsonResponse
    {
        if ($employee->hasRole('super-admin') && ! $request->user()->hasRole('super-admin')) {
            return response()->json(['message' => 'Only a super-admin can modify a super-admin account'], 403);
        }

        return null;
    }
}
