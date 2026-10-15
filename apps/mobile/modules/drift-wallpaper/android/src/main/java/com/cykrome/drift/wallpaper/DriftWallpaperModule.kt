package com.cykrome.drift.wallpaper

import android.app.WallpaperManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class DriftWallpaperModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun isActive(): Boolean =
    WallpaperManager.getInstance(context).wallpaperInfo?.component == ComponentName(context, DriftWallpaperService::class.java)

  override fun definition() = ModuleDefinition {
    Name("DriftWallpaper")

    Function("isActive") { isActive() }

    /**
     * Stores [spec] for the wallpaper service, after downloading its video if it has one. If Drift
     * is already the live wallpaper it switches immediately ("applied"); otherwise the system
     * preview opens and the user confirms ("picker"). Apps cannot set a live wallpaper
     * themselves, and the home/lock choice is made there.
     */
    AsyncFunction("setLiveWallpaper") { spec: String ->
      val json = JSONObject(spec)
      val video = WallpaperSpec.parse(spec).video
      // Runs on Expo's module queue, not the main thread, so the download may block here.
      val file = video?.let { VideoCache.fetch(context, it) }
      if (file != null) json.put("videoFile", file.absolutePath)
      WallpaperStore.save(context, json.toString())
      VideoCache.prune(context, file)
      if (isActive()) {
        "applied"
      } else {
        val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
        val preview = Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER)
          .putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, ComponentName(context, DriftWallpaperService::class.java))
        try {
          activity.startActivity(preview)
        } catch (_: ActivityNotFoundException) {
          // Some launchers only ship the generic chooser; Drift is listed there.
          activity.startActivity(Intent(WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER))
        }
        "picker"
      }
    }
  }
}
