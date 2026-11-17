<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\ManualConsumption;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\StockMovement;
use App\Models\User;
use App\Support\PaymentMethods;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    public function daily(Request $request): JsonResponse
    {
        $request->validate(['date' => 'nullable|date_format:Y-m-d', ...self::FILTER_RULES]);
        $date = $request->date ? Carbon::parse($request->date) : Carbon::today();
        $filter = $this->saleFilter($request);

        $sales = Sale::whereDate('created_at', $date)->notVoided()->where($filter);
        $voided = Sale::whereDate('created_at', $date)->whereNotNull('voided_at')->where($filter);

        // SUM() comes back as a string on MySQL; the UI formats numbers.
        $totalSales = (int) (clone $sales)->sum('total_amount');
        $totalTransactions = (clone $sales)->count();
        $itemsSold = (int) SaleItem::whereHas('sale', fn ($q) => $q->whereDate('created_at', $date)->notVoided()->where($filter))
            ->when($request->category_id, fn ($q, $c) => $q->whereHas('menuItem', fn ($m) => $m->where('category_id', $c)))
            ->sum('quantity');

        $items = SaleItem::select(
            'menu_item_id',
            DB::raw('SUM(quantity) as total_quantity'),
            DB::raw('SUM(quantity * unit_price) as total_revenue'),
            DB::raw('SUM(quantity * COALESCE(unit_cost, 0)) as total_cost'),
            // Sales made before costing existed have no cost; count them so the UI can say so.
            DB::raw('SUM(CASE WHEN unit_cost IS NULL THEN quantity ELSE 0 END) as uncosted_quantity'),
        )
            ->whereHas('sale', fn ($q) => $q->whereDate('created_at', $date)->notVoided()->where($filter))
            ->when($request->category_id, fn ($q, $c) => $q->whereHas('menuItem', fn ($m) => $m->where('category_id', $c)))
            ->groupBy('menu_item_id')
            ->with('menuItem:id,name')
            ->orderByDesc('total_quantity')
            ->get();

        return response()->json([
            'date' => $date->format('Y-m-d'),
            'total_sales' => $totalSales,
            'total_transactions' => $totalTransactions,
            'items_sold' => $itemsSold,
            'voided_count' => (clone $voided)->count(),
            'voided_amount' => (int) (clone $voided)->sum('total_amount'),
            'payments' => (clone $sales)
                ->select('payment_method')
                ->selectRaw('COUNT(*) as count, SUM(total_amount) as amount')
                ->groupBy('payment_method')
                ->get()
                ->map(fn ($p) => [
                    'method' => $p->payment_method,
                    'label' => PaymentMethods::label($p->payment_method),
                    'count' => (int) $p->count,
                    'amount' => (int) $p->amount,
                ]),
            'total_cost' => round((float) $items->sum('total_cost'), 2),
            'gross_profit' => round($totalSales - (float) $items->sum('total_cost'), 2),
            'uncosted_quantity' => (int) $items->sum('uncosted_quantity'),
            'items' => $items,
        ]);
    }

    public function items(Request $request): JsonResponse
    {
        $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date', ...self::FILTER_RULES]);
        $from = $request->from ? Carbon::parse($request->from) : Carbon::now()->startOfMonth();
        $to = $request->to ? Carbon::parse($request->to) : Carbon::now();
        $filter = $this->saleFilter($request);

        $items = SaleItem::select(
            'menu_item_id',
            DB::raw('SUM(quantity) as total_quantity'),
            DB::raw('SUM(quantity * unit_price) as total_revenue'),
            DB::raw('SUM(quantity * COALESCE(unit_cost, 0)) as total_cost'),
            // Sales made before costing existed have no cost; count them so the UI can say so.
            DB::raw('SUM(CASE WHEN unit_cost IS NULL THEN quantity ELSE 0 END) as uncosted_quantity'),
        )
            ->whereHas('sale', function ($q) use ($from, $to, $filter) {
                $q->whereBetween('created_at', [$from, $to->copy()->endOfDay()])->notVoided()->where($filter);
            })
            ->when($request->category_id, fn ($q, $c) => $q->whereHas('menuItem', fn ($m) => $m->where('category_id', $c)))
            ->groupBy('menu_item_id')
            ->orderByDesc('total_quantity')
            ->with('menuItem:id,name,price')
            ->get()
            ->map(function ($row) {
                $row->total_cost = round((float) $row->total_cost, 2);
                $row->profit = round((float) $row->total_revenue - $row->total_cost, 2);
                $row->margin = (float) $row->total_revenue > 0 ? round($row->profit / (float) $row->total_revenue * 100, 1) : null;

                return $row;
            });

        return response()->json($items);
    }

    /** Optional filters shared by sales reports. */
    private const FILTER_RULES = [
        'user_id' => 'nullable|integer',
        'payment_method' => 'nullable|string|max:20',
        'category_id' => 'nullable|integer',
    ];

    private function saleFilter(Request $request): \Closure
    {
        return function ($q) use ($request) {
            $q->when($request->user_id, fn ($q, $v) => $q->where('user_id', $v))
                ->when($request->payment_method, fn ($q, $v) => $q->where('payment_method', $v));
        };
    }

    /** People who have made sales, for the cashier filter (no employees:view needed). */
    public function cashiers(): JsonResponse
    {
        return response()->json(
            User::whereIn('id', Sale::query()->select('user_id')->distinct())->orderBy('name')->get(['id', 'name'])
        );
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
            ->map(fn ($m) => [
                'date' => $m->created_at->format('Y-m-d'),
                'item' => $m->inventoryItem->name,
                'unit' => $m->inventoryItem->unit,
                'quantity' => abs($m->quantity),
                'value' => round(abs((float) $m->quantity) * (float) $m->unit_cost, 2),
                'type' => 'expiry',
            ]);

        $manual = ManualConsumption::whereBetween('created_at', [$from, $to->copy()->endOfDay()])
            ->with('inventoryItem:id,name,unit,avg_cost')
            ->get()
            ->map(fn ($c) => [
                'date' => $c->created_at->format('Y-m-d'),
                'item' => $c->inventoryItem->name,
                'unit' => $c->inventoryItem->unit,
                'quantity' => $c->quantity,
                'value' => round((float) $c->quantity * (float) $c->inventoryItem->avg_cost, 2),
                'type' => 'manual',
                'reason' => $c->reason,
            ]);

        return response()->json(['expired' => $expired, 'manual' => $manual]);
    }

    public function receipts(Request $request): JsonResponse
    {
        $request->validate(['date' => 'nullable|date_format:Y-m-d', 'status' => 'nullable|in:valid,voided', ...self::FILTER_RULES]);
        $date = $request->date ? Carbon::parse($request->date) : Carbon::today();

        $sales = Sale::whereDate('created_at', $date)
            ->where($this->saleFilter($request))
            ->when($request->status === 'valid', fn ($q) => $q->whereNull('voided_at'))
            ->when($request->status === 'voided', fn ($q) => $q->whereNotNull('voided_at'))
            ->with(['items' => fn ($q) => $q->with('menuItem:id,name'), 'user:id,name'])
            ->orderBy('created_at')
            ->get();

        $receipts = $sales->map(fn ($sale) => [
            'id' => $sale->id,
            'created_at' => $sale->created_at->toIso8601String(),
            'payment_method' => $sale->payment_method,
            'payment_label' => PaymentMethods::label($sale->payment_method),
            'payment_reference' => $sale->payment_reference,
            'cashier' => $sale->user?->name,
            'total_amount' => $sale->total_amount,
            'is_voided' => $sale->voided_at !== null,
            'items' => $sale->items->map(fn ($item) => [
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
            ->select('id', 'name', 'unit', 'current_stock', 'avg_cost')
            ->orderBy('name')
            ->get();

        $allMovements = StockMovement::whereBetween('created_at', [$from, $to])
            ->select('inventory_item_id', 'source', DB::raw('SUM(quantity) as total'))
            ->groupBy('inventory_item_id', 'source')
            ->get()
            ->groupBy('inventory_item_id');

        // Movements after the period end, used to roll current stock back to the period's closing.
        $afterPeriod = StockMovement::where('created_at', '>', $to)
            ->select('inventory_item_id', DB::raw('SUM(quantity) as total'))
            ->groupBy('inventory_item_id')
            ->pluck('total', 'inventory_item_id');

        $items = $items->map(function ($item) use ($allMovements, $afterPeriod) {
            $movements = ($allMovements[$item->id] ?? collect())->pluck('total', 'source');

            $closing = round((float) $item->current_stock - (float) ($afterPeriod[$item->id] ?? 0), 2);
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
                'void_returns' => round((float) ($movements['void'] ?? 0), 2),
                'closing' => $closing,
                'avg_cost' => round((float) $item->avg_cost, 2),
                // Valued at today's average cost.
                'closing_value' => round($closing * (float) $item->avg_cost, 2),
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
        $netAfterPeriod = (float) StockMovement::where('inventory_item_id', $item->id)
            ->where('created_at', '>', $to)
            ->sum('quantity');
        $closing = round((float) $item->current_stock - $netAfterPeriod, 2);
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
                    'void' => 'Sale Void',
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
