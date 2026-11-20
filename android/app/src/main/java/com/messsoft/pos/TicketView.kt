package com.messsoft.pos

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.util.AttributeSet
import android.widget.LinearLayout

/**
 * The running order at the bottom of the POS screen, drawn as a dark receipt stub with a
 * torn (zigzag) top edge — the one bold element on the screen.
 */
class TicketView(context: Context, attrs: AttributeSet?) : LinearLayout(context, attrs) {
    private val density = resources.displayMetrics.density
    private val tooth = 7f * density
    private val toothHeight = 5f * density
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = context.getColor(R.color.ink) }
    private val path = Path()

    init {
        setWillNotDraw(false)
        setPadding(paddingLeft, paddingTop + toothHeight.toInt(), paddingRight, paddingBottom)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        path.reset()
        path.moveTo(0f, toothHeight)
        var x = 0f
        while (x < w) {
            path.lineTo(x + tooth / 2, 0f)
            path.lineTo(x + tooth, toothHeight)
            x += tooth
        }
        path.lineTo(w.toFloat(), h.toFloat())
        path.lineTo(0f, h.toFloat())
        path.close()
    }

    override fun onDraw(canvas: Canvas) {
        canvas.drawPath(path, paint)
        super.onDraw(canvas)
    }
}
