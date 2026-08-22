package com.jarvis.fold4.context

import com.jarvis.fold4.core.JarvisCore
import com.jarvis.fold4.memory.MemoryRepository
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Neural Context Engine — fuses user / device / environment / conversational
 * context into ContextSnapshot and derives predictive suggestions.
 */
class ContextEngine(
    private val memory: MemoryRepository,
) {
    private val history = ArrayDeque<String>(MAX_HISTORY)

    fun pushConversation(turn: String) {
        history.addLast(turn)
        while (history.size > MAX_HISTORY) history.removeFirst()
    }

    suspend fun build(query: String = ""): ContextSnapshot {
        val st = JarvisCore.state.value
        val prefs = memory.preferences()

        val reminders = memory.reminders().map { it.title }
        val routines = memory.routines().map { it.title }

        return ContextSnapshot(
            time = SimpleDateFormat("HH:mm 'on' EEEE, MMMM d", Locale.getDefault()).format(Date()),
            userName = prefs.userName,
            assistantName = prefs.assistantName,
            responseStyle = prefs.responseStyle,
            online = st.device.online,
            providerCloudReady = st.providerId != "local" && st.device.online,
            units = prefs.units,
            batteryPct = st.device.batteryPct,
            charging = st.device.charging,
            storageUsedGb = st.device.storageUsedGb,
            storageTotalGb = st.device.storageTotalGb,
            ramMb = st.device.ramMb,
            networkType = st.device.networkType,
            folded = st.device.folded,
            temperatureC = st.device.temperatureC,
            cameraActive = st.vision.active,
            cameraLabels = st.vision.detections.map { it.label },
            cameraText = st.vision.text,
            cameraScene = st.vision.scene?.brightness,
            facesVisible = st.vision.faces.size,
            memoryCount = st.memoryCount,
            relevantMemories = if (query.isNotBlank()) memory.search(query, 5).map { it.body.ifBlank { it.title } } else emptyList(),
            reminders = reminders,
            routineNames = routines,
            focusMode = st.focusMode,
            history = history.toList(),
        )
    }

    companion object { private const val MAX_HISTORY = 24 }
}
