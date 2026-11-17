<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InventoryController extends Controller
{
    public function index(): JsonResponse
    {
        $items = InventoryItem::active()->orderBy('name')->get();

        return response()->json($items);
    }

    public function show(InventoryItem $inventory): JsonResponse
    {
        $inventory->load('stockMovements.user');

        return response()->json($inventory);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'unit' => 'required|string|max:50',
            'current_stock' => 'sometimes|numeric|min:0',
            'reorder_level' => 'sometimes|numeric|min:0',
            'unit_cost' => 'nullable|numeric|min:0',
            'expiry_date' => 'nullable|date',
        ]);

        $validated['avg_cost'] = $validated['unit_cost'] ?? 0;
        unset($validated['unit_cost']);
        $item = InventoryItem::create($validated);

        return response()->json($item, 201);
    }

    public function update(Request $request, InventoryItem $inventory): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'unit' => 'sometimes|string|max:50',
            'reorder_level' => 'sometimes|numeric|min:0',
            // Lets an admin set the cost of stock already on hand (e.g. when costing starts).
            'avg_cost' => 'sometimes|numeric|min:0',
            'expiry_date' => 'nullable|date',
            'is_active' => 'sometimes|boolean',
        ]);

        $inventory->update($validated);

        return response()->json($inventory);
    }

    public function stockIn(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'inventory_item_id' => 'required|exists:inventory_items,id',
            'quantity' => 'required|numeric|min:0.01',
            // Either the price per unit or the bill total for this delivery (optional).
            'unit_cost' => 'nullable|numeric|min:0',
            'total_cost' => 'nullable|numeric|min:0',
            'expiry_date' => 'nullable|date',
            'reference' => 'nullable|string|max:255',
            'note' => 'nullable|string|max:255',
        ]);

        return DB::transaction(function () use ($validated) {
            $item = InventoryItem::lockForUpdate()->findOrFail($validated['inventory_item_id']);

            $unitCost = $validated['unit_cost']
                ?? (isset($validated['total_cost']) ? round($validated['total_cost'] / $validated['quantity'], 4) : null);

            // Average cost must be computed from the stock BEFORE this delivery.
            $extra = [];
            if ($unitCost !== null) {
                $extra['avg_cost'] = $item->averageCostAfterPurchase((float) $validated['quantity'], (float) $unitCost);
            }
            if (! empty($validated['expiry_date'])) {
                $extra['expiry_date'] = $validated['expiry_date'];
            }
            $item->increment('current_stock', $validated['quantity'], $extra);

            StockMovement::create([
                'inventory_item_id' => $item->id,
                'type' => 'in',
                'source' => 'stock-in',
                'quantity' => $validated['quantity'],
                'unit_cost' => $unitCost,
                'reference' => $validated['reference'] ?? null,
                'note' => $validated['note'] ?? null,
                'user_id' => auth()->id(),
            ]);

            return response()->json($item->fresh());
        });
    }

    public function adjust(Request $request, InventoryItem $inventoryItem): JsonResponse
    {
        $validated = $request->validate([
            'quantity' => 'required|numeric|not_in:0',
            'note' => 'nullable|string|max:255',
        ]);

        return DB::transaction(function () use ($validated, $inventoryItem) {
            $item = InventoryItem::lockForUpdate()->findOrFail($inventoryItem->id);

            if ($item->current_stock + $validated['quantity'] < 0) {
                return response()->json(['message' => 'Insufficient stock for adjustment'], 422);
            }

            $item->increment('current_stock', $validated['quantity']);

            StockMovement::create([
                'inventory_item_id' => $item->id,
                'type' => 'adjustment',
                'source' => 'adjustment',
                'quantity' => $validated['quantity'],
                'unit_cost' => $item->avg_cost,
                'note' => $validated['note'] ?? null,
                'user_id' => auth()->id(),
            ]);

            return response()->json($item->fresh());
        });
    }

    public function expire(Request $request, InventoryItem $inventoryItem): JsonResponse
    {
        $validated = $request->validate([
            'quantity' => 'required|numeric|min:0.01',
            'note' => 'nullable|string|max:255',
        ]);

        return DB::transaction(function () use ($validated, $inventoryItem) {
            $item = InventoryItem::lockForUpdate()->findOrFail($inventoryItem->id);

            if ($item->current_stock < $validated['quantity']) {
                return response()->json(['message' => 'Insufficient stock for expiry'], 422);
            }

            $item->decrement('current_stock', $validated['quantity']);

            StockMovement::create([
                'inventory_item_id' => $item->id,
                'type' => 'expiry',
                'source' => 'expiry',
                'quantity' => -$validated['quantity'],
                'unit_cost' => $item->avg_cost,
                'note' => $validated['note'] ?? null,
                'user_id' => auth()->id(),
            ]);

            return response()->json($item->fresh());
        });
    }
}
