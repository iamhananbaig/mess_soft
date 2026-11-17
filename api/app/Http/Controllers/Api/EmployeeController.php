<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rules\Password;

class EmployeeController extends Controller
{
    public function index(): JsonResponse
    {
        $employees = User::with('roles:id,name')->get();

        return response()->json($employees);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => ['required', 'string', Password::min(8)],
            ...$this->roleRules(),
        ]);

        $roles = $this->requestedRoles($validated);
        if ($denied = $this->guardSuperAdminGrant($request, $roles)) {
            return $denied;
        }

        $employee = DB::transaction(function () use ($validated, $roles) {
            $employee = User::create([
                'name' => $validated['name'],
                'email' => strtolower($validated['email']),
                'password' => $validated['password'],
                'is_active' => true,
            ]);
            $employee->syncRoles($roles);

            return $employee;
        });

        Activity::log('employee.created', "Added employee {$employee->name} ({$employee->email}) as ".implode(', ', $roles), $employee);

        return response()->json($employee->load('roles:id,name'), 201);
    }

    /**
     * Admin sets a new password for another user and signs them out everywhere.
     */
    public function resetPassword(Request $request, User $employee): JsonResponse
    {
        if ($request->user()->id === $employee->id) {
            return response()->json(['message' => 'Use "Change password" in your account menu to change your own password'], 422);
        }

        if ($denied = $this->guardSuperAdmin($request, $employee)) {
            return $denied;
        }

        $validated = $request->validate([
            'password' => ['required', 'string', Password::min(8)],
        ]);

        $employee->update(['password' => $validated['password']]);
        $employee->tokens()->delete();
        Activity::log('employee.password_reset', "Changed password for {$employee->name}", $employee);

        return response()->json(['message' => "Password updated for {$employee->name}"]);
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

        $before = $employee->only(array_keys($validated));
        $employee->update($validated);
        Activity::log('employee.updated', "Updated employee {$employee->name}", $employee, Activity::diff($before, $employee->only(array_keys($validated))));

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

        $validated = $request->validate($this->roleRules());

        $roles = $this->requestedRoles($validated);
        if ($denied = $this->guardSuperAdminGrant($request, $roles)) {
            return $denied;
        }

        $before = $employee->getRoleNames()->sort()->values()->all();
        $employee->syncRoles($roles);
        $after = collect($roles)->sort()->values()->all();
        Activity::log('employee.roles_changed', "Changed roles of {$employee->name}", $employee, Activity::diff(['roles' => $before], ['roles' => $after]));

        return response()->json($employee->load('roles:id,name'));
    }

    /**
     * A user may hold several roles (e.g. cashier + manager); permissions combine.
     * Accepts `roles: [...]`, or the older single `role` for compatibility.
     */
    private function roleRules(): array
    {
        return [
            'roles' => 'required_without:role|array|min:1',
            'roles.*' => 'string|distinct|exists:roles,name',
            'role' => 'required_without:roles|string|exists:roles,name',
        ];
    }

    /** @return list<string> */
    private function requestedRoles(array $validated): array
    {
        return array_values($validated['roles'] ?? [$validated['role']]);
    }

    private function guardSuperAdminGrant(Request $request, array $roles): ?JsonResponse
    {
        if (in_array('super-admin', $roles, true) && ! $request->user()->hasRole('super-admin')) {
            return response()->json(['message' => 'Only a super-admin can grant the super-admin role'], 403);
        }

        return null;
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
