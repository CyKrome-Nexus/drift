package com.cykrome.drift.wallpaper

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import org.json.JSONObject
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

/** One colour field of the art, in percent of the (oversized) art frame. */
data class ArtLayer(val x: Float, val y: Float, val color: Int, val fade: Float, val circle: Boolean)

/** What the app hands the wallpaper: `nativeSpec()` in `src/lib/wallpaper.ts`, as JSON. */
data class WallpaperSpec(
  val name: String,
  val angle: Float,
  val from: Int,
  val to: Int,
  val layers: List<ArtLayer>,
  val overscanX: Float,
  val overscanY: Float,
  val driftMs: Long,
  val fps: Int,
  val pauseLowPower: Boolean,
) {
  companion object {
    fun parse(json: String): WallpaperSpec {
      val o = JSONObject(json)
      val base = o.getJSONObject("base")
      val layers = o.getJSONArray("layers")
      return WallpaperSpec(
        name = o.optString("name", "Drift"),
        angle = base.getDouble("angle").toFloat(),
        from = Color.parseColor(base.getString("from")),
        to = Color.parseColor(base.getString("to")),
        layers = (0 until layers.length()).map { i ->
          val l = layers.getJSONObject(i)
          ArtLayer(
            x = l.getDouble("x").toFloat(),
            y = l.getDouble("y").toFloat(),
            color = Color.parseColor(l.getString("color")),
            fade = l.getDouble("fade").toFloat(),
            circle = l.getString("shape") == "circle",
          )
        },
        overscanX = o.optDouble("overscanX", 1.0).toFloat(),
        overscanY = o.optDouble("overscanY", 1.0).toFloat(),
        driftMs = o.optLong("driftMs", 14000),
        fps = o.optInt("fps", 60).coerceIn(1, 120),
        pauseLowPower = o.optBoolean("pauseLowPower", true),
      )
    }
  }
}

/**
 * Paints the art exactly as the phone app's `Art` component does with SVG: a diagonal base and
 * three radial fields, drawn oversized and drifted across the screen and back.
 */
class ArtRenderer(private val spec: WallpaperSpec) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG)
  private var shaders: List<Shader> = emptyList()
  private var artW = 0f
  private var artH = 0f
  private var w = 0
  private var h = 0

  private fun build(width: Int, height: Int) {
    w = width
    h = height
    artW = width * spec.overscanX
    artH = height * spec.overscanY

    // Same geometry as the SVG linear gradient (objectBoundingBox units scaled to the frame).
    val rad = spec.angle * PI / 180
    val dx = (sin(rad) / 2).toFloat()
    val dy = (-cos(rad) / 2).toFloat()
    val base = LinearGradient(
      artW * (0.5f - dx), artH * (0.5f - dy), artW * (0.5f + dx), artH * (0.5f + dy),
      spec.from, spec.to, Shader.TileMode.CLAMP,
    )

    // Painted back to front, as the SVG does.
    val fields = spec.layers.reversed().map { l ->
      val cx = l.x / 100f * artW
      val cy = l.y / 100f * artH
      val fx = max(cx, artW - cx)
      val fy = max(cy, artH - cy)
      val rx: Float
      val ry: Float
      if (l.circle) {
        rx = hypot(fx, fy); ry = rx
      } else {
        rx = fx * sqrt(2f); ry = fy * sqrt(2f)
      }
      val clear = l.color and 0x00FFFFFF
      val g = RadialGradient(cx, cy, rx, intArrayOf(l.color, clear), floatArrayOf(0f, l.fade / 100f), Shader.TileMode.CLAMP)
      // Android's radial gradient is a circle; squash it into the ellipse around its centre.
      if (abs(rx - ry) > 0.5f) g.setLocalMatrix(Matrix().apply { setScale(1f, ry / rx, cx, cy) })
      g
    }
    shaders = listOf(base) + fields
  }

  /** Draws the frame at drift position [t] (0 = top left of the art showing, 1 = bottom right). */
  fun draw(canvas: Canvas, width: Int, height: Int, t: Float) {
    if (width != w || height != h || shaders.isEmpty()) build(width, height)
    canvas.save()
    canvas.translate(t * (width - artW), t * (height - artH))
    for (s in shaders) {
      paint.shader = s
      canvas.drawRect(0f, 0f, artW, artH, paint)
    }
    canvas.restore()
  }

  /** Drift position at [elapsedMs]: forward over `driftMs`, back over `driftMs`, eased like the app. */
  fun positionAt(elapsedMs: Long): Float {
    val cycle = spec.driftMs * 2
    val phase = (elapsedMs % cycle).toFloat() / spec.driftMs
    return easeInOut(if (phase <= 1f) phase else 2f - phase)
  }

  companion object {
    // React Native's `Easing.inOut(Easing.ease)`, where `ease` is cubic-bezier(0.42, 0, 1, 1).
    fun easeInOut(t: Float): Float = if (t < 0.5f) ease(t * 2) / 2 else 1 - ease((1 - t) * 2) / 2

    private fun ease(x: Float): Float {
      // Solve the bezier's x(s) = x for s, then return y(s).
      val x1 = 0.42f; val x2 = 1f; val y1 = 0f; val y2 = 1f
      fun bx(s: Float) = 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s
      fun by(s: Float) = 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s
      var lo = 0f; var hi = 1f; var s = x
      repeat(20) {
        if (bx(s) < x) lo = s else hi = s
        s = (lo + hi) / 2
      }
      return by(s)
    }
  }
}
