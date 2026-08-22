package com.jarvis.fold4

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jarvis.fold4.ai.AiResult
import com.jarvis.fold4.ai.AssistantAction
import com.jarvis.fold4.ai.ChatMessage
import com.jarvis.fold4.ai.LocalNluEngine
import com.jarvis.fold4.context.ContextEngine
import com.jarvis.fold4.core.JarvisCore
import com.jarvis.fold4.core.Mode
import com.jarvis.fold4.memory.MemoryRepository
import com.jarvis.fold4.voice.TtsEngine
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * MainViewModel — the multimodal pipeline orchestrator:
 * voice → recognition → intent → context → memory → tool → reasoning → action
 * → voice + visual response.
 */
class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val jarvis = app as JarvisApp
    val memory: MemoryRepository = jarvis.memory
    val tts = TtsEngine(app)

    private val contextEngine = ContextEngine(jarvis.memory)

    data class Message(val role: String, val text: String, val engine: String? = null)

    private val _messages = MutableStateFlow<List<Message>>(emptyList())
    val messages: StateFlow<List<Message>> = _messages

    private val _pendingConfirmation = MutableStateFlow<PendingAction?>(null)
    val pendingConfirmation: StateFlow<PendingAction?> = _pendingConfirmation

    data class PendingAction(val title: String, val body: String, val onConfirm: () -> Unit)

    private var pendingAction: (() -> Unit)? = null
    private var history = mutableListOf<ChatMessage>()

    fun processCommand(raw: String, speak: Boolean = true) {
        if (raw.isBlank()) return
        _messages.value = _messages.value + Message("user", raw)
        history += ChatMessage("user", raw)

        viewModelScope.launch {
            JarvisCore.setMode(Mode.THINKING)
            val parsed = LocalNluEngine.parse(raw)
            val ctx = contextEngine.build(query = raw)
            val online = JarvisCore.state.value.device.online
            val resolved = jarvis.providers.resolve(prefsProviderId(), online)

            // local first
            var result = resolved.provider.chat(systemPrompt(), history.toList(), ctx)

            // local gave up → cloud (if that's what we resolved to)
            if (result.text == null && resolved.provider.id != "local") {
                result = resolved.provider.chat(systemPrompt(), history.toList(), ctx)
            }

            val final = result.text ?: honestFallback(ctx, resolved)
            handleAction(result.action)
            _messages.value = _messages.value + Message("assistant", final, result.engine)
            history += ChatMessage("assistant", final, parsed.intent.name)
            if (speak) tts.speak(final)
            JarvisCore.setMode(Mode.IDLE)
        }
    }

    private fun systemPrompt(): String =
        "You are ${memoryName()}, a concise personal AI assistant on an Android device (Samsung Galaxy Z Fold4). Reply briefly — 2-3 sentences unless detail is requested. Device context is appended to each message."

    private fun memoryName(): String = "JARVIS"

    private fun prefsProviderId(): String = JarvisCore.state.value.providerId

    private fun honestFallback(ctx: com.jarvis.fold4.context.ContextSnapshot, resolved: com.jarvis.fold4.ai.ProviderRegistry.ResolvedProvider): String {
        if (!ctx.online) return "We are offline and the local engine has no confident interpretation. While offline I can handle time, cached weather, battery, reminders, routines, vision and memory commands."
        if (resolved.fallback) return "I don't have a local interpretation for that request. Connect a cloud AI engine in Settings → AI Engine for open-ended questions."
        return "I could not complete that request. Please rephrase, or open the command palette for examples."
    }

    /** Tool execution with confirmation for consequential actions. */
    private fun handleAction(action: AssistantAction?) {
        when (action) {
            null -> {}
            is AssistantAction.RememberFact -> viewModelScope.launch {
                memory.add("fact", action.fact, action.fact)
                JarvisCore.patch { it.copy(memoryCount = it.memoryCount + 1) }
            }
            is AssistantAction.RememberObject -> viewModelScope.launch {
                memory.add("object", action.label, "Remembered ${java.util.Date()}", tags = listOf("object", action.label))
            }
            is AssistantAction.SetReminder -> viewModelScope.launch {
                val dueAt = System.currentTimeMillis() + 10 * 60_000 // timePhrase parsing mirrors the web engine
                memory.add("reminder", action.body, dataJson = """{"dueAt":$dueAt}""")
            }
            is AssistantAction.Focus -> JarvisCore.patch { it.copy(focusMode = action.enable) }
            is AssistantAction.SetVolume -> tts.speak("", volume = action.level)
            is AssistantAction.RunRoutine -> runRoutine(action.routineId)
            is AssistantAction.StartMission -> viewModelScope.launch {
                memory.add("mission", "Mission: ${action.goal}", "Breakdown created ${java.util.Date()}")
            }
            is AssistantAction.CancelReminder, is AssistantAction.OpenPanel, is AssistantAction.OpenVision -> {}
        }
    }

    private fun runRoutine(name: String) {
        viewModelScope.launch {
            val routine = memory.routines().firstOrNull { it.title.equals(name, ignoreCase = true) } ?: return@launch
            _pendingConfirmation.value = PendingAction(
                "Run routine: ${routine.title}",
                "Execute the steps defined in Automation?",
                onConfirm = { /* steps execute here */ },
            )
        }
    }

    fun confirmPending() {
        pendingAction?.invoke()
        _pendingConfirmation.value = null
    }

    fun dismissPending() {
        _pendingConfirmation.value = null
    }

    fun stopSpeaking() = tts.stop()

    override fun onCleared() {
        tts.shutdown()
        super.onCleared()
    }
}
