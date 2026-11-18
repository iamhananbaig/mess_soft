package com.messsoft.pos

import android.app.AlertDialog
import android.app.DatePickerDialog
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Bundle
import android.text.InputType
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.DividerItemDecoration
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.Calendar
import java.util.Date

/**
 * Sales for a day. Cashiers see their own; managers and admins (reports:view or
 * sales:void-approve) see everyone's and can filter by cashier and approve voids.
 * Reprint, request void and the day-end summary work on whatever is shown.
 */
class SalesActivity : BaseActivity() {

    private data class SaleLine(val name: String, val quantity: Int, val unitPrice: Int)

    private data class Sale(
        val id: Int,
        val total: Int,
        val paymentLabel: String,
        val time: String,
        val cashierId: Int,
        val cashier: String,
        val lines: List<SaleLine>,
        val voided: Boolean,
        val pendingVoid: Boolean,
        /** The pending request, when this user may review it. */
        val pendingRequest: JSONObject?,
        /** Latest void request was rejected (and nothing newer is pending). */
        val voidRejected: Boolean,
        val rejectNote: String?,
    )

    private val adapter = SalesAdapter()
    private var all = listOf<Sale>()
    private var day: Calendar = Calendar.getInstance(Time.KARACHI)
    /** null = all cashiers (managers only). */
    private var cashierFilter: Int? = null
    private var loadJob: Job? = null

    private val seesEveryone by lazy { session.can("reports:view") || session.can("sales:void-approve") }
    private val canApprove by lazy { session.can("sales:void-approve") }

