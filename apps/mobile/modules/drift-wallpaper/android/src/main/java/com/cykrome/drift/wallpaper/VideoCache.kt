package com.cykrome.drift.wallpaper

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * The video a live wallpaper plays, kept on the phone: the wallpaper runs all day and through
 * restarts, so it plays a file, never a stream. One file per wallpaper, named by its URL; files
 * for other wallpapers are removed once a new one is in place.
 */
object VideoCache {
  private const val DIR = "wallpapers"

  private fun dir(context: Context) = File(context.filesDir, DIR).apply { mkdirs() }

  private fun nameFor(url: String): String {
    val hash = MessageDigest.getInstance("SHA-256").digest(url.toByteArray()).joinToString("") { "%02x".format(it) }
    return "${hash.take(32)}.mp4"
  }

  /** The local copy of [url], downloading it first if needed. Blocking: call off the main thread. */
  fun fetch(context: Context, url: String): File {
    require(url.startsWith("https://")) { "Only https wallpapers can be downloaded" }
    val dest = File(dir(context), nameFor(url))
    if (dest.exists() && dest.length() > 0) return dest
    val part = File(dest.path + ".part")
    val connection = URL(url).openConnection() as HttpURLConnection
    try {
      connection.connectTimeout = 15_000
      connection.readTimeout = 30_000
      connection.instanceFollowRedirects = true
      if (connection.responseCode !in 200..299) throw IllegalStateException("Download failed (${connection.responseCode})")
      connection.inputStream.use { input -> part.outputStream().use { input.copyTo(it) } }
      if (!part.renameTo(dest)) throw IllegalStateException("Could not save the wallpaper")
      return dest
    } catch (e: Exception) {
      part.delete()
      throw e
    } finally {
      connection.disconnect()
    }
  }

  /** Remove every cached video except [keep]. */
  fun prune(context: Context, keep: File?) {
    dir(context).listFiles()?.forEach { if (it != keep) it.delete() }
  }
}
