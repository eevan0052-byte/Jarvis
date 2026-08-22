package com.jarvis.fold4.voice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.jarvis.fold4.core.JarvisCore
import com.jarvis.fold4.core.Mode
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * VoiceEngine — platform SpeechRecognizer (on-device where the vendor ships
 * one; otherwise the vendor's recognizer service). Availability is probed
 * honestly: if SpeechRecognizer.isRecognitionAvailable is false, the UI
 * disables the mic and says so — nothing is faked.
 */
class VoiceEngine(private val context: Context) {

    fun available(): Boolean =
        SpeechRecognizer.isRecognitionAvailable(context) && hasMicFeature()

    private fun hasMicFeature() =
        context.packageManager.hasSystemFeature("android.hardware.microphone")

    /** One-shot listening session → final transcript or null. */
    suspend fun listen(timeoutMs: Long = 8000): String? =
        suspendCancellableCoroutine { cont ->
            val sr = SpeechRecognizer.createSpeechRecognizer(context)
            var done = false
            val finish: (String?) -> Unit = { text ->
                if (done) return@Unit
                done = true
                try { sr.destroy() } catch (_: Exception) {}
                JarvisCore.updateVoice { it.copy(listening = false) }
                JarvisCore.setMode(Mode.IDLE)
                if (cont.isActive) cont.resume(text)
            }

            sr.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {
                    // real speech level → drives the core waveform
                    val level = (rmsdB + 48f) / 48f
                    JarvisCore.updateVoice { it.copy(level = level.coerceIn(0f, 1f)) }
                }
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onError(error: Int) {
                    finish(null)
                }
                override fun onResults(results: Bundle?) {
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                    finish(text)
                }
                override fun onPartialResults(partialResults: Bundle?) {
                    val part = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                    if (part != null) JarvisCore.updateVoice { it.copy(interim = part) }
                }
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
            }

            JarvisCore.updateVoice { it.copy(listening = true, interim = "") }
            JarvisCore.setMode(Mode.LISTENING)
            try {
                sr.startListening(intent)
            } catch (e: Exception) {
                finish(null)
            }

            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                finish(null) // silence timeout
            }, timeoutMs)
        }

    fun stop() {
        JarvisCore.updateVoice { it.copy(listening = false) }
    }
}
