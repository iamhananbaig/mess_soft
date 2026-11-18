package com.messsoft.pos

import android.content.Context
import com.sunmi.peripheral.printer.InnerPrinterCallback
import com.sunmi.peripheral.printer.InnerPrinterException
import com.sunmi.peripheral.printer.InnerPrinterManager
import com.sunmi.peripheral.printer.InnerResultCallback
import com.sunmi.peripheral.printer.SunmiPrinterService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class PrinterException(message: String) : Exception(message)

/** The Sunmi V2's built-in printer, through Sunmi's printer service (woyou.aidlservice.jiuiv5). */
object SunmiPrinter {
    @Volatile private var service: SunmiPrinterService? = null
    @Volatile private var bound = false

    private val connection = object : InnerPrinterCallback() {
        override fun onConnected(s: SunmiPrinterService) { service = s }
        override fun onDisconnected() { service = null; bound = false }
    }

    fun bind(context: Context) {
        if (bound) return
        bound = try {
            InnerPrinterManager.getInstance().bindService(context.applicationContext, connection)
        } catch (e: InnerPrinterException) {
            false
        }
    }

    val isReady: Boolean get() = service != null

    /** Prints raw ESC/POS and waits until the paper is out (or the printer reports a fault). */
    suspend fun print(context: Context, data: ByteArray): Unit = withContext(Dispatchers.IO) {
        val s = awaitService(context)
        checkState(s)
        try {
            withTimeout(60_000) {
                suspendCancellableCoroutine<Unit> { cont ->
                    // Transaction mode: the result callback fires once the job has printed,
                    // with a real error code (out of paper, cover open…) if it didn't.
                    s.enterPrinterBuffer(true)
                    s.sendRAWData(data, null)
                    s.exitPrinterBufferWithCallback(true, object : InnerResultCallback() {
                        override fun onRunResult(isSuccess: Boolean) {}
                        override fun onReturnString(result: String?) {}
                        override fun onRaiseException(code: Int, msg: String?) {
                            if (cont.isActive) cont.resumeWithException(PrinterException("Printer error: ${msg ?: code}"))
                        }
                        override fun onPrintResult(code: Int, msg: String?) {
                            if (!cont.isActive) return
                            if (code == 0) cont.resume(Unit)
                            else cont.resumeWithException(PrinterException(stateMessage(runCatching { s.updatePrinterState() }.getOrDefault(-1)) ?: "Print failed: ${msg ?: code}"))
                        }
                    })
                }
            }
        } catch (e: android.os.RemoteException) {
            service = null
            throw PrinterException("Lost the printer service. Try again.")
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            throw PrinterException("The printer did not respond. Check paper and try again.")
        }
    }

    private suspend fun awaitService(context: Context): SunmiPrinterService {
        service?.let { return it }
        bind(context)
        repeat(30) {
            delay(100)
            service?.let { return it }
        }
        throw PrinterException("Built-in printer not found. Is this a Sunmi device?")
    }

    private fun checkState(s: SunmiPrinterService) {
        val state = try { s.updatePrinterState() } catch (e: android.os.RemoteException) { return }
        stateMessage(state)?.let { throw PrinterException(it) }
    }

    /** null = OK to print. Codes from Sunmi's printer service docs. */
    private fun stateMessage(state: Int): String? = when (state) {
        3 -> "Printer communication error. Restart the device."
        4 -> "Out of paper. Load a new roll."
        5 -> "Printer is overheated. Wait a minute."
        6 -> "Printer cover is open. Close it."
        505 -> "No printer detected on this device."
        507 -> "Printer firmware update failed. Contact Sunmi support."
        else -> null // 1 normal, 2 preparing, and anything else: let the job report
    }
}