    private lateinit var summary: TextView
    private lateinit var message: TextView
    private lateinit var dateButton: Button
    private lateinit var nextDay: Button
    private lateinit var filters: LinearLayout
    private lateinit var printButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!requireSession()) return
        setContentView(R.layout.activity_list)
        findViewById<TextView>(R.id.title).text = "Sales"
        summary = findViewById(R.id.summary)
        message = findViewById(R.id.message)
        dateButton = findViewById(R.id.date)
        nextDay = findViewById(R.id.nextDay)
        filters = findViewById(R.id.filters)
        printButton = findViewById(R.id.bottomButton)

        findViewById<Button>(R.id.back).setOnClickListener { finish() }
        findViewById<Button>(R.id.action).setOnClickListener { load() }
        message.setOnClickListener { load() }

        findViewById<View>(R.id.dateBar).visibility = View.VISIBLE
        findViewById<Button>(R.id.prevDay).setOnClickListener { shiftDay(-1) }
        nextDay.setOnClickListener { shiftDay(+1) }
        dateButton.setOnClickListener { pickDate() }
        if (!seesEveryone) cashierFilter = null // the API call is already limited to this user

        findViewById<View>(R.id.bottomBar).visibility = View.VISIBLE
        printButton.text = "Print day-end summary"
        printButton.setOnClickListener { printSummary() }

        findViewById<RecyclerView>(R.id.list).apply {
            layoutManager = LinearLayoutManager(this@SalesActivity)
            adapter = this@SalesActivity.adapter
            addItemDecoration(DividerItemDecoration(this@SalesActivity, DividerItemDecoration.VERTICAL))
            itemAnimator = null
        }
        load()
    }

    // ── Date ──

    private val isToday get() = Time.ymd(day.time) == Time.ymd(Date())

    private fun shiftDay(delta: Int) {
        if (delta > 0 && isToday) return
        day.add(Calendar.DAY_OF_MONTH, delta)
        load()
    }

    private fun pickDate() {
        DatePickerDialog(this, { _, y, m, d ->
            day = Calendar.getInstance(Time.KARACHI).apply { set(y, m, d, 12, 0, 0) }
            load()
        }, day.get(Calendar.YEAR), day.get(Calendar.MONTH), day.get(Calendar.DAY_OF_MONTH)).apply {
            datePicker.maxDate = System.currentTimeMillis()
        }.show()
    }

    // ── Loading ──

    private fun load() {
        dateButton.text = if (isToday) "Today · ${Time.dayLong(day.time)}" else Time.dayLong(day.time)
        nextDay.isEnabled = !isToday
        nextDay.alpha = if (isToday) 0.3f else 1f
        showMessage("Loading…")
        loadJob?.cancel()
        loadJob = lifecycleScope.launch {
            try {
                all = fetch(Time.ymd(day.time))
                show()
            } catch (e: ApiException) {
                if (handleAuth(e)) return@launch
                summary.text = ""
                adapter.submit(emptyList())
                showMessage("${e.message}\n\nTap to try again.")
            }
        }
    }

    /** Every sale on [date] (all pages), newest first — this user's, or everyone's for managers. */
    private suspend fun fetch(date: String): List<Sale> = coroutineScope {
        if (session.userId == 0) {
            session.userId = (api.get("/me") as JSONObject).optInt("id")
        }
        val pendingReq = async {
            if (canApprove) runCatching { api.get("/void-requests?status=pending&per_page=100") as JSONObject }.getOrNull() else null
        }
        // Only needed to show rejected requests; the sales list already flags pending ones.
        val recentReq = async {
            if (session.can("sales:void-request") || canApprove)
                runCatching { api.get("/void-requests?per_page=100") as JSONObject }.getOrNull()
            else null
        }
        val userParam = if (seesEveryone) "" else "&user_id=${session.userId}"
        val rows = mutableListOf<JSONObject>()
        var page = 1
        do {
            val json = api.get("/sales?from=$date&to=$date$userParam&per_page=100&page=$page") as JSONObject
            rows += json.optJSONArray("data").objects()
            val last = json.optInt("last_page", 1)
            page++
        } while (page <= last && page <= 50)

        val pending = pendingReq.await()?.optJSONArray("data").objects().associateBy { it.optInt("sale_id") }
        val latest = HashMap<Int, JSONObject>()
        // Newest first, so the first request seen for a sale is its latest.
        recentReq.await()?.optJSONArray("data").objects().forEach { latest.putIfAbsent(it.optInt("sale_id"), it) }
        rows.map { j -> parseSale(j, pending[j.optInt("id")], latest[j.optInt("id")]) }
    }

    private fun parseSale(j: JSONObject, pendingRequest: JSONObject?, latestRequest: JSONObject?): Sale {
        val voided = !j.isNull("voided_at")
        val pending = j.optBoolean("has_pending_void")
        val rejected = !voided && !pending && latestRequest?.optString("status") == "rejected"
        val user = j.optJSONObject("user")
        return Sale(
            id = j.optInt("id"),
            total = j.optInt("total_amount"),
            paymentLabel = j.optString("payment_method").let { AppState.paymentLabels[it] ?: it.replaceFirstChar { c -> c.uppercase() } },
            time = Time.clock(j.optString("created_at")),
            cashierId = j.optInt("user_id"),
            cashier = user?.optString("name").orEmpty(),
            lines = j.optJSONArray("items").objects().map {
                SaleLine(it.optJSONObject("menu_item")?.optString("name") ?: "Item", it.optInt("quantity"), it.optInt("unit_price"))
            },
            voided = voided,
            pendingVoid = pending,
            pendingRequest = if (pending) pendingRequest else null,
            voidRejected = rejected,
            rejectNote = if (rejected) latestRequest?.optStringOrNull("review_note") else null,
        )
    }

    private val shown get() = cashierFilter?.let { id -> all.filter { it.cashierId == id } } ?: all

    private fun show() {
        buildCashierChips()
        val sales = shown
        adapter.submit(sales)
        val valid = sales.filter { !it.voided }
        val voidedCount = sales.size - valid.size
        val pendingCount = sales.count { it.pendingVoid }
        summary.text = buildString {
            append("${valid.size} sale${if (valid.size == 1) "" else "s"} · ${rs(valid.sumOf { it.total })}")
            if (voidedCount > 0) append(" · $voidedCount voided")
            if (pendingCount > 0) append(" · $pendingCount pending")
        }
        if (sales.isEmpty()) showMessage("No sales on this day.") else message.visibility = View.GONE
    }

    /** Managers: All + one chip per cashier who sold that day. */
    private fun buildCashierChips() {
        val scroll = findViewById<View>(R.id.filtersScroll)
        val cashiers = all.distinctBy { it.cashierId }.map { it.cashierId to it.cashier }.sortedBy { it.second.lowercase() }
        if (!seesEveryone || cashiers.isEmpty()) {
            scroll.visibility = View.GONE
            return
        }
        if (cashierFilter != null && cashiers.none { it.first == cashierFilter }) cashierFilter = null
        scroll.visibility = View.VISIBLE
        filters.removeAllViews()
        filters.addView(chip("All cashiers", cashierFilter == null) { cashierFilter = null; show() })
        for ((id, name) in cashiers) {
            filters.addView(chip(if (id == session.userId) "$name (me)" else name, cashierFilter == id) { cashierFilter = id; show() })
        }
    }

    private fun showMessage(text: String) {
        message.text = text
        message.visibility = View.VISIBLE
    }

    // ── Day-end summary ──

    private fun printSummary() {
        printButton.isEnabled = false
        printButton.text = "Printing summary…"
        val date = day.time
        lifecycleScope.launch {
            try {
                // Fresh data: the list on screen may be minutes old.
                all = fetch(Time.ymd(date))
                show()
                val oldestFirst = shown.reversed()
                fun line(sale: Sale) = EscPos.SummaryLine(sale.id.toString().padStart(6, '0'), sale.time, sale.total)
                val cashier = when {
                    !seesEveryone -> session.userName
                    cashierFilter == null -> "All cashiers"
                    else -> all.firstOrNull { it.cashierId == cashierFilter }?.cashier.orEmpty()
                }
                val data = EscPos.DaySummary(
                    date = Time.day(date),
                    cashier = cashier,
                    printedAt = Time.dayTime(Date()),
                    sales = oldestFirst.filter { !it.voided }.map(::line),
                    voids = oldestFirst.filter { it.voided }.map(::line),
                    pendingVoids = oldestFirst.filter { it.pendingVoid }.map(::line),
                )
                SunmiPrinter.print(this@SalesActivity, EscPos.daySummary(data, AppState.receiptSettings))
                toast(if (data.pendingVoids.isEmpty()) "Day-end summary printed" else "Summary printed — ${data.pendingVoids.size} void request(s) still pending")
            } catch (e: ApiException) {
                if (handleAuth(e)) return@launch
                showError("Summary not printed", e.message)
            } catch (e: PrinterException) {
                showError("Print failed", e.message)
            } finally {
                printButton.isEnabled = true
                printButton.text = "Print day-end summary"
            }
        }
    }

    // ── Sale details ──

    private fun openSale(sale: Sale) {
        val box = dialogBox()
        box.addView(TextView(this).apply {
            text = "Sale #${sale.id}"
            textSize = 20f
            setTypeface(typeface, Typeface.BOLD)
        })
        box.addView(TextView(this).apply {
            text = "${sale.time} · ${sale.paymentLabel}" + if (seesEveryone) " · ${sale.cashier}" else ""
            textSize = 15f
            setTextColor(getColor(R.color.muted))
            setPadding(0, dp(2), 0, dp(10))
        })
        for (line in sale.lines) {
            box.addView(row("${line.quantity} × ${line.name}", rs(line.quantity * line.unitPrice), bold = false))
        }
        box.addView(row("Total", rs(sale.total), bold = true).apply { setPadding(0, dp(8), 0, 0) })
        statusText(sale)?.let { (label, color) ->
            val reason = sale.pendingRequest?.optString("reason")?.takeIf { it.isNotEmpty() }
            box.addView(TextView(this).apply {
                text = label + (reason?.let { "\nReason: $it" } ?: "") + (sale.rejectNote?.let { "\nNote: $it" } ?: "")
                textSize = 15f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(getColor(color))
                setPadding(0, dp(10), 0, 0)
            })
        }

        val dialog = AlertDialog.Builder(this).setView(box).create()
        val request = sale.pendingRequest
        if (canApprove && request != null) {
            addDialogButton(box, dialog, "Approve / reject void", primary = true) {
                reviewVoid(
                    requestId = request.optInt("id"),
                    saleId = sale.id,
                    total = sale.total,
                    requester = request.optJSONObject("requester")?.optString("name").orEmpty(),
                    reason = request.optString("reason"),
                ) { load() }
            }
        }
        addDialogButton(box, dialog, "Reprint", primary = request == null || !canApprove) {
            printAccountsThenAsk(sale.id, sale.total, null, reprint = true)
        }
        if (session.can("sales:void-request") && !sale.voided && !sale.pendingVoid) {
            addDialogButton(box, dialog, "Request void", primary = false) { requestVoid(sale) }
                .setTextColor(getColor(R.color.danger))
        }
        addDialogButton(box, dialog, "Close", primary = false) {}
        dialog.show()
    }

    private fun requestVoid(sale: Sale) {
        val box = dialogBox()
        box.addView(TextView(this).apply {
            text = "Void sale #${sale.id} (${rs(sale.total)})?"
            textSize = 18f
            setTypeface(typeface, Typeface.BOLD)
        })
        box.addView(TextView(this).apply {
            text = "A manager must approve it. Until then, that day's cash closing is on hold."
            textSize = 14f
            setTextColor(getColor(R.color.muted))
            setPadding(0, dp(6), 0, dp(10))
        })
        val reason = EditText(this).apply {
            hint = "Reason (required)"
            textSize = 16f
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            minLines = 2
            maxLines = 4
            filters = arrayOf(android.text.InputFilter.LengthFilter(255))
            setBackgroundResource(R.drawable.field)
            setPadding(dp(12), dp(10), dp(12), dp(10))
        }
        box.addView(reason, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        val dialog = AlertDialog.Builder(this).setView(box).create()
        val submit = addDialogButton(box, dialog, "Send void request", primary = true) {}
        addDialogButton(box, dialog, "Cancel", primary = false) { hideKeyboard() }
        // Replace the default dismiss-then-run: stay open until the reason is valid and the request succeeds.
        submit.setOnClickListener {
            val text = reason.text.toString().trim()
            if (text.isEmpty()) {
                reason.error = "Enter a reason"
                return@setOnClickListener
            }
            submit.isEnabled = false
            submit.text = "Sending…"
            lifecycleScope.launch {
                try {
                    api.post("/sales/${sale.id}/void-requests", JSONObject().put("reason", text))
                    hideKeyboard()
                    dialog.dismiss()
                    toast("Void requested for sale #${sale.id}")
                    load()
                } catch (e: ApiException) {
                    if (handleAuth(e)) return@launch
                    submit.isEnabled = true
                    submit.text = "Send void request"
                    showError("Void request not sent", e.message)
                }
            }
        }
        dialog.show()
        reason.requestFocus()
    }

    private fun row(left: String, right: String, bold: Boolean) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        val style = if (bold) Typeface.BOLD else Typeface.NORMAL
        addView(TextView(context).apply { text = left; textSize = 16f; setTypeface(typeface, style) },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addView(TextView(context).apply { text = right; textSize = 16f; setTypeface(typeface, style); setPadding(dp(12), 0, 0, 0) })
    }

    /** Status label and colour, or null for a normal sale. */
    private fun statusText(sale: Sale): Pair<String, Int>? = when {
        sale.voided -> "Voided" to R.color.danger
        sale.pendingVoid -> "Void pending approval" to R.color.warning
        sale.voidRejected -> "Void rejected" to R.color.muted
        else -> null
    }

    // ── List ──

    private inner class SalesAdapter : RecyclerView.Adapter<SalesAdapter.Holder>() {
        private var sales = listOf<Sale>()

        fun submit(list: List<Sale>) { sales = list; notifyDataSetChanged() }

        inner class Holder(v: View) : RecyclerView.ViewHolder(v) {
            val title: TextView = v.findViewById(R.id.title)
            val items: TextView = v.findViewById(R.id.items)
            val amount: TextView = v.findViewById(R.id.amount)
            val status: TextView = v.findViewById(R.id.status)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_sale, parent, false))

        override fun getItemCount() = sales.size

        override fun onBindViewHolder(h: Holder, position: Int) {
            val sale = sales[position]
            h.title.text = "#${sale.id} · ${sale.time} · ${sale.paymentLabel}"
            val items = sale.lines.joinToString(", ") { "${it.quantity}× ${it.name}" }
            h.items.text = if (seesEveryone && cashierFilter == null) "${sale.cashier} — $items" else items
            h.amount.text = rs(sale.total)
            h.amount.paintFlags = if (sale.voided) h.amount.paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
                else h.amount.paintFlags and Paint.STRIKE_THRU_TEXT_FLAG.inv()
            h.amount.setTextColor(getColor(if (sale.voided) R.color.muted else R.color.text))
            val status = statusText(sale)
            h.status.visibility = if (status == null) View.GONE else View.VISIBLE
            status?.let { (label, color) -> h.status.text = label; h.status.setTextColor(getColor(color)) }
            h.itemView.setOnClickListener { openSale(sale) }
        }
    }
}
