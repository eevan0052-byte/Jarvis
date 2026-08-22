package com.jarvis.fold4.context

/**
 * Neural Context Engine snapshot — the single structured view of the world
 * passed to every AI provider and used by predictive assistance.
 * Built by ContextEngine from: user prefs, device telemetry, environment
 * (time/weather/location/camera), conversation history and memory.
 */
data class ContextSnapshot(
    val time: String,
    val userName: String = "",
    val assistantName: String = "JARVIS",
    val responseStyle: String = "balanced",
    val online: Boolean = true,
    val providerCloudReady: Boolean = false,
    val units: String = "metric",

    // device
    val batteryPct: Int? = null,
    val charging: Boolean? = null,
    val storageUsedGb: Float? = null,
    val storageTotalGb: Float? = null,
    val ramMb: Long? = null,
    val networkType: String? = null,
    val folded: Boolean = false,
    val temperatureC: Float? = null,

    // environment
    val weatherCity: String? = null,
    val weatherTemp: Float? = null,
    val weatherCode: Int? = null,
    val weatherStale: Boolean = false,
    val locationLabel: String? = null,
    val cameraActive: Boolean = false,
    val cameraLabels: List<String> = emptyList(),
    val cameraText: String? = null,
    val cameraScene: String? = null,
    val facesVisible: Int = 0,
    val speakerStatus: String? = null,

    // memory / plans
    val memoryCount: Int = 0,
    val relevantMemories: List<String> = emptyList(),
    val reminders: List<String> = emptyList(),
    val routineNames: List<String> = emptyList(),

    val focusMode: Boolean = false,
    val history: List<String> = emptyList(),
) {
    val weatherSummary: String?
        get() = if (weatherTemp != null) "$weatherCity ${weatherTemp.toInt()}°C" else null
}
