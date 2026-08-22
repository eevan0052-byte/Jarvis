package com.jarvis.fold4.util

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import kotlin.math.PI
import kotlin.math.sin

/**
 * Haptics + synthesized sounds. All sounds are generated PCM at runtime —
 * no audio assets, nothing copyrighted, all subtle by design.
 * Every effect is optional and disabled by a single setting.
 */
class Feedback(private val context: Context) {

    private val vibrator: Vibrator? by lazy {
        if (Build.VERSION.SDK_INT >= 31)
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        else @Suppress("DEPRECATION") context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    fun haptic(name: String, enabled: Boolean) {
        if (!enabled) return
        val pattern = when (name) {
            "listen" -> longArrayOf(0, 8)
            "recognized" -> longArrayOf(0, 10, 30, 14)
            "confirm" -> longArrayOf(0, 14)
            "error" -> longArrayOf(0, 30, 40, 30)
            "scanDone" -> longArrayOf(0, 12, 30, 12)
            else -> longArrayOf(0, 10)
        }
        try {
            if (Build.VERSION.SDK_INT >= 26) vibrator?.vibrate(VibrationEffect.createWaveform(pattern, -1))
            else @Suppress("DEPRECATION") vibrator?.vibrate(pattern, -1)
        } catch (_: Exception) {}
    }

    fun sound(name: String, enabled: Boolean, volume: Float = 0.55f) {
        if (!enabled) return
        val spec = when (name) {
            "listen" -> Tone(880f, 0.09f, 0.22f)
            "listenEnd" -> Tone(1320f, 0.08f, 0.18f)
            "recognized" -> Tone(660f, 0.10f, 0.20f)
            "confirm" -> Tone(587f, 0.12f, 0.22f)
            "alert" -> Tone(392f, 0.16f, 0.22f)
            "error" -> Tone(220f, 0.25f, 0.12f)
            "scan" -> Tone(500f, 0.50f, 0.06f)
            "scanDone" -> Tone(1200f, 0.10f, 0.16f)
            "notify" -> Tone(740f, 0.10f, 0.14f)
            "boot" -> Tone(120f, 0.90f, 0.30f)
            else -> Tone(600f, 0.10f, 0.16f)
        }
        playTone(spec, volume)
    }

    private data class Tone(val freq: Float, val durationSec: Float, val amplitude: Float)

    private fun playTone(t: Tone, volume: Float) {
        try {
            val sampleRate = 44100
            val n = (sampleRate * t.durationSec).toInt()
            val pcm = ShortArray(n)
            for (i in 0 until n) {
                val env = 1f - i.toFloat() / n
                pcm[i] = (sin(2 * PI * t.freq * i / sampleRate) * t.amplitude * env * volume * Short.MAX_VALUE).toInt().toShort()
            }
            val track = AudioTrack(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
                AudioFormat.Builder()
                    .setSampleRate(sampleRate)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
                n * 2, AudioTrack.MODE_STATIC, AudioManager.AUDIO_SESSION_ID_GENERATE,
            )
            track.write(pcm, 0, n)
            track.play()
            Handler(Looper.getMainLooper()).postDelayed({ track.release() }, (t.durationSec * 1000 + 120).toLong())
        } catch (_: Exception) {}
    }
}
