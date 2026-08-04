<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\ManualConsumptionController;
use App\Http\Controllers\Api\MenuItemController;
use App\Http\Controllers\Api\RecipeController;
use App\Http\Controllers\Api\SaleController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::apiResource('categories', CategoryController::class);
    Route::apiResource('menu', MenuItemController::class);

    Route::get('/menu/{menuItem}/recipe', [RecipeController::class, 'index']);
    Route::post('/menu/{menuItem}/recipe', [RecipeController::class, 'store']);
    Route::put('/recipes/{recipe}', [RecipeController::class, 'update']);
    Route::delete('/recipes/{recipe}', [RecipeController::class, 'destroy']);

    Route::apiResource('inventory', InventoryController::class)->except(['destroy']);
    Route::post('/inventory/stock-in', [InventoryController::class, 'stockIn']);
    Route::post('/inventory/{inventoryItem}/adjust', [InventoryController::class, 'adjust']);
    Route::post('/inventory/{inventoryItem}/expire', [InventoryController::class, 'expire']);

    Route::post('/sales', [SaleController::class, 'store']);
    Route::get('/sales', [SaleController::class, 'index']);
    Route::get('/sales/{sale}', [SaleController::class, 'show']);
    Route::get('/sales/{sale}/receipt', [SaleController::class, 'receipt']);

    Route::post('/consumptions', [ManualConsumptionController::class, 'store']);
    Route::get('/consumptions', [ManualConsumptionController::class, 'index']);
});
