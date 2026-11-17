<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CashClosing;
use App\Models\Sale;
use App\Models\User;
use App\Models\VoidRequest;
use App\Support\PaymentMethods;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class CashClosingController extends Controller
{
    /**
     * Per-cashier cash position for a day, with any recorded closings.
     */
    public function show(Request $request): JsonResponse
    {
        $request->validate(['date' => 'nullable|date_format:Y-m-d']);
        $date = $request->date ?? Carbon::today()->format('Y-m-d');

        $live = $this->liveFigures($date);
        $closings = CashClosing::with(['closer:id,name'])->whereDate('date', $date)->get()->keyBy('user_id');

        $userIds = $live->keys()->merge($closings->keys())->unique();
        $users = User::whereIn('id', $userIds)->pluck('name', 'id');

        $cashiers = $userIds->map(function ($userId) use ($live, $closings, $users) {
            $figures = $live[$userId] ?? $this->emptyFigures();
            $closing = $closings[$userId] ?? null;

            return [
                'user_id' => $userId,
                'name' => $users[$userId] ?? 'Unknown',
                ...$figures,
                'closing' => $closing ? [
                    'id' => $closing->id,
                    'expected_cash' => $closing->expected_cash,
                    'opening_float' => $closing->opening_float,
                    'non_cash_amount' => $closing->non_cash_amount,
                    'counted_cash' => $closing->counted_cash,
                    'variance' => $closing->variance,
                    'note' => $closing->note,
                    'closed_by' => $closing->closer?->name,
                    'closed_at' => $closing->created_at->toIso8601String(),
                ] : null,
                // A void approved after closing changes the live figure; surface it.
                'changed_since_close' => $closing !== null && $closing->expected_cash !== $figures['expected_cash'],
            ];
        })->sortBy('name')->values();

        $sum = fn (string $key) => $cashiers->sum($key);
        $closed = $cashiers->whereNotNull('closing');

        return response()->json([
            'date' => $date,
            'cashiers' => $cashiers,
            'totals' => [
                'sales_count' => $sum('sales_count'),
                'gross_amount' => $sum('gross_amount'),
                'voided_count' => $sum('voided_count'),
                'voided_amount' => $sum('voided_amount'),
                'expected_cash' => $sum('expected_cash'),
                'non_cash_amount' => $sum('non_cash_amount'),
                'opening_float' => $closed->sum(fn ($c) => $c['closing']['opening_float']),
                'pending_voids' => $sum('pending_voids'),
                'counted_cash' => $closed->sum(fn ($c) => $c['closing']['counted_cash']),
                'variance' => $closed->sum(fn ($c) => $c['closing']['variance']),
                'closed_count' => $closed->count(),
                'cashier_count' => $cashiers->count(),
            ],
        ]);
    }

    /**
     * Record the counted cash for one cashier's drawer on one day. Final once saved.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date' => 'required|date_format:Y-m-d|before_or_equal:today',
            'user_id' => 'required|exists:users,id',
            'counted_cash' => 'required|integer|min:0',
            'opening_float' => 'nullable|integer|min:0',
            'note' => 'nullable|string|max:255',
        ]);

        return DB::transaction(function () use ($validated, $request) {
            // Lock the cashier's sales for the day so a sale/void can't slip in mid-close.
            Sale::whereDate('created_at', $validated['date'])
                ->where('user_id', $validated['user_id'])
                ->lockForUpdate()
                ->get(['id']);

            if (CashClosing::whereDate('date', $validated['date'])->where('user_id', $validated['user_id'])->exists()) {
                return response()->json(['message' => 'This drawer is already closed for that day'], 422);
            }

            $figures = $this->liveFigures($validated['date'], (int) $validated['user_id'])[$validated['user_id']] ?? $this->emptyFigures();

            if ($figures['pending_voids'] > 0) {
                return response()->json([
                    'message' => "Resolve {$figures['pending_voids']} pending void request(s) for this cashier before closing",
                ], 422);
            }

            $closing = CashClosing::create([
                'date' => $validated['date'],
                'user_id' => $validated['user_id'],
                'sales_count' => $figures['sales_count'],
                'gross_amount' => $figures['gross_amount'],
                'voided_count' => $figures['voided_count'],
                'voided_amount' => $figures['voided_amount'],
                'expected_cash' => $figures['expected_cash'],
                'opening_float' => $validated['opening_float'] ?? 0,
                'non_cash_amount' => $figures['non_cash_amount'],
                'counted_cash' => $validated['counted_cash'],
                // The float is in the drawer too, but it isn't takings.
                'variance' => $validated['counted_cash'] - ($validated['opening_float'] ?? 0) - $figures['expected_cash'],
                'note' => $validated['note'] ?? null,
                'closed_by' => $request->user()->id,
            ]);

            return response()->json($closing->load(['cashier:id,name', 'closer:id,name']), 201);
        });
    }

    /**
     * Live per-cashier figures for a day, keyed by user_id.
     */
    private function liveFigures(string $date, ?int $userId = null)
    {
        $rows = Sale::whereDate('created_at', $date)
            ->when($userId, fn ($q) => $q->where('user_id', $userId))
            ->select('user_id')
            ->selectRaw('COUNT(*) as sales_count')
            ->selectRaw('COALESCE(SUM(total_amount), 0) as gross_amount')
            ->selectRaw('SUM(CASE WHEN voided_at IS NOT NULL THEN 1 ELSE 0 END) as voided_count')
            ->selectRaw('COALESCE(SUM(CASE WHEN voided_at IS NOT NULL THEN total_amount ELSE 0 END), 0) as voided_amount')
            ->selectRaw("COALESCE(SUM(CASE WHEN voided_at IS NULL AND payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_amount")
            ->groupBy('user_id')
            ->get()
            ->keyBy('user_id');

        $pending = VoidRequest::where('status', VoidRequest::PENDING)
            ->whereHas('sale', fn ($q) => $q->whereDate('created_at', $date)->when($userId, fn ($q) => $q->where('user_id', $userId)))
            ->with('sale:id,user_id')
            ->get()
            ->countBy(fn ($r) => $r->sale->user_id);

        // Non-cash takings per method (not in the drawer), non-voided only.
        $nonCash = Sale::whereDate('created_at', $date)
            ->when($userId, fn ($q) => $q->where('user_id', $userId))
            ->whereNull('voided_at')
            ->where('payment_method', '!=', 'cash')
            ->select('user_id', 'payment_method')
            ->selectRaw('SUM(total_amount) as amount')
            ->groupBy('user_id', 'payment_method')
            ->get()
            ->groupBy('user_id');

        return $rows->map(function ($r) use ($pending, $nonCash) {
            $methods = ($nonCash[$r->user_id] ?? collect())
                ->map(fn ($m) => ['method' => $m->payment_method, 'label' => PaymentMethods::label($m->payment_method), 'amount' => (int) $m->amount])
                ->values();

            return [
                'sales_count' => (int) $r->sales_count - (int) $r->voided_count,
                'gross_amount' => (int) $r->gross_amount,
                'voided_count' => (int) $r->voided_count,
                'voided_amount' => (int) $r->voided_amount,
                // Only cash ends up in the drawer.
                'expected_cash' => (int) $r->cash_amount,
                'non_cash_amount' => (int) $methods->sum('amount'),
                'non_cash' => $methods,
                'pending_voids' => (int) ($pending[$r->user_id] ?? 0),
            ];
        });
    }

    private function emptyFigures(): array
    {
        return [
            'sales_count' => 0, 'gross_amount' => 0, 'voided_count' => 0, 'voided_amount' => 0,
            'expected_cash' => 0, 'non_cash_amount' => 0, 'non_cash' => [], 'pending_voids' => 0,
        ];
    }
}
