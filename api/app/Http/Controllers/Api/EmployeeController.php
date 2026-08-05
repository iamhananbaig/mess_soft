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

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'is_active' => 'sometimes|boolean',
        ]);

        $employee->update($validated);
        return response()->json($employee->load('roles:id,name'));
    }

    public function updateRole(Request $request, User $employee): JsonResponse
    {
        if ($request->user()->id === $employee->id) {
            return response()->json(['message' => 'Cannot change your own role'], 422);
        }

        $validated = $request->validate([
            'role' => 'required|string|exists:roles,name',
        ]);

        $employee->syncRoles([$validated['role']]);
        return response()->json($employee->load('roles:id,name'));
    }
}
