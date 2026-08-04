<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\ManualConsumption;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ManualConsumptionController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'inventory_item_id' => 'required|exists:inventory_items,id',
            'quantity' => 'required|numeric|min:0.01',
            'reason' => 'required|string|max:255',
        ]);

        return DB::transaction(function () use ($validated, $request) {
            $item = InventoryItem::lockForUpdate()->findOrFail($validated['inventory_item_id']);

            if ($item->current_stock < $validated['quantity']) {
                return response()->json(['message' => 'Insufficient stock'], 422);
            }

            $item->decrement('current_stock', $validated['quantity']);

            ManualConsumption::create([
                'inventory_item_id' => $item->id,
                'quantity' => $validated['quantity'],
                'reason' => $validated['reason'],
                'user_id' => $request->user()->id,
            ]);

            StockMovement::create([
                'inventory_item_id' => $item->id,
                'type' => 'out',
                'quantity' => -$validated['quantity'],
                'note' => $validated['reason'],
                'user_id' => $request->user()->id,
            ]);

            return response()->json(['message' => 'Consumption recorded'], 201);
        });
    }

    public function index(): JsonResponse
    {
        $consumptions = ManualConsumption::with(['inventoryItem', 'user'])
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($consumptions);
    }
}
