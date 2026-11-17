<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\Sale;
use App\Models\StockMovement;
use App\Models\VoidRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class VoidRequestController extends Controller
{
    /**
     * Approvers see every request; everyone else sees only their own.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', Rule::in([VoidRequest::PENDING, VoidRequest::APPROVED, VoidRequest::REJECTED])],
            'per_page' => 'sometimes|integer|min:1|max:100',
        ]);

        $query = VoidRequest::with(['sale.items.menuItem:id,name', 'requester:id,name', 'reviewer:id,name'])
            ->orderByDesc('created_at');

        if (! $request->user()->can('sales:void-approve')) {
            $query->where('requested_by', $request->user()->id);
        }
        if ($validated['status'] ?? null) {
            $query->where('status', $validated['status']);
        }

        return response()->json($query->paginate($validated['per_page'] ?? 20));
    }

    public function store(Request $request, Sale $sale): JsonResponse
    {
        $validated = $request->validate([
            'reason' => 'required|string|max:255',
        ]);

        return DB::transaction(function () use ($validated, $request, $sale) {
            // Lock the sale so two staff can't open duplicate requests at once.
            $sale = Sale::lockForUpdate()->findOrFail($sale->id);

            if ($sale->voided_at) {
                return response()->json(['message' => 'This sale is already voided'], 422);
            }
            if ($sale->voidRequests()->where('status', VoidRequest::PENDING)->exists()) {
                return response()->json(['message' => 'A void request for this sale is already pending'], 422);
            }

            $voidRequest = VoidRequest::create([
                'sale_id' => $sale->id,
                'requested_by' => $request->user()->id,
                'reason' => $validated['reason'],
                'status' => VoidRequest::PENDING,
            ]);

            return response()->json($voidRequest->load(['requester:id,name']), 201);
        });
    }

    public function approve(Request $request, VoidRequest $voidRequest): JsonResponse
    {
        $validated = $request->validate(['note' => 'nullable|string|max:255']);

        return DB::transaction(function () use ($validated, $request, $voidRequest) {
            $voidRequest = VoidRequest::lockForUpdate()->findOrFail($voidRequest->id);
            if ($error = $this->checkReviewable($voidRequest)) {
                return $error;
            }

            $sale = Sale::lockForUpdate()->findOrFail($voidRequest->sale_id);
            if ($sale->voided_at) {
                return response()->json(['message' => 'This sale is already voided'], 422);
            }

            // Return exactly what the sale consumed (recipes may have changed since).
            $consumed = StockMovement::where('source', 'sale')
                ->where('note', "Sale #{$sale->id}")
                ->get();

            $inventory = InventoryItem::lockForUpdate()
                ->whereIn('id', $consumed->pluck('inventory_item_id')->unique())
                ->get()
                ->keyBy('id');

            foreach ($consumed as $movement) {
                $quantity = abs((float) $movement->quantity);
                $inventory[$movement->inventory_item_id]->increment('current_stock', $quantity);

                StockMovement::create([
                    'inventory_item_id' => $movement->inventory_item_id,
                    'type' => 'in',
                    'source' => 'void',
                    'quantity' => $quantity,
                    'unit_cost' => $movement->unit_cost,
                    'reference' => "VOID-{$voidRequest->id}",
                    'note' => "Void of Sale #{$sale->id}",
                    'user_id' => $request->user()->id,
                ]);
            }

            $sale->update(['voided_at' => now()]);
            $voidRequest->update([
                'status' => VoidRequest::APPROVED,
                'reviewed_by' => $request->user()->id,
                'review_note' => $validated['note'] ?? null,
                'reviewed_at' => now(),
            ]);

            return response()->json($voidRequest->load(['sale', 'requester:id,name', 'reviewer:id,name']));
        });
    }

    public function reject(Request $request, VoidRequest $voidRequest): JsonResponse
    {
        $validated = $request->validate(['note' => 'nullable|string|max:255']);

        return DB::transaction(function () use ($validated, $request, $voidRequest) {
            $voidRequest = VoidRequest::lockForUpdate()->findOrFail($voidRequest->id);
            if ($error = $this->checkReviewable($voidRequest)) {
                return $error;
            }

            $voidRequest->update([
                'status' => VoidRequest::REJECTED,
                'reviewed_by' => $request->user()->id,
                'review_note' => $validated['note'] ?? null,
                'reviewed_at' => now(),
            ]);

            return response()->json($voidRequest->load(['requester:id,name', 'reviewer:id,name']));
        });
    }

    private function checkReviewable(VoidRequest $voidRequest): ?JsonResponse
    {
        if ($voidRequest->status !== VoidRequest::PENDING) {
            return response()->json(['message' => "This request was already {$voidRequest->status}"], 422);
        }

        return null;
    }
}
