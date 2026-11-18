package com.messsoft.pos

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Self-update from this repo's GitHub Releases: the newest non-draft, non-prerelease
 * release tagged android-vX.Y[.Z] with an .apk asset. The APK must be signed with the
 * same key as the installed app, or Android refuses the update.
 */
object Updater {
    private const val REPO = "iamhananbaig/mess_soft"
    private const val TAG_PREFIX = "android-v"

    data class Release(
        val version: String,
        val notes: String,
        val apkUrl: String,
        val size: Long,
        /** Lower-case hex, from the asset's digest when GitHub provides it. */
        val sha256: String?,
    )

    fun installedVersion(context: Context): String =
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "0"

    /** 1.10 > 1.9; missing parts count as 0. */
    fun isNewer(candidate: String, current: String): Boolean {
        val a = candidate.split('.').map { it.toIntOrNull() ?: 0 }
        val b = current.split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    /** The newest published Android release, or null if there is none. */
    suspend fun latest(): Release? = withContext(Dispatchers.IO) {
        val conn = URL("https://api.github.com/repos/$REPO/releases?per_page=30").openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 10_000
            conn.readTimeout = 20_000
            conn.setRequestProperty("Accept", "application/vnd.github+json")
            conn.setRequestProperty("User-Agent", "mess-pos-android")
            if (conn.responseCode != 200) throw IOException("GitHub answered ${conn.responseCode}")
            val releases = JSONArray(conn.inputStream.bufferedReader().use { it.readText() })
            releases.objects()
                .filter { !it.optBoolean("draft") && !it.optBoolean("prerelease") && it.optString("tag_name").startsWith(TAG_PREFIX) }
                .mapNotNull { r ->
                    val apk = r.optJSONArray("assets").objects().firstOrNull { it.optString("name").endsWith(".apk") } ?: return@mapNotNull null
                    Release(
                        version = r.optString("tag_name").removePrefix(TAG_PREFIX),
                        // What's new only: the pipeline appends install notes after a "---" line.
                        notes = r.optString("body").substringBefore("\n---").trim(),
                        apkUrl = apk.optString("browser_download_url"),
                        size = apk.optLong("size"),
                        sha256 = apk.optString("digest").takeIf { it.startsWith("sha256:") }?.removePrefix("sha256:")?.lowercase(),
                    )
                }
                .reduceOrNull { best, r -> if (isNewer(r.version, best.version)) r else best }
        } finally {
            conn.disconnect()
        }
    }

    /** Downloads into the app's cache and checks size and checksum. [onProgress] gets 0–100. */
    suspend fun download(context: Context, release: Release, onProgress: (Int) -> Unit): File = withContext(Dispatchers.IO) {
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() } // only ever keep the one being installed
        val file = File(dir, "mess-pos-${release.version}.apk")

        // HttpURLConnection follows GitHub's https → https redirect to its download host.
        val conn = URL(release.apkUrl).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.setRequestProperty("User-Agent", "mess-pos-android")
            if (conn.responseCode != 200) throw IOException("Download failed (${conn.responseCode})")
            val total = conn.contentLengthLong.takeIf { it > 0 } ?: release.size
            val digest = MessageDigest.getInstance("SHA-256")
            var done = 0L
            var lastPercent = -1
            conn.inputStream.use { input ->
                file.outputStream().use { output ->
                    val buf = ByteArray(16 * 1024)
                    while (true) {
                        ensureActive()
                        val n = input.read(buf)
                        if (n < 0) break
                        output.write(buf, 0, n)
                        digest.update(buf, 0, n)
                        done += n
                        if (total > 0) {
                            val percent = (done * 100 / total).toInt()
                            if (percent != lastPercent) {
                                lastPercent = percent
                                withContext(Dispatchers.Main) { onProgress(percent) }
                            }
                        }
                    }
                }
            }
            if (release.size > 0 && done != release.size) throw IOException("Download incomplete. Try again.")
            val hex = digest.digest().joinToString("") { "%02x".format(it) }
            if (release.sha256 != null && hex != release.sha256) {
                file.delete()
                throw IOException("The download is damaged (checksum mismatch). Try again.")
            }
            file
        } catch (e: Exception) {
            file.delete()
            throw e
        } finally {
            conn.disconnect()
        }
    }

    /** Opens Android's installer for [apk]. */
    fun install(context: Context, apk: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", apk)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }
}
