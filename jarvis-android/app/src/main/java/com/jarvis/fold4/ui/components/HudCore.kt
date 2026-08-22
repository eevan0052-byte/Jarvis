package com.jarvis.fold4.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.Stroke
import com.jarvis.fold4.core.JarvisCore
import com.jarvis.fold4.core.Mode
import com.jarvis.fold4.ui.theme.JarvisColors
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/**
 * HUD AI Core — Compose Canvas renderer.
 * State-reactive: rings/particles/waveform/neural mesh parameters lerp toward
 * targets derived from the assistant Mode (IDLE/LISTENING/THINKING/SPEAKING/
 * VISION/PROCESSING/ALERT). 60 fps via infinite transitions — no allocation
 * churn, GPU-friendly draw primitives only.
 */
@Composable
fun HudCore(modifier: Modifier = Modifier, compact: Boolean = false) {
    val mode = JarvisCore.state.value.mode
    val voiceLevel = JarvisCore.state.value.voice.level

    val transition = rememberInfiniteTransition(label = "core")
    val rot by transition.animateFloat(
        initialValue = 0f, targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(14000, easing = LinearEasing), RepeatMode.Restart),
        label = "rot",
    )
    val pulse by transition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(2200, easing = LinearEasing), RepeatMode.Restart),
        label = "pulse",
    )

    val particles = remember { List(70) { Particle(Random.nextFloat() * 360f, 0.55f + Random.nextFloat(), Random.nextFloat() * 6.28f, 0.8f + Random.nextFloat() * 1.8f) } }

    Canvas(modifier.fillMaxSize()) {
        val cx = size.width / 2
        val cy = size.height / 2
        val base = (minOf(size.width, size.height) * if (compact) 0.30f else 0.16f)
        val energy = when (mode) {
            Mode.IDLE -> 0.25f
            Mode.LISTENING -> 1f + voiceLevel
            Mode.THINKING -> 1.3f
            Mode.PROCESSING -> 1.1f
            Mode.SPEAKING -> 0.9f + 0.3f * sin(pulse * 2 * PI.toFloat()).absoluteValue
            Mode.VISION -> 0.8f
            Mode.ALERT -> 0.7f
            Mode.BOOTING -> 1.6f
        }
        val ringScale = when (mode) {
            Mode.LISTENING -> 1.18f; Mode.VISION -> 1.3f; Mode.BOOTING -> 1.25f; else -> 1f
        }

        // ── rings ──
        val rings = listOf(
            Triple(1.00f, 0.62f, 1f),
            Triple(1.16f, 0.34f, -1.6f),
            Triple(1.34f, 0.80f, 0.7f),
        )
        rings.forEachIndexed { i, (rr, seg, dir) ->
            rotate(rot * dir * if (i == 1) 1f else 0.6f) {
                drawArc(
                    color = if (i == 1) JarvisColors.Blue.copy(alpha = 0.75f * (0.6f + 0.4f * energy))
                    else JarvisColors.Cyan.copy(alpha = 0.35f * (0.6f + 0.4f * energy)),
                    startAngle = 0f, sweepAngle = 360f * seg, useCenter = false,
                    topLeft = Offset(cx - base * rr * ringScale, cy - base * rr * ringScale),
                    size = Size(base * rr * ringScale * 2, base * rr * ringScale * 2),
                    style = Stroke(width = if (i == 1) 2.2f else 1.2f),
                )
                drawArc(
                    color = if (i == 1) JarvisColors.Blue.copy(alpha = 0.5f * (0.6f + 0.4f * energy))
                    else JarvisColors.Cyan.copy(alpha = 0.25f * (0.6f + 0.4f * energy)),
                    startAngle = 120f, sweepAngle = 360f * seg, useCenter = false,
                    topLeft = Offset(cx - base * rr * ringScale, cy - base * rr * ringScale),
                    size = Size(base * rr * ringScale * 2, base * rr * ringScale * 2),
                    style = Stroke(width = if (i == 1) 2.2f else 1.2f),
                )
                drawArc(
                    color = if (i == 1) JarvisColors.Blue.copy(alpha = 0.5f * (0.6f + 0.4f * energy))
                    else JarvisColors.Cyan.copy(alpha = 0.25f * (0.6f + 0.4f * energy)),
                    startAngle = 240f, sweepAngle = 360f * seg, useCenter = false,
                    topLeft = Offset(cx - base * rr * ringScale, cy - base * rr * ringScale),
                    size = Size(base * rr * ringScale * 2, base * rr * ringScale * 2),
                    style = Stroke(width = if (i == 1) 2.2f else 1.2f),
                )
            }
        }

        // ── waveform ring (listening) ──
        if (mode == Mode.LISTENING) {
            val r = base * 1.24f
            val pts = 48
            val path = android.graphics.Path()
            for (i in 0..pts) {
                val a = (i.toFloat() / pts) * (2 * PI).toFloat() - (PI / 2).toFloat()
                val v = voiceLevel * (0.5f + 0.5f * sin(i * 1.7f + pulse * 12f))
                val rr = r * (1f + v * 0.14f)
                val px = cx + cos(a) * rr
                val py = cy + sin(a) * rr
                if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
            }
            drawPath(path, JarvisColors.Cyan.copy(alpha = 0.9f), style = Stroke(width = 1.8f))
        }

        // ── nucleus ──
        val nr = base * 0.42f * (1f + 0.06f * sin(pulse * 2.1f * PI.toFloat()) * energy)
        drawCircle(
            brush = androidx.compose.ui.graphics.Brush.radialGradient(
                colors = listOf(
                    JarvisColors.Blue.copy(alpha = 0.55f + 0.25f * energy),
                    JarvisColors.Blue.copy(alpha = 0.28f),
                    Color.Transparent,
                ),
                radius = nr * 2.4f,
                center = Offset(cx, cy),
            ),
            radius = nr,
            center = Offset(cx, cy),
        )

        // inner rotating triangle
        rotate(rot * 1.4f) {
            val rr = nr * 0.62f
            val path = android.graphics.Path()
            for (i in 0..3) {
                val a = (i / 3f) * (2 * PI).toFloat()
                val px = cx + cos(a) * rr
                val py = cy + sin(a) * rr
                if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
            }
            drawPath(path, JarvisColors.BlueSoft.copy(alpha = 0.35f + 0.2f * energy), style = Stroke(width = 1.2f))
        }

        // ── particles ──
        particles.forEachIndexed { i, p ->
            val a = rot * 0.4f * (0.5f + p.dist) + i * 57.3f
            val rr = base * p.dist * (1f + energy * 0.10f) + sin(p.phase + pulse * 9f) * base * 0.03f * energy
            val px = cx + cos(a * PI.toFloat() / 180f) * rr
            val py = cy + sin(a * PI.toFloat() / 180f) * rr * 0.92f
            drawCircle(
                JarvisColors.BlueSoft.copy(alpha = (0.3f + 0.3f * energy) * (0.3f + (i % 4) * 0.08f)),
                radius = p.size * (0.8f + energy * 0.3f),
                center = Offset(px, py),
            )
        }

        // ── vision corner brackets ──
        if (mode == Mode.VISION) {
            val br = base * 1.9f
            val bl = base * 0.3f
            val corners = listOf(
                Offset(cx - br, cy - br) to Offset(1f, 1f),
                Offset(cx + br, cy - br) to Offset(-1f, 1f),
                Offset(cx - br, cy + br) to Offset(1f, -1f),
                Offset(cx + br, cy + br) to Offset(-1f, -1f),
            )
            corners.forEach { (o, s) ->
                drawLine(JarvisColors.Blue.copy(alpha = 0.75f), o, Offset(o.x + s.x * bl, o.y), strokeWidth = 1.6f)
                drawLine(JarvisColors.Blue.copy(alpha = 0.75f), o, Offset(o.x, o.y + s.y * bl), strokeWidth = 1.6f)
            }
        }
    }
}

private data class Particle(val angle: Float, val dist: Float, val phase: Float, val size: Float)
