package com.jarvis.fold4.memory

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import java.util.UUID

/** Memory repository — the only gateway to the memory database. */
class MemoryRepository(private val db: MemoryDatabase) {

    private val dao = db.memoryDao()

    fun all(): Flow<List<MemoryEntity>> = dao.all()
    fun byCategory(cat: String): Flow<List<MemoryEntity>> = dao.byCategory(cat)

    suspend fun add(
        category: String,
        title: String,
        body: String = "",
        tags: List<String> = emptyList(),
        isPrivate: Boolean = false,
        dataJson: String? = null,
        pinned: Boolean = false,
    ): MemoryEntity {
        val e = MemoryEntity(
            id = UUID.randomUUID().toString(),
            category = category, title = title.ifBlank { body.take(48) },
            body = body, tags = tags.joinToString(","), isPrivate = isPrivate,
            pinned = pinned, dataJson = dataJson,
        )
        dao.insert(e)
        return e
    }

    suspend fun update(id: String, block: (MemoryEntity) -> MemoryEntity) {
        dao.get(id)?.let { dao.update(block(it).copy(updatedAt = System.currentTimeMillis())) }
    }

    suspend fun delete(id: String) = dao.delete(id)
    suspend fun deleteCategory(cat: String) = dao.deleteCategory(cat)
    suspend fun wipe() = dao.deleteAll()
    suspend fun count(): Int = dao.count()
    suspend fun search(q: String, limit: Int = 8): List<MemoryEntity> = dao.search(q, limit)

    suspend fun reminders(): List<MemoryEntity> = dao.byCategoryOnce("reminder")
    suspend fun routines(): List<MemoryEntity> = dao.byCategoryOnce("routine")
    suspend fun commands(): List<MemoryEntity> = dao.byCategoryOnce("command")
    suspend fun missions(): List<MemoryEntity> = dao.byCategoryOnce("mission")

    /* ── preferences ─────────────────────────────────────────────────────── */

    data class UserPrefs(
        val userName: String = "",
        val assistantName: String = "JARVIS",
        val responseStyle: String = "balanced",
        val units: String = "metric",
        val city: String = "",
        val lat: Double? = null,
        val lon: Double? = null,
        val providerId: String = "local",
        val fxQuality: String = "auto",
        val soundsEnabled: Boolean = true,
        val hapticsEnabled: Boolean = true,
        val reducedMotion: Boolean = false,
        val fontScale: Float = 1f,
        val highContrast: Boolean = false,
        val speakerIdEnabled: Boolean = true,
        val faceIdEnabled: Boolean = true,
        val wakeWordEnabled: Boolean = false,
        val onboardingDone: Boolean = false,
        val autoRunAuthorized: Boolean = false,
    )

    suspend fun preferences(): UserPrefs = UserPrefs(
        userName = pref("user.name") ?: "",
        assistantName = pref("assistant.name") ?: "JARVIS",
        responseStyle = pref("user.style") ?: "balanced",
        units = pref("units") ?: "metric",
        city = pref("weather.city") ?: "",
        lat = pref("weather.lat")?.toDoubleOrNull(),
        lon = pref("weather.lon")?.toDoubleOrNull(),
        providerId = pref("provider.id") ?: "local",
        fxQuality = pref("fx.quality") ?: "auto",
        soundsEnabled = pref("sounds.enabled")?.toBooleanStrictOrNull() ?: true,
        hapticsEnabled = pref("haptics.enabled")?.toBooleanStrictOrNull() ?: true,
        reducedMotion = pref("a11y.reducedMotion")?.toBooleanStrictOrNull() ?: false,
        fontScale = pref("a11y.fontScale")?.toFloatOrNull() ?: 1f,
        highContrast = pref("a11y.highContrast")?.toBooleanStrictOrNull() ?: false,
        speakerIdEnabled = pref("privacy.speakerId")?.toBooleanStrictOrNull() ?: true,
        faceIdEnabled = pref("privacy.faceId")?.toBooleanStrictOrNull() ?: true,
        wakeWordEnabled = pref("voice.wakeWord")?.toBooleanStrictOrNull() ?: false,
        onboardingDone = pref("onboarding.done")?.toBooleanStrictOrNull() ?: false,
        autoRunAuthorized = pref("automation.authorized")?.toBooleanStrictOrNull() ?: false,
    )

    suspend fun setPref(key: String, value: String) = dao.putPref(PrefEntity(key, value))
    private suspend fun pref(key: String): String? = dao.pref(key)

    suspend fun allOnce(): List<MemoryEntity> = all().first()
}
