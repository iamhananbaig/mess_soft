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
        $date = $request->date ? Carbon::parse($request->date) : Carbon::today();

        $sales = Sale::whereDate('created_at', $date);

        $totalSales = (clone $sales)->sum('total_amount');
        $totalTransactions = (clone $sales)->count();
        $itemsSold = SaleItem::whereHas('sale', fn($q) => $q->whereDate('created_at', $date))->sum('quantity');

        return response()->json([
            'date' => $date->format('Y-m-d'),
            'total_sales' => $totalSales,
            'total_transactions' => $totalTransactions,
            'items_sold' => $itemsSold,
        ]);
    }

    public function items(Request $request): JsonResponse
    {
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
            ->select('id', 'name', 'unit', 'current_stock', 'cost_per_unit')
            ->orderBy('name')
            ->get()
            ->map(fn($item) => [
                'id' => $item->id,
                'name' => $item->name,
                'unit' => $item->unit,
                'current_stock' => $item->current_stock,
                'cost_per_unit' => $item->cost_per_unit,
                'total_value' => $item->current_stock * $item->cost_per_unit,
            ]);

        return response()->json($items);
    }

    public function waste(Request $request): JsonResponse
    {
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
}
