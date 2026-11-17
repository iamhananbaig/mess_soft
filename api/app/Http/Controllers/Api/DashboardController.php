<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CashClosing;
use App\Models\InventoryItem;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\VoidRequest;
use App\Support\PaymentMethods;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Everything the manager dashboard needs in one request.
 */
class DashboardController extends Controller
{
    private const TREND_DAYS = 30;

    private const EXPIRY_WINDOW_DAYS = 7;

    public function show(): JsonResponse
    {
        $today = Carbon::today();
        $yesterday = $today->copy()->subDay();

        return response()->json([
            'date' => $today->format('Y-m-d'),
            'today' => $this->daySummary($today),
            'yesterday' => $this->daySummary($yesterday),
            'trend' => $this->trend($today),
            'hourly' => $this->hourly($today),
            'payments' => $this->payments($today),
            'top_items' => $this->topItems($today->copy()->subDays(6), $today),
            'alerts' => $this->alerts($today),
        ]);
    }

    private function daySummary(Carbon $day): array
    {
        $sales = Sale::whereDate('created_at', $day)->notVoided();
        $revenue = (int) (clone $sales)->sum('total_amount');
        $count = (clone $sales)->count();
        $cost = (float) SaleItem::whereHas('sale', fn ($q) => $q->whereDate('created_at', $day)->notVoided())
            ->sum(DB::raw('quantity * COALESCE(unit_cost, 0)'));

        return [
            'revenue' => $revenue,
            'transactions' => $count,
            'average_ticket' => $count ? (int) round($revenue / $count) : 0,
            'cost' => round($cost, 2),
            'profit' => round($revenue - $cost, 2),
            'voided_count' => Sale::whereDate('created_at', $day)->whereNotNull('voided_at')->count(),
        ];
    }

    /** Revenue and profit per day for the last 30 days (zero-filled). */
    private function trend(Carbon $today): array
    {
        $from = $today->copy()->subDays(self::TREND_DAYS - 1);

        $revenue = Sale::where('created_at', '>=', $from)->notVoided()
            ->selectRaw('DATE(created_at) as day, SUM(total_amount) as revenue, COUNT(*) as transactions')
            ->groupBy('day')->get()->keyBy('day');

        $cost = SaleItem::join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.created_at', '>=', $from)->whereNull('sales.voided_at')
            ->selectRaw('DATE(sales.created_at) as day, SUM(sale_items.quantity * COALESCE(sale_items.unit_cost, 0)) as cost')
            ->groupBy('day')->pluck('cost', 'day');

        $days = [];
        for ($d = $from->copy(); $d->lte($today); $d->addDay()) {
            $key = $d->format('Y-m-d');
            $rev = (int) ($revenue[$key]->revenue ?? 0);
            $days[] = [
                'date' => $key,
                'revenue' => $rev,
                'profit' => round($rev - (float) ($cost[$key] ?? 0), 2),
                'transactions' => (int) ($revenue[$key]->transactions ?? 0),
            ];
        }

        return $days;
    }

    /** Sales by hour today, to see the rush. */
    private function hourly(Carbon $today): array
    {
        $hourExpr = DB::connection()->getDriverName() === 'sqlite'
            ? "CAST(strftime('%H', created_at) AS INTEGER)"
            : 'HOUR(created_at)';

        $rows = Sale::whereDate('created_at', $today)->notVoided()
            ->selectRaw("{$hourExpr} as hour, SUM(total_amount) as revenue, COUNT(*) as transactions")
            ->groupBy('hour')->get()->keyBy('hour');

        return collect(range(0, 23))
            ->map(fn ($h) => ['hour' => $h, 'revenue' => (int) ($rows[$h]->revenue ?? 0), 'transactions' => (int) ($rows[$h]->transactions ?? 0)])
            ->all();
    }

    private function payments(Carbon $today): array
    {
        return Sale::whereDate('created_at', $today)->notVoided()
            ->select('payment_method')->selectRaw('SUM(total_amount) as amount, COUNT(*) as count')
            ->groupBy('payment_method')->get()
            ->map(fn ($p) => ['method' => $p->payment_method, 'label' => PaymentMethods::label($p->payment_method), 'amount' => (int) $p->amount, 'count' => (int) $p->count])
            ->sortByDesc('amount')->values()->all();
    }

    private function topItems(Carbon $from, Carbon $to): array
    {
        return SaleItem::whereHas('sale', fn ($q) => $q->whereBetween('created_at', [$from, $to->copy()->endOfDay()])->notVoided())
            ->select('menu_item_id')
            ->selectRaw('SUM(quantity) as quantity, SUM(quantity * unit_price) as revenue, SUM(quantity * COALESCE(unit_cost, 0)) as cost')
            ->groupBy('menu_item_id')->orderByDesc('revenue')->limit(5)
            ->with('menuItem:id,name')->get()
            ->map(fn ($r) => [
                'name' => $r->menuItem?->name ?? 'Item',
                'quantity' => (int) $r->quantity,
                'revenue' => (int) $r->revenue,
                'profit' => round((float) $r->revenue - (float) $r->cost, 2),
            ])->all();
    }

    private function alerts(Carbon $today): array
    {
        $lowStock = InventoryItem::active()
            ->where('reorder_level', '>', 0)
            ->whereColumn('current_stock', '<=', 'reorder_level')
            ->orderBy('name')->get(['id', 'name', 'unit', 'current_stock', 'reorder_level']);

        $expiring = InventoryItem::active()
            ->whereNotNull('expiry_date')
            ->where('current_stock', '>', 0)
            ->whereDate('expiry_date', '<=', $today->copy()->addDays(self::EXPIRY_WINDOW_DAYS))
            ->orderBy('expiry_date')->get(['id', 'name', 'unit', 'current_stock', 'expiry_date'])
            ->map(fn ($i) => [...$i->toArray(), 'expired' => $i->expiry_date->lt($today)]);

        // Cashiers with sales today whose drawer isn't closed yet.
        $closed = CashClosing::whereDate('date', $today)->pluck('user_id');
        $openDrawers = Sale::whereDate('created_at', $today)->whereNotIn('user_id', $closed)
            ->distinct()->count('user_id');

        return [
            'low_stock' => $lowStock,
            'expiring' => $expiring,
            'pending_voids' => VoidRequest::where('status', VoidRequest::PENDING)->count(),
            'open_drawers' => $openDrawers,
            'stock_value' => round((float) InventoryItem::active()->where('current_stock', '>', 0)->sum(DB::raw('current_stock * avg_cost')), 2),
        ];
    }
}
