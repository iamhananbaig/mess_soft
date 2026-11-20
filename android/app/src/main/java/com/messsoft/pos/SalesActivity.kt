package com.messsoft.pos

import android.app.DatePickerDialog
import android.content.res.ColorStateList
import android.graphics.Paint
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
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

    private lateinit var state: StateView
    private lateinit var dateButton: TextView
    private lateinit var nextDay: ImageButton
    private lateinit var stats: LinearLayout
    private lateinit var filters: LinearLayout
    private lateinit var printButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!requireSession()) return
        setContentView(R.layout.activity_list)
        topBar(if (seesEveryone) "Sales" else "My sales")
        addTopAction(R.drawable.ic_refresh, "Refresh") { load() }
        state = StateView(window.decorView)
        dateButton = findViewById(R.id.date)
        nextDay = findViewById(R.id.nextDay)
        stats = findViewById(R.id.stats)
        filters = findViewById(R.id.filters)
        printButton = findViewById(R.id.bottomButton)

        findViewById<View>(R.id.dateBar).visibility = View.VISIBLE
        findViewById<View>(R.id.prevDay).setOnClickListener { shiftDay(-1) }
        nextDay.setOnClickListener { shiftDay(+1) }
        dateButton.setOnClickListener { pickDate() }
        if (!seesEveryone) cashierFilter = null // the API call is already limited to this user

        findViewById<View>(R.id.bottomBar).visibility = View.VISIBLE
        printButton.text = "Print day-end summary"
        printButton.setOnClickListener { printSummary() }

        findViewById<RecyclerView>(R.id.list).apply {
            layoutManager = LinearLayoutManager(this@SalesActivity)
            adapter = this@SalesActivity.adapter
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
        dateButton.text = if (isToday) "Today, ${Time.dayLong(day.time)}" else Time.dayLong(day.time)
        nextDay.isEnabled = !isToday
        nextDay.alpha = if (isToday) 0.3f else 1f
        adapter.submit(emptyList())
        stats.visibility = View.GONE
        state.loading("Loading sales…")
        loadJob?.cancel()
        loadJob = lifecycleScope.launch {
            try {
                all = fetch(Time.ymd(day.time))
                show()
            } catch (e: ApiException) {
                if (handleAuth(e)) return@launch
                state.error(e) { load() }
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
        stats.removeAllViews()
        stats.visibility = View.VISIBLE
        stats.addView(stat("Takings", rs(valid.sumOf { it.total }), R.color.text), lp(0, weight = 1.4f))
        stats.addView(stat("Sales", valid.size.toString(), R.color.text), lp(0, weight = 1f).apply { marginStart = dp(8) })
        stats.addView(stat(if (pendingCount > 0) "Voids · $pendingCount pending" else "Voids", voidedCount.toString(),
            if (pendingCount > 0) R.color.warning else R.color.text), lp(0, weight = 1.4f).apply { marginStart = dp(8) })
        when {
            sales.isNotEmpty() -> state.hide()
            isToday -> state.empty(R.drawable.ic_receipt_long, "No sales yet today", "Sales you make show up here.")
            else -> state.empty(R.drawable.ic_receipt_long, "No sales on this day", "Pick another day with the arrows or the date.")
        }
    }

    private fun stat(label: String, value: String, color: Int) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundResource(R.drawable.status_pill)
        setPadding(dp(12), dp(8), dp(12), dp(8))
        addView(text(label, 12f, if (color == R.color.warning) R.color.warning else R.color.muted, bold = true).apply { isSingleLine = true })
        addView(text(value, 18f, color, bold = true, money = true).apply { isSingleLine = true })
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

    // ── Day-end summary ──

    private fun printSummary() {
        printButton.isEnabled = false
        printButton.text = "Printing the summary…"
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
        val sheet = Sheet(this).title("Sale #${sale.id}",
            "${sale.time} · ${sale.paymentLabel}" + if (seesEveryone) " · ${sale.cashier}" else "")
        statusText(sale)?.let { (label, color, soft) ->
            val reason = sale.pendingRequest?.optString("reason")?.takeIf { it.isNotEmpty() }
            val box = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundResource(R.drawable.status_pill)
                backgroundTintList = ColorStateList.valueOf(getColor(soft))
                setPadding(dp(14), dp(10), dp(14), dp(10))
                addView(text(label, 15f, color, bold = true))
                (reason?.let { "Reason: $it" } ?: sale.rejectNote?.let { "Note: $it" })?.let { addView(text(it, 14f, color)) }
            }
            sheet.body.addView(box, lp().apply { bottomMargin = dp(12) })
        }
        for (line in sale.lines) {
            sheet.body.addView(row("${line.quantity} × ${line.name}", rs(line.quantity * line.unitPrice), bold = false))
        }
        sheet.body.addView(row("Total", rs(sale.total), bold = true).apply {
            setBackgroundResource(R.drawable.divider)
            setPadding(0, dp(12), 0, 0)
        }, lp().apply { topMargin = dp(8) })

        val request = sale.pendingRequest
        if (canApprove && request != null) {
            sheet.button("Review void request") {
                reviewVoid(
                    requestId = request.optInt("id"),
                    saleId = sale.id,
                    total = sale.total,
                    requester = request.optJSONObject("requester")?.optString("name").orEmpty(),
                    reason = request.optString("reason"),
                ) { load() }
            }
        }
        sheet.button("Reprint receipt", if (request == null || !canApprove) ButtonKind.PRIMARY else ButtonKind.SECONDARY) { reprint(sale.id) }
        if (session.can("sales:void-request") && !sale.voided && !sale.pendingVoid) {
            sheet.button("Request a void", ButtonKind.DANGER_QUIET) { requestVoid(sale) }
        }
        sheet.show()
    }

    private fun requestVoid(sale: Sale) {
        val sheet = Sheet(this).title("Void sale #${sale.id}?", "${rs(sale.total)} · a manager must approve it. Until then, the day's cash closing is on hold.")
        sheet.body.addView(label("Reason"))
        val reason = field("e.g. Customer cancelled the order",
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or InputType.TYPE_TEXT_FLAG_MULTI_LINE).apply {
            minLines = 2
            maxLines = 4
            gravity = Gravity.TOP
        }
        sheet.body.addView(reason)
        val submit = sheet.button("Send void request", ButtonKind.DANGER, keepOpen = true)
        sheet.button("Cancel", ButtonKind.SECONDARY) { hideKeyboard() }
        // Stays open until the reason is valid and the request succeeds.
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
                    sheet.dismiss()
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
        sheet.show()
        reason.requestFocus()
    }

    private fun row(left: String, right: String, bold: Boolean) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(0, dp(4), 0, dp(4))
        addView(text(left, 16f, bold = bold), lp(0, weight = 1f))
        addView(text(right, 16f, bold = bold, money = true).apply { setPadding(dp(12), 0, 0, 0) })
    }

    /** Status label, colour and tint, or null for a normal sale. */
    private fun statusText(sale: Sale): Triple<String, Int, Int>? = when {
        sale.voided -> Triple("Voided", R.color.danger, R.color.danger_soft)
        sale.pendingVoid -> Triple("Void pending approval", R.color.warning, R.color.warning_soft)
        sale.voidRejected -> Triple("Void rejected", R.color.muted, R.color.bg)
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
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_sale, parent, false).also { Fonts.apply(it) })

        override fun getItemCount() = sales.size

        override fun onBindViewHolder(h: Holder, position: Int) {
            val sale = sales[position]
            h.title.text = "#${sale.id}  ·  ${sale.time}"
            val items = sale.lines.joinToString(", ") { "${it.quantity}× ${it.name}" }
            h.items.text = (if (seesEveryone && cashierFilter == null) "${sale.cashier} · " else "") + "${sale.paymentLabel} · $items"
            h.amount.text = rs(sale.total)
            h.amount.paintFlags = if (sale.voided) h.amount.paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
                else h.amount.paintFlags and Paint.STRIKE_THRU_TEXT_FLAG.inv()
            h.amount.setTextColor(getColor(if (sale.voided) R.color.muted else R.color.text))
            val status = statusText(sale)
            h.status.visibility = if (status == null) View.GONE else View.VISIBLE
            status?.let { (label, color, soft) ->
                h.status.text = if (sale.pendingVoid) "Void pending" else label
                h.status.setTextColor(getColor(color))
                h.status.backgroundTintList = ColorStateList.valueOf(getColor(soft))
            }
            h.itemView.setOnClickListener { openSale(sale) }
        }
    }
}
