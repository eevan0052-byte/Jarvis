package com.jarvis.fold4.voice

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.jarvis.fold4.core.JarvisCore
import com.jarvis.fold4.core.Mode
import java.util.Locale
import java.util.UUID

/**
 * TtsEngine — platform TextToSpeech. Interruptible: a new utterance cancels
 * the current one. Speaking state drives the core's SPEAKING animation.
 */
class TtsEngine(context: Context) {

    private var tts: TextToSpeech? = null
    private var ready = false

    init {
        tts = TextToSpeech(context.applicationContext) { status ->
            ready = status == TextToSpeech.SUCCESS
            tts?.language = Locale.getDefault()
        }
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                JarvisCore.setMode(Mode.SPEAKING)
                JarvisCore.updateVoice { it.copy(speaking = true) }
            }
            override fun onDone(utteranceId: String?) = finished()
            override fun onError(utteranceId: String?) = finished()
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?, errorCode: Int) = finished()
        })
    }

    private fun finished() {
        JarvisCore.updateVoice { it.copy(speaking = false) }
        if (JarvisCore.state.value.mode == Mode.SPEAKING) JarvisCore.setMode(Mode.IDLE)
    }

    fun available(): Boolean = ready

    /** Speak now, interrupting anything in progress. */
    fun speak(text: String, rate: Float = 1.02f, pitch: Float = 0.9f, volume: Float = 0.85f) {
        if (!ready || text.isBlank()) return
        tts?.let { t ->
            try {
                t.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle().apply {
                    putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume)
                }, UUID.randomUUID().toString())
            } catch (e: Exception) { /* engine hiccup — visual response still shown */ }
        }
    }

    fun stop() {
        tts?.stop()
        finished()
    }

    fun shutdown() {
        tts?.shutdown()
        tts = null
    }
}
