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
        ]);

        return DB::transaction(function () use ($validated, $request) {
            foreach ($validated['items'] as $item) {
                $menuItem = MenuItem::with('recipes.inventoryItem')->findOrFail($item['menu_item_id']);

                foreach ($menuItem->recipes as $recipe) {
                    $needed = $recipe->quantity * $item['quantity'];
                    $inventory = $recipe->inventoryItem;

                    if ($inventory->current_stock < $needed) {
                        return response()->json([
                            'message' => "Insufficient stock for {$inventory->name}",
                        ], 422);
                    }
                }
            }

            $totalAmount = 0;
            foreach ($validated['items'] as $item) {
                $menuItem = MenuItem::findOrFail($item['menu_item_id']);
                $totalAmount += $menuItem->price * $item['quantity'];
            }

            $sale = Sale::create([
                'user_id' => $request->user()->id,
                'total_amount' => $totalAmount,
                'payment_method' => 'cash',
            ]);

            foreach ($validated['items'] as $item) {
                $menuItem = MenuItem::findOrFail($item['menu_item_id']);

                SaleItem::create([
                    'sale_id' => $sale->id,
                    'menu_item_id' => $menuItem->id,
                    'quantity' => $item['quantity'],
                    'unit_price' => $menuItem->price,
                ]);

                foreach ($menuItem->recipes as $recipe) {
                    $needed = $recipe->quantity * $item['quantity'];
                    $inventory = InventoryItem::lockForUpdate()->findOrFail($recipe->inventory_item_id);
                    $inventory->decrement('current_stock', $needed);

                    StockMovement::create([
                        'inventory_item_id' => $inventory->id,
                        'type' => 'out',
                        'quantity' => -$needed,
                        'note' => "Sale #{$sale->id}",
                        'user_id' => $request->user()->id,
                    ]);
                }
            }

            return response()->json([
                'id' => $sale->id,
                'total_amount' => $sale->total_amount,
                'items' => $sale->items()->with('menuItem')->get(),
            ], 201);
        });
    }

    public function index(Request $request): JsonResponse
    {
        $query = Sale::with('items.menuItem')->orderByDesc('created_at');

        if ($request->from) {
            $query->where('created_at', '>=', $request->from);
        }
        if ($request->to) {
            $query->where('created_at', '<=', $request->to . ' 23:59:59');
        }
        if ($request->user_id) {
            $query->where('user_id', $request->user_id);
        }

        $sales = $query->paginate($request->per_page ?? 20);
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
            'canteen_name' => 'Canteen',
            'receipt_number' => str_pad($sale->id, 6, '0', STR_PAD_LEFT),
            'date' => $sale->created_at->timezone('Asia/Karachi')->format('Y-m-d H:i'),
            'cashier' => $sale->user->name,
            'items' => $sale->items->map(fn($item) => [
                'name' => $item->menuItem->name,
                'quantity' => $item->quantity,
                'unit_price' => $item->unit_price,
                'amount' => $item->unit_price * $item->quantity,
            ]),
            'total' => $sale->total_amount,
            'payment_method' => ucfirst($sale->payment_method),
        ]);
    }
}
