package com.messsoft.pos

import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.roundToInt

/** Today's numbers, hourly and 30-day charts, payments, top items and stock alerts (GET /dashboard). */
class DashboardActivity : BaseActivity() {

    private lateinit var content: LinearLayout
    private lateinit var message: TextView
    private lateinit var summary: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!requireSession()) return
        if (!session.can("reports:view")) { finish(); return }
        setContentView(R.layout.activity_dashboard)
        content = findViewById(R.id.content)
        message = findViewById(R.id.message)
        summary = findViewById(R.id.summary)
        findViewById<Button>(R.id.back).setOnClickListener { finish() }
        findViewById<Button>(R.id.refresh).setOnClickListener { load() }
        message.setOnClickListener { load() }
        load()
    }

    override fun onRestart() {
        super.onRestart()
        load() // e.g. back from reviewing voids
    }

    private fun load() {
        if (content.childCount == 0) {
            message.text = "Loading…"
            message.visibility = View.VISIBLE
        }
        lifecycleScope.launch {
            try {
                val d = api.get("/dashboard") as JSONObject
                render(d)
                message.visibility = View.GONE
                summary.text = "Updated ${SimpleDateFormat("hh:mm a", Locale.US).apply { timeZone = Time.KARACHI }.format(Date())}"
            } catch (e: ApiException) {
                if (handleAuth(e)) return@launch
                message.text = "${e.message}\n\nTap to try again."
                message.visibility = View.VISIBLE
            }
        }
    }

    private fun render(d: JSONObject) {
        content.removeAllViews()
        val today = d.optJSONObject("today") ?: JSONObject()
        val yesterday = d.optJSONObject("yesterday") ?: JSONObject()

        // ── Headline tiles ──
        val revenue = today.optInt("revenue")
        val yRevenue = yesterday.optInt("revenue")
        val profit = today.optDouble("profit", 0.0)
        val margin = if (revenue > 0) (profit / revenue * 100).roundToInt() else null
        content.addView(tileRow(
            tile("Sales today", rs(revenue), change(revenue.toDouble(), yRevenue.toDouble(), "yesterday ${rs(yRevenue)}")),
            tile("Transactions", today.optInt("transactions").toString(), "Yesterday ${yesterday.optInt("transactions")}"),
        ))
        content.addView(tileRow(
            tile("Average ticket", rs(today.optInt("average_ticket")), "Yesterday ${rs(yesterday.optInt("average_ticket"))}"),
            tile("Profit today", rs(profit.roundToInt()), margin?.let { "Margin $it%" } ?: "No sales yet"),
        ))
        val voided = today.optInt("voided_count")
        if (voided > 0) content.addView(note("$voided sale${if (voided == 1) "" else "s"} voided today (not counted above)"))

        // ── Today by hour ──
        val hourly = d.optJSONArray("hourly").objects()
        if (hourly.isNotEmpty()) {
            val active = hourly.filter { it.optInt("revenue") > 0 }.map { it.optInt("hour") }
            val from = minOf(active.minOrNull() ?: 8, 8)
            val to = maxOf(active.maxOrNull() ?: 20, 20)
            val hours = hourly.filter { it.optInt("hour") in from..to }
            content.addView(chartCard(
                title = "Sales today by hour",
                headline = null,
                values = hours.map { it.optInt("revenue").toFloat() },
                labels = hours.map { hourLabel(it.optInt("hour")) },
                labelEvery = 3,
            ) { i ->
                val h = hours[i]
                val hour = h.optInt("hour")
                "${hourLabel(hour)}–${hourLabel((hour + 1) % 24)} · ${rs(h.optInt("revenue"))} · ${count(h.optInt("transactions"), "sale")}"
            })
        }

        // ── Last 30 days ──
        val trend = d.optJSONArray("trend").objects()
        if (trend.isNotEmpty()) {
            val total = trend.sumOf { it.optInt("revenue") }
            val days = trend.count { it.optInt("transactions") > 0 }
            content.addView(chartCard(
                title = "Sales, last 30 days",
                headline = "${rs(total)} · ${if (days > 0) "avg ${rs(total / days)} per trading day" else "no sales"}",
                values = trend.map { it.optInt("revenue").toFloat() },
                labels = trend.map { dayOfMonth(it.optString("date")) },
                labelEvery = 5,
            ) { i ->
                val t = trend[i]
                "${dayLabel(t.optString("date"))} · ${rs(t.optInt("revenue"))} · ${count(t.optInt("transactions"), "sale")} · profit ${rs(t.optDouble("profit", 0.0).roundToInt())}"
            })
        }

        // ── Payments today ──
        val payments = d.optJSONArray("payments").objects()
        content.addView(card("Payments today").apply {
            if (payments.isEmpty()) addView(muted("No sales yet today."))
            val max = payments.maxOfOrNull { it.optInt("amount") } ?: 0
            for (p in payments) {
                addView(meterRow(p.optString("label"), count(p.optInt("count"), "sale"), rs(p.optInt("amount")), p.optInt("amount"), max))
            }
        })

        // ── Top items ──
        val top = d.optJSONArray("top_items").objects()
        content.addView(card("Top items, last 7 days").apply {
            if (top.isEmpty()) addView(muted("No sales in the last 7 days."))
            val max = top.maxOfOrNull { it.optInt("revenue") } ?: 0
            top.forEachIndexed { i, t ->
                addView(meterRow("${i + 1}. ${t.optString("name")}", "${t.optInt("quantity")} sold", rs(t.optInt("revenue")), t.optInt("revenue"), max))
            }
        })

        // ── Alerts ──
        val alerts = d.optJSONObject("alerts") ?: JSONObject()
        content.addView(alertsCard(alerts))
    }

    // ── Alerts ──

    private fun alertsCard(a: JSONObject) = card("Needs attention").apply {
        val pending = a.optInt("pending_voids")
        val open = a.optInt("open_drawers")
        val low = a.optJSONArray("low_stock").objects()
        val expiring = a.optJSONArray("expiring").objects()

        addView(alertRow(
            if (pending > 0) Status.WARNING else Status.GOOD,
            "Void requests",
            if (pending > 0) "${count(pending, "request")} waiting" else "None pending",
            onClick = if (pending > 0 && session.can("sales:void-approve")) {
                { startActivity(Intent(this@DashboardActivity, VoidsActivity::class.java)) }
            } else null,
        ))
        addView(alertRow(
            if (open > 0) Status.WARNING else Status.GOOD,
            "Cash drawers",
            if (open > 0) "${count(open, "cashier")} not closed today" else "All closed",
        ))
        if (low.isEmpty()) {
            addView(alertRow(Status.GOOD, "Stock levels", "Nothing below reorder level"))
        } else {
            for (i in low) {
                addView(alertRow(Status.SERIOUS, i.optString("name"),
                    "${qty(i.optDouble("current_stock"))} ${i.optString("unit")} left · reorder at ${qty(i.optDouble("reorder_level"))}", tag = "LOW"))
            }
        }
        for (i in expiring) {
            val expired = i.optBoolean("expired")
            addView(alertRow(if (expired) Status.CRITICAL else Status.WARNING, i.optString("name"),
                "${qty(i.optDouble("current_stock"))} ${i.optString("unit")} · ${if (expired) "expired" else "expires"} ${dayLabel(i.optString("expiry_date"))}",
                tag = if (expired) "EXPIRED" else "EXPIRING"))
        }
        addView(TextView(context).apply {
            text = "Stock value: ${rs(a.optDouble("stock_value", 0.0).roundToInt())}"
            textSize = 14f
            setTextColor(getColor(R.color.muted))
            setPadding(0, dp(10), 0, 0)
        })
    }

    private enum class Status(val color: Int, val label: String) {
        GOOD(R.color.primary_dark, "OK"),
        WARNING(R.color.warning, "CHECK"),
        SERIOUS(R.color.warning, "LOW"),
        CRITICAL(R.color.danger, "ALERT"),
    }

    /** Status shown as a coloured word, never colour alone. */
    private fun alertRow(status: Status, title: String, detail: String, tag: String? = null, onClick: (() -> Unit)? = null) =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(8), 0, dp(8))
            addView(TextView(context).apply {
                text = tag ?: status.label
                textSize = 11f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(getColor(status.color))
                minWidth = dp(64)
            })
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                addView(TextView(context).apply { text = title; textSize = 15f; setTypeface(typeface, Typeface.BOLD) })
                addView(TextView(context).apply { text = detail; textSize = 13f; setTextColor(getColor(R.color.muted)) })
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            if (onClick != null) {
                addView(TextView(context).apply { text = "Review ›"; textSize = 14f; setTextColor(getColor(R.color.primary_dark)) })
                setBackgroundResource(android.R.drawable.list_selector_background)
                setOnClickListener { onClick() }
            }
        }

    // ── Building blocks ──

    private fun card(title: String) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundResource(R.drawable.card)
        setPadding(dp(14), dp(12), dp(14), dp(12))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) }
        addView(TextView(context).apply {
            text = title
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            setPadding(0, 0, 0, dp(6))
        })
    }

    private fun tileRow(a: View, b: View) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) }
        addView(a, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f).apply { marginEnd = dp(4) })
        addView(b, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f).apply { marginStart = dp(4) })
    }

    private fun tile(label: String, value: String, sub: String) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundResource(R.drawable.card)
        setPadding(dp(12), dp(10), dp(12), dp(10))
        addView(TextView(context).apply { text = label; textSize = 13f; setTextColor(getColor(R.color.muted)) })
        addView(TextView(context).apply { text = value; textSize = 22f; setTypeface(typeface, Typeface.BOLD) })
        addView(TextView(context).apply { text = sub; textSize = 12f; setTextColor(getColor(R.color.muted)) })
    }

    private fun chartCard(
        title: String,
        headline: String?,
        values: List<Float>,
        labels: List<String>,
        labelEvery: Int,
        describe: (Int) -> String,
    ) = card(title).apply {
        headline?.let { addView(muted(it)) }
        val caption = TextView(context).apply {
            text = "Tap a bar for details"
            textSize = 14f
            setTextColor(getColor(R.color.muted))
            setPadding(0, dp(6), 0, 0)
        }
        val chart = BarChartView(context).apply {
            setData(values, labels, labelEvery) { v -> if (v >= 1000) "Rs.${(v / 1000).let { if (it >= 10) it.roundToInt().toString() else "%.1f".format(Locale.US, it) }}k" else rs(v.roundToInt()) }
            onSelect = { i ->
                caption.text = describe(i)
                caption.setTextColor(getColor(R.color.text))
            }
        }
        addView(chart, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(6) })
        addView(caption)
    }

    /** Label + detail on the left, amount on the right, and a thin magnitude bar under them. */
    private fun meterRow(label: String, detail: String, amount: String, value: Int, max: Int) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, dp(6), 0, dp(6))
        addView(LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(TextView(context).apply { text = label; textSize = 15f }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(TextView(context).apply { text = detail; textSize = 13f; setTextColor(getColor(R.color.muted)); setPadding(dp(8), 0, dp(10), 0) })
            addView(TextView(context).apply { text = amount; textSize = 15f; setTypeface(typeface, Typeface.BOLD) })
        })
        addView(LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundResource(R.drawable.meter_track)
            val share = if (max > 0) value.toFloat() / max else 0f
            addView(View(context).apply { setBackgroundResource(R.drawable.meter_fill) },
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, share))
            addView(View(context), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f - share))
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(6)).apply { topMargin = dp(4) })
    }

    private fun muted(text: String) = TextView(this).apply {
        this.text = text
        textSize = 14f
        setTextColor(getColor(R.color.muted))
    }

    private fun note(text: String) = muted(text).apply { setPadding(dp(4), dp(8), dp(4), 0) }

    // ── Formatting ──

    /** "▲ 12% vs yesterday Rs.1,900"; plain "yesterday …" when there's nothing to compare. */
    private fun change(now: Double, before: Double, fallback: String): String {
        if (before <= 0.0) return fallback.replaceFirstChar { it.uppercase() }
        val pct = ((now - before) / before * 100).roundToInt()
        val arrow = if (pct > 0) "▲" else if (pct < 0) "▼" else "="
        return "$arrow ${abs(pct)}% vs $fallback"
    }

    private fun count(n: Int, noun: String) = "$n $noun${if (n == 1) "" else "s"}"

    private fun hourLabel(h: Int) = when {
        h == 0 -> "12a"
        h < 12 -> "${h}a"
        h == 12 -> "12p"
        else -> "${h - 12}p"
    }

    private fun parseDay(s: String): Date? = runCatching {
        SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.parse(s.take(10))
    }.getOrNull()

    private fun dayOfMonth(s: String) = parseDay(s)?.let { SimpleDateFormat("d", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(it) } ?: ""

    private fun dayLabel(s: String) = parseDay(s)?.let { SimpleDateFormat("EEE d MMM", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(it) } ?: s

    /** 2.50 → "2.5", 3.00 → "3" */
    private fun qty(v: Double) = if (v == Math.floor(v)) v.toLong().toString() else "%.2f".format(Locale.US, v).trimEnd('0').trimEnd('.')
}
