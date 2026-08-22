package com.jarvis.fold4.ai

import com.jarvis.fold4.context.ContextSnapshot

/** Result of an AI turn: the text to say/show plus an optional tool action. */
data class AiResult(
    val text: String? = null,
    val action: AssistantAction? = null,
    val engine: String = "local",
)

/**
 * AssistantAction — the safe tool layer. Only these verbs exist; the UI and
 * automation layers enforce confirmation for consequential ones.
 */
sealed class AssistantAction {
    data class RememberFact(val fact: String) : AssistantAction()
    data class RememberObject(val label: String) : AssistantAction()
    data class SetReminder(val body: String, val timePhrase: String?) : AssistantAction()
    data class CancelReminder(val query: String) : AssistantAction()
    data class RunRoutine(val routineId: String) : AssistantAction()
    data class Focus(val enable: Boolean) : AssistantAction()
    data class OpenPanel(val panel: Panel) : AssistantAction()
    data object OpenVision : AssistantAction()
    data class SetVolume(val level: Float) : AssistantAction()
    data class StartMission(val goal: String) : AssistantAction()

    enum class Panel { MEMORY, SYSTEM, PRIVACY, SETTINGS, AUTOMATION, BRIEFING }
}

/**
 * Provider abstraction — the app never depends on a single vendor.
 * Cloud providers receive a ContextSnapshot built by the ContextEngine;
 * the local engine composes responses from the same snapshot.
 */
interface AiProvider {
    val id: String
    val label: String
    val kind: Kind
    val needsKey: Boolean

    /** True when the provider is usable (local: always; cloud: key present). */
    fun isConfigured(): Boolean

    suspend fun chat(system: String, messages: List<ChatMessage>, context: ContextSnapshot): AiResult

    enum class Kind { LOCAL, CLOUD }
}

data class ChatMessage(val role: String, val content: String, val intent: String? = null)
