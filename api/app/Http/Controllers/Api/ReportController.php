<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\ManualConsumption;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    public function daily(Request $request): JsonResponse
    {
        $request->validate(['date' => 'nullable|date_format:Y-m-d']);
        $date = $request->date ? Carbon::parse($request->date) : Carbon::today();

        $sales = Sale::whereDate('created_at', $date);

        $totalSales = (clone $sales)->sum('total_amount');
        $totalTransactions = (clone $sales)->count();
        $itemsSold = SaleItem::whereHas('sale', fn($q) => $q->whereDate('created_at', $date))->sum('quantity');

        $items = SaleItem::select(
                'menu_item_id',
                DB::raw('SUM(quantity) as total_quantity'),
                DB::raw('SUM(quantity * unit_price) as total_revenue')
            )
            ->whereHas('sale', fn($q) => $q->whereDate('created_at', $date))
            ->groupBy('menu_item_id')
            ->with('menuItem:id,name')
            ->orderByDesc('total_quantity')
            ->get();

        return response()->json([
            'date' => $date->format('Y-m-d'),
            'total_sales' => $totalSales,
            'total_transactions' => $totalTransactions,
            'items_sold' => $itemsSold,
            'items' => $items,
        ]);
    }

    public function items(Request $request): JsonResponse
    {
        $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date']);
        $from = $request->from ? Carbon::parse($request->from) : Carbon::now()->startOfMonth();
        $to = $request->to ? Carbon::parse($request->to) : Carbon::now();

        $items = SaleItem::select('menu_item_id', DB::raw('SUM(quantity) as total_quantity'), DB::raw('SUM(quantity * unit_price) as total_revenue'))
            ->whereHas('sale', function ($q) use ($from, $to) {
                $q->whereBetween('created_at', [$from, $to->copy()->endOfDay()]);
            })
            ->groupBy('menu_item_id')
            ->orderByDesc('total_quantity')
            ->with('menuItem:id,name,price')
            ->get();

        return response()->json($items);
    }

    public function stock(): JsonResponse
    {
        $items = InventoryItem::active()
            ->select('id', 'name', 'unit', 'current_stock')
            ->orderBy('name')
            ->get();

        return response()->json($items);
    }

    public function waste(Request $request): JsonResponse
    {
        $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date']);
        $from = $request->from ? Carbon::parse($request->from) : Carbon::now()->startOfMonth();
        $to = $request->to ? Carbon::parse($request->to) : Carbon::now();

        $expired = StockMovement::where('type', 'expiry')
            ->whereBetween('created_at', [$from, $to->copy()->endOfDay()])
            ->with('inventoryItem:id,name,unit')
            ->get()
            ->map(fn($m) => [
                'date' => $m->created_at->format('Y-m-d'),
                'item' => $m->inventoryItem->name,
                'unit' => $m->inventoryItem->unit,
                'quantity' => abs($m->quantity),
                'type' => 'expiry',
            ]);

        $manual = ManualConsumption::whereBetween('created_at', [$from, $to->copy()->endOfDay()])
            ->with('inventoryItem:id,name,unit')
            ->get()
            ->map(fn($c) => [
                'date' => $c->created_at->format('Y-m-d'),
                'item' => $c->inventoryItem->name,
                'unit' => $c->inventoryItem->unit,
                'quantity' => $c->quantity,
                'type' => 'manual',
                'reason' => $c->reason,
            ]);

        return response()->json(['expired' => $expired, 'manual' => $manual]);
    }

    public function receipts(Request $request): JsonResponse
    {
        $request->validate(['date' => 'nullable|date_format:Y-m-d']);
        $date = $request->date ? Carbon::parse($request->date) : Carbon::today();

        $sales = Sale::whereDate('created_at', $date)
            ->with(['items' => fn($q) => $q->with('menuItem:id,name')])
            ->orderBy('created_at')
            ->get();

        $receipts = $sales->map(fn($sale) => [
            'id' => $sale->id,
            'created_at' => $sale->created_at->toIso8601String(),
            'payment_method' => $sale->payment_method,
            'total_amount' => $sale->total_amount,
            'items' => $sale->items->map(fn($item) => [
                'item' => $item->menuItem->name,
                'price' => $item->unit_price,
                'quantity' => $item->quantity,
                'amount' => $item->unit_price * $item->quantity,
            ]),
        ]);

        return response()->json([
            'date' => $date->format('Y-m-d'),
            'receipts' => $receipts,
        ]);
    }

    public function stockSummary(Request $request): JsonResponse
    {
        $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date']);
        $from = $request->from ? Carbon::parse($request->from) : Carbon::now()->startOfMonth()->toDateTimeString();
        $to = $request->to ? Carbon::parse($request->to)->endOfDay() : Carbon::now();

        $items = InventoryItem::active()
            ->select('id', 'name', 'unit', 'current_stock')
            ->orderBy('name')
            ->get();

        $allMovements = StockMovement::whereBetween('created_at', [$from, $to])
            ->select('inventory_item_id', 'source', DB::raw('SUM(quantity) as total'))
            ->groupBy('inventory_item_id', 'source')
            ->get()
            ->groupBy('inventory_item_id');

        $items = $items->map(function ($item) use ($allMovements) {
            $movements = ($allMovements[$item->id] ?? collect())->pluck('total', 'source');

            $closing = (float) $item->current_stock;
            $netChange = $movements->sum();
            $opening = $closing - $netChange;

            return [
                'id' => $item->id,
                'name' => $item->name,
                'unit' => $item->unit,
                'opening' => round($opening, 2),
                'additions' => round((float) ($movements['stock-in'] ?? 0), 2),
                'pos_consumption' => round((float) ($movements['sale'] ?? 0), 2),
                'manual_consumption' => round((float) ($movements['manual'] ?? 0), 2),
                'expired' => round((float) ($movements['expiry'] ?? 0), 2),
                'adjustments' => round((float) ($movements['adjustment'] ?? 0), 2),
                'closing' => $closing,
            ];
        });

        return response()->json($items);
    }

    public function ledger(Request $request): JsonResponse
    {
        $request->validate([
            'inventory_item_id' => 'required|exists:inventory_items,id',
            'from' => 'nullable|date',
            'to' => 'nullable|date',
        ]);

        $from = $request->from ? Carbon::parse($request->from) : Carbon::now()->startOfMonth()->toDateTimeString();
        $to = $request->to ? Carbon::parse($request->to)->endOfDay() : Carbon::now();

        $item = InventoryItem::findOrFail($request->inventory_item_id);

        $movements = StockMovement::where('inventory_item_id', $item->id)
            ->whereBetween('created_at', [$from, $to])
            ->with('user:id,name')
            ->orderBy('created_at', 'asc')
            ->get();

        $netInPeriod = (float) $movements->sum('quantity');
        $closing = (float) $item->current_stock;
        $opening = $closing - $netInPeriod;

        $balance = $opening;
        $movements = $movements->map(function ($m) use (&$balance) {
            $balance += (float) $m->quantity;
            return [
                'id' => $m->id,
                'date' => $m->created_at->timezone('Asia/Karachi')->format('Y-m-d h:i A'),
                'type' => $m->type,
                'source' => $m->source,
                'source_label' => match ($m->source) {
                    'stock-in' => 'Stock In',
                    'sale' => 'POS Sale',
                    'manual' => 'Manual Consumption',
                    'adjustment' => 'Adjustment',
                    'expiry' => 'Expired',
                    default => ucfirst($m->type),
                },
                'quantity' => (float) $m->quantity,
                'balance' => round($balance, 2),
                'reference' => $m->reference,
                'note' => $m->note,
                'user' => $m->user->name,
            ];
        });

        return response()->json([
            'item' => [
                'id' => $item->id,
                'name' => $item->name,
                'unit' => $item->unit,
            ],
            'opening_stock' => round($opening, 2),
            'closing_stock' => $closing,
            'movements' => $movements,
        ]);
    }
}
