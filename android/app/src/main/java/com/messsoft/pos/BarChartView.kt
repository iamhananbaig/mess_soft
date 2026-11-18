package com.messsoft.pos

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.MotionEvent
import android.view.View
import kotlin.math.max

/**
 * Single-series vertical bar chart: rounded data-ends on the baseline, a 2dp gap between
 * bars, a recessive baseline and one gridline at the top value. Tapping a bar selects it
 * and reports it through [onSelect] — the touch version of a hover tooltip.
 */
class BarChartView(context: Context) : View(context) {

    private var values = listOf<Float>()
    private var labels = listOf<String>()
    /** Every Nth x label is drawn so they never collide. */
    private var labelEvery = 1
    private var topLabel: (Float) -> String = { it.toInt().toString() }
    var selected = -1
        private set
    var onSelect: ((Int) -> Unit)? = null

    private val density = resources.displayMetrics.density
    private fun dp(v: Float) = v * density

    private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = context.getColor(R.color.primary) }
    private val dimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = context.getColor(R.color.primary_soft) }
    private val gridPaint = Paint().apply { color = context.getColor(R.color.border); strokeWidth = dp(1f) }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = context.getColor(R.color.muted)
        textSize = dp(11f)
    }
    private val path = Path()
    private val rect = RectF()

    fun setData(values: List<Float>, labels: List<String>, labelEvery: Int, topLabel: (Float) -> String) {
        this.values = values
        this.labels = labels
        this.labelEvery = max(1, labelEvery)
        this.topLabel = topLabel
        selected = -1
        invalidate()
    }

    fun select(index: Int) {
        selected = index
        invalidate()
        onSelect?.invoke(index)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), dp(170f).toInt())
    }

    private val left get() = dp(4f)
    private val plotTop get() = dp(18f)
    private val plotBottom get() = height - dp(20f)

    override fun onDraw(canvas: Canvas) {
        if (values.isEmpty()) return
        val maxValue = values.maxOrNull()?.takeIf { it > 0f } ?: 1f
        val plotH = plotBottom - plotTop
        val slot = (width - left * 2) / values.size
        val gap = dp(2f)
        val barW = max(dp(2f), slot - gap)
        val radius = minOf(dp(4f), barW / 2)

        // Top gridline with its value, then the baseline.
        canvas.drawLine(left, plotTop, width - left, plotTop, gridPaint.apply { alpha = 110 })
        textPaint.textAlign = Paint.Align.LEFT
        canvas.drawText(topLabel(maxValue), left, plotTop - dp(5f), textPaint)
        gridPaint.alpha = 255
        canvas.drawLine(left, plotBottom, width - left, plotBottom, gridPaint)

        values.forEachIndexed { i, v ->
            val x = left + i * slot + gap / 2
            if (v > 0f) {
                val h = max(dp(2f), v / maxValue * plotH)
                rect.set(x, plotBottom - h, x + barW, plotBottom)
                // Rounded at the data end only; square on the baseline.
                path.reset()
                path.addRoundRect(rect, floatArrayOf(radius, radius, radius, radius, 0f, 0f, 0f, 0f), Path.Direction.CW)
                canvas.drawPath(path, if (selected == -1 || selected == i) barPaint else dimPaint)
            }
            if (i % labelEvery == 0 || i == selected) {
                textPaint.textAlign = Paint.Align.CENTER
                textPaint.isFakeBoldText = i == selected
                canvas.drawText(labels.getOrElse(i) { "" }, x + barW / 2, height - dp(5f), textPaint)
                textPaint.isFakeBoldText = false
            }
        }
    }

    /** Tap selects a bar. Drags are left to the ScrollView, which cancels the gesture. */
    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (values.isEmpty()) return false
        return when (event.action) {
            MotionEvent.ACTION_DOWN -> true
            MotionEvent.ACTION_UP -> {
                val slot = (width - left * 2) / values.size
                select(((event.x - left) / slot).toInt().coerceIn(0, values.size - 1))
                true
            }
            else -> super.onTouchEvent(event)
        }
    }
}
