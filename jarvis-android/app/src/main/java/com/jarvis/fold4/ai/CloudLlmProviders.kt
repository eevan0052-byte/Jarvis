package com.jarvis.fold4.ai

import com.jarvis.fold4.context.ContextSnapshot
import com.jarvis.fold4.security.SecretStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Cloud provider adapters — OkHttp, TLS enforced, keys from the encrypted
 * SecretStore. The key NEVER appears in source, logs, or shared prefs.
 * If the key is missing or the network is down, the orchestrator falls back
 * to the local engine (see ProviderRegistry.resolve).
 */
object HttpClient {
    val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
    }
    val JSON = "application/json; charset=utf-8".toMediaType()

    suspend fun postJson(url: String, headers: Map<String, String>, body: JSONObject): String =
        withContext(Dispatchers.IO) {
            val b = Request.Builder()
                .url(url)
                .post(body.toString().toRequestBody(JSON))
            headers.forEach { (k, v) -> b.header(k, v) }
            client.newCall(b.build()).execute().use { resp ->
                val text = resp.body?.string() ?: ""
                if (!resp.isSuccessful) throw ProviderException("HTTP ${resp.code}: ${text.take(200)}")
                text
            }
        }
}

class ProviderException(message: String) : Exception(message)

/** OpenAI-compatible endpoints (OpenAI, OpenRouter, Groq, Ollama, LM Studio…). */
class OpenAICompatProvider(secretStore: SecretStore) : CloudAiProvider(secretStore, "openai", "OpenAI-compatible") {

    override suspend fun callApi(system: String, messages: List<ChatMessage>, context: ContextSnapshot): String {
        val cfg = secretStore.providerConfig("openai")
        val key = secretStore.getKey("openai") ?: throw ProviderException("No API key configured for this provider.")
        val base = (cfg["baseUrl"] ?: "https://api.openai.com/v1").trimEnd('/')
        val model = cfg["model"] ?: "gpt-4o-mini"

        val arr = JSONArray()
        arr.put(JSONObject().put("role", "system").put("content", system + contextBlock(context)))
        messages.forEach { arr.put(JSONObject().put("role", it.role).put("content", it.content)) }

        val body = JSONObject()
            .put("model", model)
            .put("max_tokens", 700)
            .put("messages", arr)

        val text = HttpClient.postJson(
            "$base/chat/completions",
            mapOf("Authorization" to "Bearer $key"),
            body,
        )
        return JSONObject(text).getJSONArray("choices")
            .optJSONObject(0)?.optJSONObject("message")?.optString("content")?.trim().orEmpty()
    }
}

class AnthropicProvider(secretStore: SecretStore) : CloudAiProvider(secretStore, "anthropic", "Anthropic Claude") {

    override suspend fun callApi(system: String, messages: List<ChatMessage>, context: ContextSnapshot): String {
        val cfg = secretStore.providerConfig("anthropic")
        val key = secretStore.getKey("anthropic") ?: throw ProviderException("No API key configured for this provider.")
        val model = cfg["model"] ?: "claude-3-5-haiku-latest"

        val arr = JSONArray()
        messages.forEach { arr.put(JSONObject().put("role", it.role).put("content", it.content)) }

        val body = JSONObject()
            .put("model", model)
            .put("max_tokens", 700)
            .put("system", system + contextBlock(context))
            .put("messages", arr)

        val text = HttpClient.postJson(
            "https://api.anthropic.com/v1/messages",
            mapOf(
                "x-api-key" to key,
                "anthropic-version" to "2023-06-01",
            ),
            body,
        )
        val content = JSONObject(text).optJSONArray("content") ?: return ""
        return (0 until content.length()).map { i -> content.optJSONObject(i)?.optString("text") ?: "" }
            .joinToString("").trim()
    }
}

class GeminiProvider(secretStore: SecretStore) : CloudAiProvider(secretStore, "gemini", "Google Gemini") {

    override suspend fun callApi(system: String, messages: List<ChatMessage>, context: ContextSnapshot): String {
        val cfg = secretStore.providerConfig("gemini")
        val key = secretStore.getKey("gemini") ?: throw ProviderException("No API key configured for this provider.")
        val model = cfg["model"] ?: "gemini-1.5-flash"

        val arr = JSONArray()
        messages.forEach {
            arr.put(JSONObject().put("role", if (it.role == "assistant") "model" else "user").put("parts", JSONArray().put(JSONObject().put("text", it.content))))
        }
        val body = JSONObject()
            .put("system_instruction", JSONObject().put("parts", JSONArray().put(JSONObject().put("text", system + contextBlock(context)))))
            .put("contents", arr)
            .put("generationConfig", JSONObject().put("maxOutputTokens", 700))

        val text = HttpClient.postJson(
            "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=${java.net.URLEncoder.encode(key, "UTF-8")}",
            emptyMap(),
            body,
        )
        val candidates = JSONObject(text).optJSONArray("candidates") ?: return ""
        val parts = candidates.optJSONObject(0)?.optJSONObject("content")?.optJSONArray("parts") ?: return ""
        return (0 until parts.length()).map { i -> parts.optJSONObject(i)?.optString("text") ?: "" }
            .joinToString("").trim()
    }
}
