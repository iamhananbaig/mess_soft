package com.messsoft.pos

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.json.JSONTokener
import java.io.IOException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import javax.net.ssl.SSLException

/** [status] is the HTTP status, or 0 when the server could not be reached. */
class ApiException(val status: Int, message: String) : Exception(message)

/** Minimal JSON client for /api/v1 (see API.md). Returns a JSONObject or JSONArray. */
class Api(private val session: Session) {

    suspend fun get(path: String): Any = request("GET", path, null)

    suspend fun post(path: String, body: JSONObject): Any = request("POST", path, body)

    suspend fun put(path: String, body: JSONObject): Any = request("PUT", path, body)

    private suspend fun request(method: String, path: String, body: JSONObject?): Any = withContext(Dispatchers.IO) {
        val conn: HttpURLConnection
        try {
            conn = URL(session.apiBase + path).openConnection() as HttpURLConnection
        } catch (e: Exception) {
            throw ApiException(0, "Invalid server address")
        }
        try {
            conn.requestMethod = method
            conn.connectTimeout = 10_000
            conn.readTimeout = 30_000
            conn.useCaches = false
            conn.setRequestProperty("Accept", "application/json")
            session.token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (code !in 200..299) throw ApiException(code, errorMessage(code, text))
            if (text.isBlank()) JSONObject() else JSONTokener(text).nextValue()
        } catch (e: SSLException) {
            throw ApiException(0, "Secure connection failed: ${e.message}")
        } catch (e: SocketTimeoutException) {
            throw ApiException(0, "The server took too long to answer. Try again.")
        } catch (e: IOException) {
            throw ApiException(0, "Can't reach the server. Check Wi-Fi / internet.")
        } finally {
            conn.disconnect()
        }
    }

    private fun errorMessage(code: Int, body: String): String {
        val json = runCatching { JSONObject(body) }.getOrNull()
        // Validation errors: show the first field message, it is the most specific.
        json?.optJSONObject("errors")?.let { errors ->
            val keys = errors.keys()
            if (keys.hasNext()) errors.optJSONArray(keys.next())?.optString(0)?.takeIf { it.isNotBlank() }?.let { return it }
        }
        json?.optString("message")?.takeIf { it.isNotBlank() }?.let { return it }
        return when (code) {
            401 -> "Signed out. Please sign in again."
            403 -> "You don't have permission for this."
            404 -> "Not found. Check the server address."
            429 -> "Too many attempts. Wait a minute and try again."
            in 500..599 -> "Server error ($code). Try again."
            else -> "Request failed ($code)"
        }
    }
}
