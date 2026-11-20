package com.messsoft.pos

import android.content.res.ColorStateList
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.launch
import org.json.JSONObject

/** Pending void requests from any day, for users with sales:void-approve. */
class VoidsActivity : BaseActivity() {

    private val adapter = VoidsAdapter()
    private lateinit var state: StateView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!requireSession()) return
        if (!session.can("sales:void-approve")) { finish(); return }
        setContentView(R.layout.activity_list)
        topBar("Void requests")
        addTopAction(R.drawable.ic_refresh, "Refresh") { load() }
        state = StateView(window.decorView)
        findViewById<RecyclerView>(R.id.list).apply {
            layoutManager = LinearLayoutManager(this@VoidsActivity)
            adapter = this@VoidsActivity.adapter
            itemAnimator = null
        }
        load()
    }

    private fun load() {
        if (adapter.itemCount == 0) state.loading("Loading requests…") else busy(true)
        lifecycleScope.launch {
            try {
                val json = api.get("/void-requests?status=pending&per_page=100") as JSONObject
                val requests = json.optJSONArray("data").objects()
                adapter.submit(requests)
                val total = json.optInt("total", requests.size)
                busy(false)
                topSummary(if (total == 0) null else "$total waiting · ${rs(requests.sumOf { it.optJSONObject("sale")?.optInt("total_amount") ?: 0 })}")
                if (requests.isEmpty()) {
                    state.empty(R.drawable.ic_check, "All caught up", "Void requests from cashiers show up here for you to approve or reject.", "Refresh") { load() }
                } else {
                    state.hide()
                }
            } catch (e: ApiException) {
                busy(false)
                if (handleAuth(e)) return@launch
                adapter.submit(emptyList())
                state.error(e) { load() }
            }
        }
    }

    private inner class VoidsAdapter : RecyclerView.Adapter<VoidsAdapter.Holder>() {
        private var requests = listOf<JSONObject>()

        fun submit(list: List<JSONObject>) { requests = list; notifyDataSetChanged() }

        inner class Holder(v: View) : RecyclerView.ViewHolder(v) {
            val title: TextView = v.findViewById(R.id.title)
            val items: TextView = v.findViewById(R.id.items)
            val amount: TextView = v.findViewById(R.id.amount)
            val status: TextView = v.findViewById(R.id.status)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_sale, parent, false).also { Fonts.apply(it) })

        override fun getItemCount() = requests.size

        override fun onBindViewHolder(h: Holder, position: Int) {
            val r = requests[position]
            val sale = r.optJSONObject("sale")
            val saleId = r.optInt("sale_id")
            val total = sale?.optInt("total_amount") ?: 0
            val requester = r.optJSONObject("requester")?.optString("name").orEmpty()
            val saleTime = sale?.optString("created_at")?.let { Time.shortDayClock(it) }.orEmpty()
            val items = sale?.optJSONArray("items").objects().joinToString(", ") {
                "${it.optInt("quantity")}× ${it.optJSONObject("menu_item")?.optString("name") ?: "Item"}"
            }
            h.title.text = "#$saleId  ·  $saleTime"
            h.items.text = "$requester: “${r.optString("reason")}”\n$items"
            h.items.maxLines = 4
            h.amount.text = rs(total)
            h.status.text = "Review"
            h.status.setTextColor(getColor(R.color.warning))
            h.status.backgroundTintList = ColorStateList.valueOf(getColor(R.color.warning_soft))
            h.status.visibility = View.VISIBLE
            h.itemView.setOnClickListener {
                reviewVoid(r.optInt("id"), saleId, total, requester, r.optString("reason")) { load() }
            }
        }
    }
}
