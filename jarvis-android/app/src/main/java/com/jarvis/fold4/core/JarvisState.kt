package com.jarvis.fold4.core

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** Assistant state machine — single source of truth for the whole UI. */
enum class Mode {
    BOOTING, IDLE, LISTENING, THINKING, SPEAKING, VISION, PROCESSING, ALERT
}

data class VoiceState(
    val listening: Boolean = false,
    val speaking: Boolean = false,
    val level: Float = 0f,          // live mic RMS 0..1
    val interim: String = "",
)

data class VisionState(
    val active: Boolean = false,
    val modelReady: Boolean = false,
    val detections: List<Detection> = emptyList(),
    val faces: List<FaceBox> = emptyList(),
    val text: String? = null,
    val scene: SceneInfo? = null,
    val error: String? = null,
)

data class Detection(val label: String, val score: Float, val x: Float, val y: Float, val w: Float, val h: Float)
data class FaceBox(val x: Float, val y: Float, val w: Float, val h: Float, val landmarks: Int)
data class SceneInfo(val brightness: String, val colors: List<String>, val motion: Float)

data class DeviceState(
    val batteryPct: Int? = null,
    val charging: Boolean? = null,
    val storageUsedGb: Float? = null,
    val storageTotalGb: Float? = null,
    val ramMb: Long? = null,
    val networkType: String? = null,
    val online: Boolean = true,
    val folded: Boolean = false,
    val temperatureC: Float? = null,
)

data class JarvisState(
    val mode: Mode = Mode.BOOTING,
    val voice: VoiceState = VoiceState(),
    val vision: VisionState = VisionState(),
    val device: DeviceState = DeviceState(),
    val focusMode: Boolean = false,
    val providerId: String = "local",
    val memoryCount: Int = 0,
    val bootChecks: Map<String, String> = emptyMap(),
) {
    companion object {
        val Empty = JarvisState()
    }
}

object JarvisCore {
    private val _state = MutableStateFlow(JarvisState.Empty)
    val state: StateFlow<JarvisState> = _state.asStateFlow()

    fun setMode(mode: Mode) = _state.update { it.copy(mode = mode) }

    fun patch(block: (JarvisState) -> JarvisState) = _state.update(block)

    fun updateVoice(block: (VoiceState) -> VoiceState) =
        _state.update { it.copy(voice = block(it.voice)) }

    fun updateVision(block: (VisionState) -> VisionState) =
        _state.update { it.copy(vision = block(it.vision)) }

    fun updateDevice(block: (DeviceState) -> DeviceState) =
        _state.update { it.copy(device = block(it.device)) }
}
