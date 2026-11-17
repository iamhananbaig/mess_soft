<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'nullable|integer',
            'action' => 'nullable|string|max:60',
            'subject_type' => 'nullable|string|max:60',
            'from' => 'nullable|date',
            'to' => 'nullable|date',
            'search' => 'nullable|string|max:100',
            'per_page' => 'sometimes|integer|min:1|max:100',
        ]);

        $logs = ActivityLog::with('user:id,name')
            ->when($validated['user_id'] ?? null, fn ($q, $v) => $q->where('user_id', $v))
            // "menu" matches menu.created, menu.updated, …
            ->when($validated['action'] ?? null, fn ($q, $v) => $q->where(fn ($q) => $q->where('action', $v)->orWhere('action', 'like', $v.'.%')))
            ->when($validated['subject_type'] ?? null, fn ($q, $v) => $q->where('subject_type', $v))
            ->when($validated['from'] ?? null, fn ($q, $v) => $q->where('created_at', '>=', $v))
            ->when($validated['to'] ?? null, fn ($q, $v) => $q->where('created_at', '<=', $v.' 23:59:59'))
            ->when($validated['search'] ?? null, fn ($q, $v) => $q->where('description', 'like', '%'.$v.'%'))
            ->orderByDesc('id')
            ->paginate($validated['per_page'] ?? 50);

        return response()->json($logs);
    }

    /** Distinct action groups for the filter dropdown. */
    public function actions(): JsonResponse
    {
        return response()->json(
            ActivityLog::query()->select('action')->distinct()->orderBy('action')->pluck('action')
        );
    }
}
