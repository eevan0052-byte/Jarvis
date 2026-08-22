package com.jarvis.fold4.automation

import com.jarvis.fold4.context.ContextSnapshot
import com.jarvis.fold4.core.JarvisCore
import com.jarvis.fold4.memory.MemoryEntity
import com.jarvis.fold4.memory.MemoryRepository
import org.json.JSONObject
import java.util.Calendar

/**
 * Automation Engine — safe, user-authored rules: IF condition → THEN
 * suggestion / notification / action. Consequential actions require explicit
 * confirmation unless the user enabled autoRun for that rule.
 * Rules are stored as MemoryEntity(category="routine") with a JSON payload.
 */
class AutomationEngine(private val memory: MemoryRepository) {

    data class Rule(
        val id: String,
        val name: String,
        val enabled: Boolean,
        val autoRun: Boolean,
        val whenType: String,          // time | battery | charging | network | interval
        val whenParams: Map<String, String>,
        val thenKind: String,          // suggest | notify | action
        val thenAction: String?,
        val thenMessage: String?,
        val lastFiredAt: Long,
    )

    suspend fun listRules(): List<Rule> = memory.routines().mapNotNull { fromEntity(it) }

    suspend fun save(rule: Rule) {
        val json = JSONObject()
            .put("when", JSONObject().put("type", rule.whenType).put("params", JSONObject(rule.whenParams)))
            .put("then", JSONObject().put("kind", rule.thenKind).put("action", rule.thenAction ?: "").put("message", rule.thenMessage ?: ""))
            .put("enabled", rule.enabled)
            .put("autoRun", rule.autoRun)
            .put("lastFiredAt", rule.lastFiredAt)
            .toString()
        memory.add(category = "routine", title = rule.name, body = describe(rule), dataJson = json)
    }

    suspend fun delete(id: String) = memory.delete(id)

    suspend fun toggle(id: String, enabled: Boolean) {
        memory.update(id) { e ->
            val r = fromEntity(e) ?: return@update e
            val json = JSONObject(e.dataJson ?: "{}").put("enabled", enabled)
            e.copy(dataJson = json.toString(), updatedAt = System.currentTimeMillis())
        }
    }

    suspend fun setAutoRun(id: String, autoRun: Boolean) {
        memory.update(id) { e ->
            val json = JSONObject(e.dataJson ?: "{}").put("autoRun", autoRun)
            e.copy(dataJson = json.toString(), updatedAt = System.currentTimeMillis())
        }
    }

    /** Evaluate all enabled rules against live state; throttle re-fires. */
    suspend fun evaluate(now: Long = System.currentTimeMillis()): List<Rule> {
        val fired = mutableListOf<Rule>()
        for (rule in listRules()) {
            if (!rule.enabled) continue
            if (now - rule.lastFiredAt < FIRE_THROTTLE_MS) continue
            if (match(rule)) fired += rule
        }
        return fired
    }

    private fun match(rule: Rule): Boolean {
        val dev = JarvisCore.state.value.device
        return when (rule.whenType) {
            "time" -> {
                val t = rule.whenParams["time"] ?: return false
                val parts = t.split(":").map { it.toIntOrNull() ?: return false }
                val cal = Calendar.getInstance()
                cal.get(Calendar.HOUR_OF_DAY) == parts[0] && cal.get(Calendar.MINUTE) == parts[1]
            }
            "battery" -> {
                val pct = dev.batteryPct ?: return false
                val level = rule.whenParams["level"]?.toIntOrNull() ?: return false
                if (rule.whenParams["op"] == "below") pct < level else pct > level
            }
            "charging" -> dev.charging == (rule.whenParams["state"] == "charging")
            "network" -> dev.online == (rule.whenParams["state"] == "online")
            else -> false
        }
    }

    suspend fun markFired(rule: Rule) {
        memory.update(rule.id) { e ->
            val json = JSONObject(e.dataJson ?: "{}").put("lastFiredAt", System.currentTimeMillis())
            e.copy(dataJson = json.toString(), updatedAt = System.currentTimeMillis())
        }
    }

    private fun fromEntity(e: MemoryEntity): Rule? {
        val json = try { JSONObject(e.dataJson ?: "{}") } catch (ex: Exception) { return null }
        val whenJson = json.optJSONObject("when") ?: return null
        val thenJson = json.optJSONObject("then") ?: return null
        val params = whenJson.optJSONObject("params") ?: JSONObject()
        return Rule(
            id = e.id,
            name = e.title,
            enabled = json.optBoolean("enabled", true),
            autoRun = json.optBoolean("autoRun", false),
            whenType = whenJson.optString("type"),
            whenParams = params.keys().asSequence().associateWith { params.optString(it) },
            thenKind = thenJson.optString("kind"),
            thenAction = thenJson.optString("action").ifBlank { null },
            thenMessage = thenJson.optString("message").ifBlank { null },
            lastFiredAt = json.optLong("lastFiredAt", 0),
        )
    }

    private fun describe(r: Rule): String {
        val w = when (r.whenType) {
            "time" -> "At ${r.whenParams["time"]}"
            "battery" -> "When battery ${r.whenParams["op"]} ${r.whenParams["level"]}%"
            "charging" -> "When ${r.whenParams["state"]}"
            "network" -> "When network becomes ${r.whenParams["state"]}"
            else -> "Manual"
        }
        return "IF $w → ${if (r.thenKind == "action") "run ${r.thenAction}" else "${r.thenKind}: ${r.thenMessage}"}"
    }

    companion object {
        const val FIRE_THROTTLE_MS = 5 * 60_000L

        const val ACTION_BATTERY_SAVER = "battery_saver"
        const val ACTION_FOCUS_START = "focus_start"
        const val ACTION_FOCUS_STOP = "focus_stop"
        const val ACTION_OPEN_VISION = "vision_open"
        const val ACTION_BRIEFING = "briefing"
        const val ACTION_MUTE_SOUNDS = "mute_sounds"

        /** Default templates shown in onboarding. */
        fun defaultTemplates(): List<Rule> = listOf(
            Rule("tpl-low-battery", "Low battery alert", true, true, "battery",
                mapOf("op" to "below", "level" to "20"), "action", ACTION_BATTERY_SAVER, "Enable Battery Saver", 0),
            Rule("tpl-evening", "Evening wind-down", true, false, "time",
                mapOf("time" to "22:30"), "suggest", null, "Time for your evening routine — mute sounds and dim the interface?", 0),
            Rule("tpl-online", "Back online", true, false, "network",
                mapOf("state" to "online"), "suggest", null, "Network restored. Cloud AI and weather are available again.", 0),
        )
    }

    /** Default templates shown in onboarding. */
    fun templates(): List<Rule> = defaultTemplates()

    /** Build a predictive suggestion from context (never executed silently). */
    fun predictions(ctx: ContextSnapshot): List<Prediction> {
        val out = mutableListOf<Prediction>()
        ctx.batteryPct?.let { pct ->
            if (ctx.charging == false && pct <= 20) {
                out += Prediction("battery-saver", "Battery at $pct%", "Enable Battery Saver?", ACTION_BATTERY_SAVER)
            }
        }
        if (!ctx.online) out += Prediction("offline", "Offline Intelligence Mode", "Cloud AI unavailable — local capabilities active.", null)
        if (ctx.reminders.isNotEmpty()) out += Prediction("reminders", "Reminders pending", "${ctx.reminders.first()}", "briefing")
        return out
    }

    data class Prediction(val id: String, val title: String, val body: String, val action: String?)
}
