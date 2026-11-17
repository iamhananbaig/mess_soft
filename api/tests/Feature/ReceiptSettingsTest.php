<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\MenuItem;
use App\Models\User;
use Tests\TestCase;

class ReceiptSettingsTest extends TestCase
{
    private array $valid = [
        'canteen_name' => 'TEST CANTEEN',
        'branch_name' => 'Branch 2',
        'show_branch' => true,
        'header_lines' => "Street 1\nPh: 051-123",
        'footer_text' => 'Come again',
        'show_cashier' => false,
        'show_payment' => true,
        'paper_width' => '80',
        'tear_feed_lines' => 5,
    ];

    public function test_defaults_match_previous_receipt(): void
    {
        $this->withHeaders($this->authHeaders())->getJson('/api/v1/settings/receipt')
            ->assertOk()
            ->assertJson([
                'canteen_name' => config('app.receipt.canteen_name'),
                'footer_text' => 'Thank you for visiting!',
                'paper_width' => '80',
                'text_size' => 'large',
                'show_cashier' => true,
            ]);
    }

    public function test_admin_can_update_and_receipt_uses_it(): void
    {
        $this->withHeaders($this->authHeaders())->putJson('/api/v1/settings/receipt', $this->valid)
            ->assertOk()->assertJson(['canteen_name' => 'TEST CANTEEN', 'paper_width' => '80']);

        $cat = Category::create(['name' => 'Drinks']);
        $item = MenuItem::create(['category_id' => $cat->id, 'name' => 'Tea', 'price' => 50]);
        $saleId = $this->withHeaders($this->authHeaders())->postJson('/api/v1/sales', [
            'items' => [['menu_item_id' => $item->id, 'quantity' => 1]], 'amount_received' => 50,
        ])->json('id');

        $this->withHeaders($this->authHeaders())->getJson("/api/v1/sales/{$saleId}/receipt")
            ->assertJson(['canteen_name' => 'TEST CANTEEN', 'branch_name' => 'Branch 2']);
    }

    public function test_cashier_can_read_but_not_update(): void
    {
        $cashier = User::create(['name' => 'C', 'email' => 'c@test.com', 'password' => bcrypt('password')]);
        $cashier->assignRole('cashier');
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer '.$cashier->createToken('t')->plainTextToken];

        $this->withHeaders($headers)->getJson('/api/v1/settings/receipt')->assertOk();
        $this->withHeaders($headers)->putJson('/api/v1/settings/receipt', $this->valid)->assertForbidden();
    }

    public function test_validation(): void
    {
        $this->withHeaders($this->authHeaders())
            ->putJson('/api/v1/settings/receipt', ['header_lines' => "1\n2\n3\n4", 'paper_width' => '70'] + $this->valid)
            ->assertUnprocessable()->assertJsonValidationErrors(['header_lines', 'paper_width']);
    }
}
