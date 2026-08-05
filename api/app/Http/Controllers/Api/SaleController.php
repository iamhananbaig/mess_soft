<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SaleController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.menu_item_id' => 'required|exists:menu_items,id',
            'items.*.quantity' => 'required|integer|min:1',
            'amount_received' => 'required|integer|min:0',
        ]);

        return DB::transaction(function () use ($validated, $request) {
            $menuItemIds = array_column($validated['items'], 'menu_item_id');
            $menuItems = MenuItem::with('recipes.inventoryItem')
                ->whereIn('id', $menuItemIds)
                ->get()
                ->keyBy('id');

            $inventoryIds = [];
            foreach ($validated['items'] as $item) {
                $menuItem = $menuItems[$item['menu_item_id']];
                foreach ($menuItem->recipes as $recipe) {
                    $inventoryIds[] = $recipe->inventory_item_id;
                }
            }
            $inventoryItems = InventoryItem::lockForUpdate()
                ->whereIn('id', array_unique($inventoryIds))
                ->get()
                ->keyBy('id');

            foreach ($validated['items'] as $item) {
                $menuItem = $menuItems[$item['menu_item_id']];
                foreach ($menuItem->recipes as $recipe) {
                    $needed = $recipe->quantity * $item['quantity'];
                    $inventory = $inventoryItems[$recipe->inventory_item_id];
                    if ($inventory->current_stock < $needed) {
                        return response()->json(['message' => "Insufficient stock for {$inventory->name}"], 422);
                    }
                }
            }

            $totalAmount = 0;
            foreach ($validated['items'] as $item) {
                $menuItem = $menuItems[$item['menu_item_id']];
                $totalAmount += $menuItem->price * $item['quantity'];
            }

            if ($validated['amount_received'] < $totalAmount) {
                return response()->json(['message' => 'Amount received must be greater than or equal to total'], 422);
            }

            $change = $validated['amount_received'] - $totalAmount;

            $sale = Sale::create([
                'user_id' => $request->user()->id,
                'total_amount' => $totalAmount,
                'payment_method' => 'cash',
                'amount_received' => $validated['amount_received'],
                'change' => $change,
            ]);

            foreach ($validated['items'] as $item) {
                $menuItem = $menuItems[$item['menu_item_id']];

                SaleItem::create([
                    'sale_id' => $sale->id,
                    'menu_item_id' => $menuItem->id,
                    'quantity' => $item['quantity'],
                    'unit_price' => $menuItem->price,
                ]);

                foreach ($menuItem->recipes as $recipe) {
                    $needed = $recipe->quantity * $item['quantity'];
                    $inventory = $inventoryItems[$recipe->inventory_item_id];
                    $inventory->decrement('current_stock', $needed);

                    StockMovement::create([
                        'inventory_item_id' => $inventory->id,
                        'type' => 'out',
                        'source' => 'sale',
                        'quantity' => -$needed,
                        'note' => "Sale #{$sale->id}",
                        'user_id' => $request->user()->id,
                    ]);
                }
            }

            return response()->json([
                'id' => $sale->id,
                'total_amount' => $sale->total_amount,
                'amount_received' => $sale->amount_received,
                'change' => $sale->change,
                'items' => $sale->items()->with('menuItem')->get(),
            ], 201);
        });
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => 'nullable|date',
            'to' => 'nullable|date',
            'user_id' => 'nullable|exists:users,id',
            'per_page' => 'sometimes|integer|min:1|max:100',
        ]);

        $query = Sale::with('items.menuItem')->orderByDesc('created_at');

        if ($validated['from'] ?? null) {
            $query->where('created_at', '>=', $validated['from']);
        }
        if ($validated['to'] ?? null) {
            $query->where('created_at', '<=', $validated['to'] . ' 23:59:59');
        }
        if ($validated['user_id'] ?? null) {
            $query->where('user_id', $validated['user_id']);
        }

        $perPage = min((int) ($validated['per_page'] ?? 20), 100);
        $sales = $query->paginate($perPage);
        return response()->json($sales);
    }

    public function show(Sale $sale): JsonResponse
    {
        return response()->json($sale->load(['items.menuItem', 'user']));
    }

    public function receipt(Sale $sale): JsonResponse
    {
        $sale->load(['items.menuItem', 'user']);

        return response()->json([
            'canteen_name' => 'ISLAMABAD DIAGNOSTIC CENTRE PVT LTD',
            'branch_name' => 'Main Branch',
            'date' => $sale->created_at->timezone('Asia/Karachi')->format('d-M-Y'),
            'time' => $sale->created_at->timezone('Asia/Karachi')->format('h:i A'),
            'receipt_number' => str_pad($sale->id, 6, '0', STR_PAD_LEFT),
            'cashier' => $sale->user->name,
            'items' => $sale->items->map(fn($item) => [
                'name' => $item->menuItem->name,
                'quantity' => $item->quantity,
                'rate' => $item->unit_price,
                'amount' => $item->unit_price * $item->quantity,
            ]),
            'total' => $sale->total_amount,
            'payment_method' => ucfirst($sale->payment_method),
            'amount_received' => $sale->amount_received,
            'change' => $sale->change,
        ]);
    }
}
