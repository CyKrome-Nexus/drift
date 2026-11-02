package com.cykrome.drift.wallpaper

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.graphics.Canvas
import android.graphics.Color
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.service.wallpaper.WallpaperService
import android.view.SurfaceHolder

/**
 * Drift's live wallpaper. Reads the wallpaper the app last chose from [WallpaperStore] and plays
 * it until the user picks something else; picking another Drift wallpaper in the app swaps it in
 * place, with no trip through the system picker.
 *
 * A provider's wallpaper is a video file ([VideoCache]) played by a [MediaPlayer] straight onto
 * the wallpaper's surface: muted, looped, cropped to fill. Generated art is painted frame by
 * frame by [ArtRenderer]. The two never share the surface at once.
 */
class DriftWallpaperService : WallpaperService() {
  override fun onCreateEngine(): Engine = DriftEngine()

  inner class DriftEngine : Engine(), SharedPreferences.OnSharedPreferenceChangeListener {
    private val handler = Handler(Looper.getMainLooper())
    private val frame = Runnable { drawFrame() }
    private val prefs = WallpaperStore.prefs(this@DriftWallpaperService)
    private val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    private var spec: WallpaperSpec? = null
    private var renderer: ArtRenderer? = null
    private var player: MediaPlayer? = null
    private var playerFile: String? = null
    private var surfaceReady = false
    private var visible = false
    private var width = 0
    private var height = 0
    private val startedAt = SystemClock.uptimeMillis()
    private var lastT = 0f

    private val powerSaveChanged = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) = drawFrame()
    }

    override fun onCreate(surfaceHolder: SurfaceHolder) {
      super.onCreate(surfaceHolder)
      load()
      prefs.registerOnSharedPreferenceChangeListener(this)
      val filter = IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
      // System broadcasts still reach a non-exported receiver.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) registerReceiver(powerSaveChanged, filter, RECEIVER_NOT_EXPORTED)
      else registerReceiver(powerSaveChanged, filter)
    }

    override fun onDestroy() {
      handler.removeCallbacks(frame)
      releaseVideo()
      prefs.unregisterOnSharedPreferenceChangeListener(this)
      unregisterReceiver(powerSaveChanged)
      super.onDestroy()
    }

    override fun onVisibilityChanged(visible: Boolean) {
      this.visible = visible
      if (visible) drawFrame() else handler.removeCallbacks(frame)
      syncVideo()
    }

    override fun onSurfaceCreated(holder: SurfaceHolder) {
      super.onSurfaceCreated(holder)
      surfaceReady = true
      showCurrent()
    }

    override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
      super.onSurfaceChanged(holder, format, width, height)
      this.width = width
      this.height = height
      drawFrame()
    }

    override fun onSurfaceDestroyed(holder: SurfaceHolder) {
      visible = false
      surfaceReady = false
      handler.removeCallbacks(frame)
      releaseVideo()
      super.onSurfaceDestroyed(holder)
    }

    override fun onSharedPreferenceChanged(prefs: SharedPreferences, key: String?) {
      load()
      showCurrent()
    }

    private fun load() {
      spec = WallpaperStore.load(this@DriftWallpaperService)
      renderer = spec?.takeIf { it.videoFile == null }?.let { ArtRenderer(it) }
    }

    /** Video or art, whichever the current spec is. */
    private fun showCurrent() {
      val file = spec?.videoFile?.takeIf { java.io.File(it).exists() }
      if (file == null) {
        releaseVideo()
        drawFrame()
        return
      }
      if (file == playerFile && player != null) return syncVideo()
      handler.removeCallbacks(frame)
      releaseVideo()
      if (!surfaceReady) return
      try {
        val p = MediaPlayer()
        p.setSurface(surfaceHolder.surface)
        p.setDataSource(file)
        p.isLooping = true
        p.setVolume(0f, 0f)
        p.setOnPreparedListener {
          it.setVideoScalingMode(MediaPlayer.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING)
          syncVideo()
        }
        p.setOnErrorListener { _, _, _ ->
          // A file the phone can't decode: the tint, rather than a black screen.
          releaseVideo()
          renderer = spec?.let { ArtRenderer(it) }
          drawFrame()
          true
        }
        p.prepareAsync()
        player = p
        playerFile = file
      } catch (_: Exception) {
        releaseVideo()
      }
    }

    /** Play while the wallpaper is on screen, unless battery saver says otherwise. */
    private fun syncVideo() {
      val p = player ?: return
      val s = spec ?: return
      val pause = !visible || (s.pauseLowPower && power.isPowerSaveMode)
      try {
        if (pause && p.isPlaying) p.pause() else if (!pause && !p.isPlaying) p.start()
      } catch (_: IllegalStateException) {
        // Not prepared yet; the prepared listener calls back here.
      }
    }

    private fun releaseVideo() {
      player?.let {
        it.setOnErrorListener(null)
        it.release()
      }
      player = null
      playerFile = null
    }

    private fun drawFrame() {
      handler.removeCallbacks(frame)
      // A playing video owns the surface.
      if (player != null) return syncVideo()
      if (width == 0 || height == 0) return
      val started = SystemClock.uptimeMillis()
      val s = spec
      val r = renderer
      val paused = s == null || (s.pauseLowPower && power.isPowerSaveMode)
      if (r != null && !paused) lastT = r.positionAt(started - startedAt)

      val holder = surfaceHolder
      var canvas: Canvas? = null
      try {
        canvas = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) holder.lockHardwareCanvas() else holder.lockCanvas()
        if (canvas != null) {
          if (r != null) r.draw(canvas, width, height, lastT) else canvas.drawColor(NIGHT)
        }
      } catch (_: IllegalStateException) {
        // The surface went away between frames; the next visibility change redraws.
      } finally {
        if (canvas != null) holder.unlockCanvasAndPost(canvas)
      }

      if (visible && !paused && s != null) {
        val budget = 1000L / s.fps
        handler.postDelayed(frame, (budget - (SystemClock.uptimeMillis() - started)).coerceAtLeast(1))
      }
    }
  }

  companion object {
    /** Nocturne's background, shown before the app has chosen a wallpaper. */
    private val NIGHT = Color.parseColor("#161826")
  }
}
