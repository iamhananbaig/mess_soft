<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Support\Activity;
use App\Support\PaymentMethods;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SettingController extends Controller
{
    /** Every signed-in user needs this to print. */
    public function receipt(): JsonResponse
    {
        return response()->json(Setting::receipt());
    }

    public function pos(): JsonResponse
    {
        return response()->json([
            ...Setting::pos(),
            'available_payment_methods' => collect(PaymentMethods::LABELS)->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values(),
        ]);
    }

    public function updatePos(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'payment_methods' => 'required|array|min:1',
            'payment_methods.*' => ['string', 'distinct', Rule::in(PaymentMethods::keys())],
        ]);

        $before = Setting::pos();
        Setting::setValue('pos', ['payment_methods' => array_values($validated['payment_methods'])]);
        Activity::log('settings.pos', 'Changed POS payment methods', null, Activity::diff($before, Setting::pos()));

        return $this->pos();
    }

    public function updateReceipt(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'canteen_name' => 'required|string|max:60',
            'branch_name' => 'nullable|string|max:60',
            'show_branch' => 'required|boolean',
            'header_lines' => ['nullable', 'string', 'max:200', function ($attribute, $value, $fail) {
                if (count(preg_split('/\R/', (string) $value)) > 3) {
                    $fail('Header can have at most 3 lines.');
                }
            }],
            'footer_text' => 'nullable|string|max:120',
            'show_cashier' => 'required|boolean',
            'show_payment' => 'required|boolean',
            'paper_width' => 'required|in:58,80',
            'text_size' => 'sometimes|in:large,compact',
            'print_width_mm' => 'sometimes|integer|in:64,66,68,70,72',
            'tear_feed_lines' => 'required|integer|min:0|max:12',
        ]);

        $validated['branch_name'] ??= '';
        $validated['header_lines'] ??= '';
        $validated['footer_text'] ??= '';

        $before = Setting::receipt();
        Setting::setValue('receipt', $validated);
        Activity::log('settings.receipt', 'Changed receipt design', null, Activity::diff($before, Setting::receipt()));

        return response()->json(Setting::receipt());
    }
}
