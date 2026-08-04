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
            'cost_per_unit' => 'required|integer|min:0',
            'current_stock' => 'sometimes|numeric|min:0',
            'expiry_date' => 'nullable|date',
        ]);

        $item = InventoryItem::create($validated);
        return response()->json($item, 201);
    }

    public function update(Request $request, InventoryItem $inventory): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'unit' => 'sometimes|string|max:50',
            'cost_per_unit' => 'sometimes|integer|min:0',
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
            'reference' => 'nullable|string|max:255',
            'note' => 'nullable|string|max:255',
        ]);

        return DB::transaction(function () use ($validated) {
            $item = InventoryItem::lockForUpdate()->findOrFail($validated['inventory_item_id']);
            $item->increment('current_stock', $validated['quantity']);

            StockMovement::create([
                'inventory_item_id' => $item->id,
                'type' => 'in',
                'quantity' => $validated['quantity'],
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
            'quantity' => 'required|integer',
            'note' => 'nullable|string|max:255',
        ]);

        return DB::transaction(function () use ($validated, $inventoryItem) {
            $item = InventoryItem::lockForUpdate()->findOrFail($inventoryItem->id);
            $item->increment('current_stock', $validated['quantity']);

            StockMovement::create([
                'inventory_item_id' => $item->id,
                'type' => 'adjustment',
                'quantity' => $validated['quantity'],
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
            $item->decrement('current_stock', $validated['quantity']);

            StockMovement::create([
                'inventory_item_id' => $item->id,
                'type' => 'expiry',
                'quantity' => -$validated['quantity'],
                'note' => $validated['note'] ?? null,
                'user_id' => auth()->id(),
            ]);

            return response()->json($item->fresh());
        });
    }
}
