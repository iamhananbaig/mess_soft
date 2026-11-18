package com.messsoft.pos

import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

data class Category(val id: Int, val name: String)

data class MenuItem(val id: Int, val categoryId: Int, val name: String, val price: Int, val available: Boolean)

class CartLine(val item: MenuItem, var quantity: Int) {
    val amount: Int get() = item.price * quantity
}

data class PayMethod(val key: String, val label: String)

data class ReceiptItem(val name: String, val quantity: Int, val rate: Int, val amount: Int)

/** GET /sales/{id}/receipt */
data class ReceiptData(
    val canteenName: String,
    val date: String,
    val time: String,
    val receiptNumber: String,
    val cashier: String,
    val items: List<ReceiptItem>,
    val total: Int,
    val paymentMethod: String,
    val paymentReference: String?,
    val amountReceived: Int?,
    val change: Int?,
    val voided: Boolean,
) {
    companion object {
        fun from(j: JSONObject) = ReceiptData(
            canteenName = j.optString("canteen_name"),
            date = j.optString("date"),
            time = j.optString("time"),
            receiptNumber = j.optString("receipt_number"),
            cashier = j.optString("cashier"),
            items = j.optJSONArray("items").objects().map {
                ReceiptItem(it.optString("name"), it.optInt("quantity"), it.optInt("rate"), it.optInt("amount"))
            },
            total = j.optInt("total"),
            paymentMethod = j.optString("payment_method"),
            paymentReference = j.optStringOrNull("payment_reference"),
            amountReceived = if (j.isNull("amount_received")) null else j.optInt("amount_received"),
            change = if (j.isNull("change")) null else j.optInt("change"),
            voided = j.optBoolean("voided"),
        )
    }
}

/** GET /settings/receipt — the slip layout set on the web Settings page. Paper width is ignored: the V2 is 58mm. */
data class ReceiptSettings(
    val canteenName: String = "",
    val branchName: String = "",
    val showBranch: Boolean = false,
    val headerLines: String = "",
    val footerText: String = "Thank you for visiting!",
    val showCashier: Boolean = true,
    val showPayment: Boolean = true,
    val tearFeedLines: Int = 4,
    val sepAfterHeader: String = "=",
    val sepAfterCopy: String = "=",
    val sepItems: String = "-",
    val sepTotal: String = "=",
    val sepBeforeFooter: String = "none",
    val sepEnd: String = "=",
    val spaceBeforePayment: Int = 0,
    val spaceAfterPayment: Int = 0,
    val titleSize: String = "xlarge",
    val copyLabelSize: String = "xlarge",
    val totalSize: String = "xlarge",
    val showItemHeader: Boolean = true,
    val showReceiptNumber: Boolean = true,
    val showDatetime: Boolean = true,
    val showTearLine: Boolean = true,
    val customerCopyLabel: String = "CUSTOMER COPY",
    val accountsCopyLabel: String = "ACCOUNTS COPY",
) {
    companion object {
        fun from(j: JSONObject): ReceiptSettings {
            val d = ReceiptSettings()
            fun s(k: String, def: String) = if (j.has(k) && !j.isNull(k)) j.optString(k, def) else def
            fun b(k: String, def: Boolean) = if (j.has(k) && !j.isNull(k)) j.optBoolean(k, def) else def
            fun i(k: String, def: Int) = if (j.has(k) && !j.isNull(k)) j.optInt(k, def) else def
            return ReceiptSettings(
                canteenName = s("canteen_name", d.canteenName),
                branchName = s("branch_name", d.branchName),
                showBranch = b("show_branch", d.showBranch),
                headerLines = s("header_lines", d.headerLines),
                footerText = s("footer_text", d.footerText),
                showCashier = b("show_cashier", d.showCashier),
                showPayment = b("show_payment", d.showPayment),
                tearFeedLines = i("tear_feed_lines", d.tearFeedLines),
                sepAfterHeader = s("sep_after_header", d.sepAfterHeader),
                sepAfterCopy = s("sep_after_copy", d.sepAfterCopy),
                sepItems = s("sep_items", d.sepItems),
                sepTotal = s("sep_total", d.sepTotal),
                sepBeforeFooter = s("sep_before_footer", d.sepBeforeFooter),
                sepEnd = s("sep_end", d.sepEnd),
                spaceBeforePayment = i("space_before_payment", d.spaceBeforePayment),
                spaceAfterPayment = i("space_after_payment", d.spaceAfterPayment),
                titleSize = s("title_size", d.titleSize),
                copyLabelSize = s("copy_label_size", d.copyLabelSize),
                totalSize = s("total_size", d.totalSize),
                showItemHeader = b("show_item_header", d.showItemHeader),
                showReceiptNumber = b("show_receipt_number", d.showReceiptNumber),
                showDatetime = b("show_datetime", d.showDatetime),
                showTearLine = b("show_tear_line", d.showTearLine),
                customerCopyLabel = s("customer_copy_label", d.customerCopyLabel),
                accountsCopyLabel = s("accounts_copy_label", d.accountsCopyLabel),
            )
        }
    }
}

fun JSONArray?.objects(): List<JSONObject> =
    if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

fun JSONObject.optStringOrNull(key: String): String? =
    if (isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }

/** Integer PKR → "Rs.1,234" */
fun rs(amount: Int): String = "Rs." + String.format(Locale.US, "%,d", amount)
