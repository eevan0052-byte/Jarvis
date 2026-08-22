package com.jarvis.fold4.ai

import com.jarvis.fold4.context.ContextSnapshot
import com.jarvis.fold4.security.SecretStore

/**
 * Registry + switching logic. Provider selection honors network state:
 * offline ⇒ the local engine is used with an honest fallback reason.
 * The app never hard-codes a vendor; each provider is a self-contained
 * adapter over OkHttp (TLS enforced) with keys from the encrypted SecretStore.
 */
class ProviderRegistry(
    private val secretStore: SecretStore,
) {
    private val local = LocalAiProvider()

    fun list(): List<AiProvider> = listOf(
        local,
        OpenAICompatProvider(secretStore),
        AnthropicProvider(secretStore),
        GeminiProvider(secretStore),
    )

    fun get(id: String): AiProvider = list().firstOrNull { it.id == id } ?: local

    /** Resolve the active provider with fallback metadata. */
    fun resolve(activeId: String, online: Boolean): ResolvedProvider {
        val wanted = get(activeId)
        return if (wanted.kind == AiProvider.Kind.CLOUD && (!online || !wanted.isConfigured())) {
            ResolvedProvider(local, fallback = true, reason = if (!online) "offline" else "not-configured")
        } else ResolvedProvider(wanted, fallback = false, reason = null)
    }

    data class ResolvedProvider(val provider: AiProvider, val fallback: Boolean, val reason: String?)
}

/**
 * LocalAiProvider — the on-device engine. Intent parsing is pure Kotlin
 * (see LocalNluEngine) and response composition reads the live context +
 * memory (see ResponseComposer). Fully offline; no model downloads; no
 * network calls ever.
 */
class LocalAiProvider : AiProvider {
    override val id = "local"
    override val label = "Local NLU Engine"
    override val kind = AiProvider.Kind.LOCAL
    override val needsKey = false
    override fun isConfigured() = true

    override suspend fun chat(system: String, messages: List<ChatMessage>, context: ContextSnapshot): AiResult {
        val userMsg = messages.lastOrNull { it.role == "user" } ?: return AiResult(text = "I'm listening.")
        val parsed = LocalNluEngine.parse(userMsg.content)
        return ResponseComposer.compose(parsed, context)
    }
}

/** Shared HTTP plumbing for cloud providers (OkHttp, TLS by default). */
abstract class CloudAiProvider(
    protected val secretStore: SecretStore,
    override val id: String,
    override val label: String,
) : AiProvider {
    override val kind = AiProvider.Kind.CLOUD
    override val needsKey = true
    override fun isConfigured() = secretStore.hasKey(id)

    override suspend fun chat(system: String, messages: List<ChatMessage>, context: ContextSnapshot): AiResult {
        val text = callApi(system, messages, context)
        return AiResult(text = text, engine = label)
    }

    protected abstract suspend fun callApi(system: String, messages: List<ChatMessage>, context: ContextSnapshot): String

    /** Context block appended to the system prompt — shared format. */
    protected fun contextBlock(ctx: ContextSnapshot): String {
        val b = StringBuilder("\n\n[DEVICE CONTEXT — JARVIS context engine]\n")
        b.append("Local time: ").append(ctx.time).append('\n')
        if (ctx.userName.isNotBlank()) b.append("User: ").append(ctx.userName).append('\n')
        ctx.batteryPct?.let { b.append("Battery: ").append(it).append('%').append(if (ctx.charging == true) " (charging)" else "").append('\n') }
        b.append("Network: ").append(if (ctx.online) "online" else "offline").append('\n')
        ctx.weatherSummary?.let { b.append("Weather: ").append(it).append('\n') }
        if (ctx.cameraLabels.isNotEmpty()) b.append("Camera detections: ").append(ctx.cameraLabels.take(8).joinToString()).append('\n')
        if (ctx.relevantMemories.isNotEmpty()) b.append("Relevant memories: ").append(ctx.relevantMemories.joinToString(" | ")).append('\n')
        return b.toString()
    }
}
