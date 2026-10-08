package com.cykrome.drift.wallpaper

import android.content.Context
import android.content.SharedPreferences

/** The chosen wallpaper, shared between the app and the wallpaper service (same process). */
object WallpaperStore {
  private const val FILE = "drift.wallpaper"
  private const val KEY = "spec"

  fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  fun save(context: Context, json: String) {
    WallpaperSpec.parse(json) // reject a bad spec here rather than in the running wallpaper
    prefs(context).edit().putString(KEY, json).apply()
  }

  fun load(context: Context): WallpaperSpec? =
    prefs(context).getString(KEY, null)?.let { runCatching { WallpaperSpec.parse(it) }.getOrNull() }
}
