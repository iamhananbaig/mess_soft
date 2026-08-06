<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\Recipe;
use App\Models\User;
use Illuminate\Database\Seeder;

class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('production')) {
            return;
        }

        // Users
        $admin = User::create(['name' => 'Admin', 'email' => 'admin@canteen.com', 'password' => bcrypt('password')]);
        $cashier = User::create(['name' => 'Cashier 1', 'email' => 'cashier@canteen.com', 'password' => bcrypt('password')]);
        $employee = User::create(['name' => 'Employee 1', 'email' => 'employee@canteen.com', 'password' => bcrypt('password')]);

        $admin->assignRole('admin');
        $cashier->assignRole('cashier');
        $employee->assignRole('employee');

        // Categories
        $burgers = Category::create(['name' => 'Burgers']);
        $drinks = Category::create(['name' => 'Drinks']);
        $snacks = Category::create(['name' => 'Snacks']);

        // Menu Items
        $chickenBurger = MenuItem::create(['category_id' => $burgers->id, 'name' => 'Chicken Burger', 'price' => 350, 'description' => 'Grilled chicken with lettuce']);
        $beefBurger = MenuItem::create(['category_id' => $burgers->id, 'name' => 'Beef Burger', 'price' => 400, 'description' => 'Classic beef patty']);
        $coke = MenuItem::create(['category_id' => $drinks->id, 'name' => 'Coke 500ml', 'price' => 60]);
        $fries = MenuItem::create(['category_id' => $snacks->id, 'name' => 'French Fries', 'price' => 150]);
        $shawarma = MenuItem::create(['category_id' => $burgers->id, 'name' => 'Shawarma', 'price' => 200, 'description' => 'Chicken shawarma wrap']);

        // Inventory Items
        $bun = InventoryItem::create(['name' => 'Bun', 'unit' => 'pcs', 'current_stock' => 100]);
        $chickenPatty = InventoryItem::create(['name' => 'Chicken Patty', 'unit' => 'pcs', 'current_stock' => 50]);
        $beefPatty = InventoryItem::create(['name' => 'Beef Patty', 'unit' => 'pcs', 'current_stock' => 50]);
        $lettuce = InventoryItem::create(['name' => 'Lettuce', 'unit' => 'g', 'current_stock' => 2000]);
        $sauce = InventoryItem::create(['name' => 'Sauce', 'unit' => 'ml', 'current_stock' => 5000]);
        $cokeBottle = InventoryItem::create(['name' => 'Coke 500ml', 'unit' => 'bottle', 'current_stock' => 60]);
        $potato = InventoryItem::create(['name' => 'Potato', 'unit' => 'kg', 'current_stock' => 20]);
        $shawarmaBread = InventoryItem::create(['name' => 'Shawarma Bread', 'unit' => 'pcs', 'current_stock' => 30]);
        $shawarmaMeat = InventoryItem::create(['name' => 'Shawarma Meat', 'unit' => 'g', 'current_stock' => 3000]);

        // Recipes
        // Chicken Burger: 1 bun, 1 chicken patty, lettuce, sauce
        Recipe::create(['menu_item_id' => $chickenBurger->id, 'inventory_item_id' => $bun->id, 'quantity' => 1]);
        Recipe::create(['menu_item_id' => $chickenBurger->id, 'inventory_item_id' => $chickenPatty->id, 'quantity' => 1]);
        Recipe::create(['menu_item_id' => $chickenBurger->id, 'inventory_item_id' => $lettuce->id, 'quantity' => 50]);
        Recipe::create(['menu_item_id' => $chickenBurger->id, 'inventory_item_id' => $sauce->id, 'quantity' => 20]);

        // Beef Burger: 1 bun, 1 beef patty, lettuce, sauce
        Recipe::create(['menu_item_id' => $beefBurger->id, 'inventory_item_id' => $bun->id, 'quantity' => 1]);
        Recipe::create(['menu_item_id' => $beefBurger->id, 'inventory_item_id' => $beefPatty->id, 'quantity' => 1]);
        Recipe::create(['menu_item_id' => $beefBurger->id, 'inventory_item_id' => $lettuce->id, 'quantity' => 50]);
        Recipe::create(['menu_item_id' => $beefBurger->id, 'inventory_item_id' => $sauce->id, 'quantity' => 20]);

        // Coke: 1 bottle
        Recipe::create(['menu_item_id' => $coke->id, 'inventory_item_id' => $cokeBottle->id, 'quantity' => 1]);

        // Fries: potato + sauce
        Recipe::create(['menu_item_id' => $fries->id, 'inventory_item_id' => $potato->id, 'quantity' => 0.2]);
        Recipe::create(['menu_item_id' => $fries->id, 'inventory_item_id' => $sauce->id, 'quantity' => 10]);

        // Shawarma: bread, meat, sauce
        Recipe::create(['menu_item_id' => $shawarma->id, 'inventory_item_id' => $shawarmaBread->id, 'quantity' => 1]);
        Recipe::create(['menu_item_id' => $shawarma->id, 'inventory_item_id' => $shawarmaMeat->id, 'quantity' => 150]);
        Recipe::create(['menu_item_id' => $shawarma->id, 'inventory_item_id' => $sauce->id, 'quantity' => 15]);
    }
}
