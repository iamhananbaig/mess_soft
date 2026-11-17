<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CashClosingController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\ManualConsumptionController;
use App\Http\Controllers\Api\MenuItemController;
use App\Http\Controllers\Api\PermissionController;
use App\Http\Controllers\Api\RecipeController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\SettingController;
use App\Http\Controllers\Api\VoidRequestController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
        Route::put('/me/password', [AuthController::class, 'changePassword'])->middleware('throttle:10,1');

        Route::get('/settings/receipt', [SettingController::class, 'receipt']);
        Route::put('/settings/receipt', [SettingController::class, 'updateReceipt'])
            ->middleware('permission:settings:manage');

        Route::middleware('permission:categories:view')->group(function () {
            Route::get('/categories', [CategoryController::class, 'index']);
        });
        Route::middleware('permission:categories:create')->group(function () {
            Route::post('/categories', [CategoryController::class, 'store']);
        });
        Route::middleware('permission:categories:edit')->group(function () {
            Route::put('/categories/{category}', [CategoryController::class, 'update']);
        });
        Route::middleware('permission:categories:delete')->group(function () {
            Route::delete('/categories/{category}', [CategoryController::class, 'destroy']);
        });
        Route::get('/categories/{category}', [CategoryController::class, 'show'])->middleware('permission:categories:view');

        Route::middleware('permission:menu:view')->group(function () {
            Route::get('/menu', [MenuItemController::class, 'index']);
        });
        Route::middleware('permission:menu:create')->group(function () {
            Route::post('/menu', [MenuItemController::class, 'store']);
        });
        Route::middleware('permission:menu:edit')->group(function () {
            Route::put('/menu/{menu}', [MenuItemController::class, 'update']);
        });
        Route::middleware('permission:menu:delete')->group(function () {
            Route::delete('/menu/{menu}', [MenuItemController::class, 'destroy']);
        });
        Route::get('/menu/{menu}', [MenuItemController::class, 'show'])->middleware('permission:menu:view');

        Route::middleware('permission:recipes:manage')->group(function () {
            Route::get('/menu/{menuItem}/recipe', [RecipeController::class, 'index']);
            Route::post('/menu/{menuItem}/recipe', [RecipeController::class, 'store']);
            Route::put('/recipes/{recipe}', [RecipeController::class, 'update']);
            Route::delete('/recipes/{recipe}', [RecipeController::class, 'destroy']);
        });

        Route::middleware('permission:inventory:view')->group(function () {
            Route::get('/inventory', [InventoryController::class, 'index']);
        });
        Route::middleware('permission:inventory:create')->group(function () {
            Route::post('/inventory', [InventoryController::class, 'store']);
            Route::post('/inventory/stock-in', [InventoryController::class, 'stockIn']);
        });
        Route::middleware('permission:inventory:edit')->group(function () {
            Route::put('/inventory/{inventory}', [InventoryController::class, 'update']);
            Route::post('/inventory/{inventoryItem}/adjust', [InventoryController::class, 'adjust']);
            Route::post('/inventory/{inventoryItem}/expire', [InventoryController::class, 'expire']);
        });
        Route::get('/inventory/{inventory}', [InventoryController::class, 'show'])->middleware('permission:inventory:view');

        Route::middleware('permission:sales:create')->group(function () {
            Route::post('/sales', [SaleController::class, 'store']);
        });
        Route::middleware('permission:sales:view')->group(function () {
            Route::get('/sales', [SaleController::class, 'index']);
            Route::get('/sales/{sale}', [SaleController::class, 'show']);
            Route::get('/sales/{sale}/receipt', [SaleController::class, 'receipt']);
        });

        Route::post('/sales/{sale}/void-requests', [VoidRequestController::class, 'store'])
            ->middleware('permission:sales:void-request');
        Route::get('/void-requests', [VoidRequestController::class, 'index'])
            ->middleware('permission:sales:void-request|sales:void-approve');
        Route::middleware('permission:sales:void-approve')->group(function () {
            Route::post('/void-requests/{voidRequest}/approve', [VoidRequestController::class, 'approve']);
            Route::post('/void-requests/{voidRequest}/reject', [VoidRequestController::class, 'reject']);
        });

        Route::middleware('permission:consumptions:create')->group(function () {
            Route::post('/consumptions', [ManualConsumptionController::class, 'store']);
        });
        Route::middleware('permission:consumptions:view')->group(function () {
            Route::get('/consumptions', [ManualConsumptionController::class, 'index']);
        });

        Route::get('/cash-closing', [CashClosingController::class, 'show'])
            ->middleware('permission:reports:view|cash:close');
        Route::post('/cash-closing', [CashClosingController::class, 'store'])
            ->middleware('permission:cash:close');

        Route::middleware('permission:reports:view')->group(function () {
            Route::get('/reports/daily', [ReportController::class, 'daily']);
            Route::get('/reports/receipts', [ReportController::class, 'receipts']);
            Route::get('/reports/items', [ReportController::class, 'items']);
            Route::get('/reports/stock', [ReportController::class, 'stock']);
            Route::get('/reports/waste', [ReportController::class, 'waste']);
            Route::get('/reports/stock-summary', [ReportController::class, 'stockSummary']);
            Route::get('/reports/ledger', [ReportController::class, 'ledger']);
        });

        Route::middleware('permission:employees:view')->group(function () {
            Route::get('/employees', [EmployeeController::class, 'index']);
        });
        Route::middleware('permission:employees:edit')->group(function () {
            Route::post('/employees', [EmployeeController::class, 'store']);
            Route::put('/employees/{employee}', [EmployeeController::class, 'update']);
            Route::put('/employees/{employee}/password', [EmployeeController::class, 'resetPassword']);
            Route::post('/employees/{employee}/role', [EmployeeController::class, 'updateRole']);
        });

        Route::middleware('permission:employees:edit')->prefix('permissions')->group(function () {
            Route::get('/', [PermissionController::class, 'index']);
            Route::put('/{role}', [PermissionController::class, 'update']);
        });
    });
});
