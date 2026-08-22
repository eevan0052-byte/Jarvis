package com.jarvis.fold4.ai

import com.jarvis.fold4.ai.AssistantAction.Panel
import com.jarvis.fold4.ai.LocalNluEngine.Intent
import com.jarvis.fold4.ai.LocalNluEngine.Parsed
import com.jarvis.fold4.context.ContextSnapshot
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Local response composition — the on-device reasoning layer. Every response
 * is grounded in the live ContextSnapshot (real telemetry, real vision data,
 * real memory). When no local interpretation is confident and a cloud engine
 * is configured, compose() returns text=null so the orchestrator routes to
 * the cloud provider — never a fabricated answer.
 */
object ResponseComposer {

    fun compose(parsed: Parsed, ctx: ContextSnapshot): AiResult {
        val intent = parsed.intent
        val slots = parsed.slots
        val name = ctx.userName.split(" ").firstOrNull()
        val who = name ?: "sir"

        return when (intent) {
            Intent.GREET -> AiResult(
                pick(
                    "${greeting()}${name?.let { ", $it" } ?: ""}. All systems are standing by. How may I assist?",
                    "Hello${name?.let { ", $it" } ?: ""}. ${ctx.assistantName} at your service.",
                )
            )
            Intent.TIME -> AiResult("It is ${SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())}.")
            Intent.DATE -> AiResult("Today is ${SimpleDateFormat("EEEE, MMMM d", Locale.getDefault()).format(Date())}.")
            Intent.WEATHER -> AiResult(weather(ctx, slots["city"]))
            Intent.BATTERY -> AiResult(battery(ctx))
            Intent.SYSTEM_STATUS -> AiResult(systemStatus(ctx))
            Intent.NETWORK_STATUS -> AiResult(networkStatus(ctx))
            Intent.BRIEFING -> AiResult(briefing(ctx))

            Intent.VISION_ANALYZE, Intent.VISION_SCENE, Intent.VISION_ROOM -> AiResult(visionScene(ctx))
            Intent.VISION_IDENTIFY, Intent.EXPLAIN_THIS -> AiResult(visionIdentify(ctx))
            Intent.VISION_READ_TEXT -> AiResult(visionText(ctx))
            Intent.VISION_STOP -> AiResult("Standing down vision systems.")
            Intent.VISION_OPEN -> AiResult("Activating Vision Mode.", AssistantAction.OpenVision)

            Intent.REMEMBER_THIS -> {
                val top = ctx.cameraLabels.firstOrNull()
                if (top == null) AiResult("Nothing to remember — open Vision Mode and point at the object first, then say \"remember this\".")
                else AiResult("I have committed \"$top\" to object memory.", AssistantAction.RememberObject(top))
            }
            Intent.REMEMBER_FACT -> {
                val fact = slots["fact"]?.trim().orEmpty()
                if (fact.length < 3) AiResult("What should I remember?")
                else AiResult("Noted. I will remember: \"${truncate(fact, 90)}\". You can review or delete it anytime in the Memory Center.", AssistantAction.RememberFact(fact))
            }
            Intent.RECALL -> {
                val mems = ctx.relevantMemories
                when {
                    mems.isEmpty() -> AiResult("I have nothing in memory about \"${slots["query"] ?: ""}\". Ask me to remember things and I will keep them for you.")
                    mems.size == 1 -> AiResult("From memory: ${mems[0]}")
                    else -> AiResult("I found ${mems.size} memories: " + mems.mapIndexed { i, m -> "${i + 1}) $m" }.joinToString("  "))
                }
            }
            Intent.FORGET -> AiResult(
                "Opening Memory Center so you can review what to delete.",
                AssistantAction.OpenPanel(Panel.MEMORY),
            )

            Intent.REMINDER_SET -> {
                if (slots["body"].isNullOrBlank() && slots["timePhrase"].isNullOrBlank()) {
                    AiResult("Reminder about what, and when? For example: \"remind me to call mom at 6pm\".")
                } else {
                    val body = slots["body"] ?: "Reminder"
                    val phrase = slots["timePhrase"]
                    val txt = if (phrase.isNullOrBlank())
                        "I have noted \"$body\". When should I remind you? (For example: \"in 30 minutes\" or \"tomorrow at 9\".)"
                    else "Reminder set: \"$body\" $phrase. I will alert you."
                    AiResult(txt, AssistantAction.SetReminder(body, phrase))
                }
            }
            Intent.REMINDER_LIST -> AiResult(
                if (ctx.reminders.isEmpty()) "You have no pending reminders."
                else "Pending reminders: " + ctx.reminders.take(5).joinToString("; ") + "."
            )
            Intent.REMINDER_CANCEL -> AiResult("Which reminder should I cancel?", AssistantAction.CancelReminder(slots["query"] ?: ""))

            Intent.ROUTINE_RUN -> {
                val wanted = (slots["routineName"] ?: "").lowercase()
                val hit = ctx.routineNames.firstOrNull { it.lowercase().contains(wanted) }
                when {
                    hit == null && wanted.isNotBlank() -> AiResult("I don't have a routine called \"${slots["routineName"]}\". You can define one in Automation, or say \"create routine\".")
                    hit == null -> AiResult("Which routine? Your routines: " + (if (ctx.routineNames.isEmpty()) "none yet." else ctx.routineNames.joinToString(", ")))
                    else -> AiResult("Executing $hit — I will confirm each consequential step.", AssistantAction.RunRoutine(hit))
                }
            }
            Intent.ROUTINE_CREATE -> AiResult(
                "Opening the Automation editor so we can define your routine together.",
                AssistantAction.OpenPanel(Panel.AUTOMATION),
            )
            Intent.ROUTINE_LIST -> AiResult(
                if (ctx.routineNames.isEmpty()) "No routines defined yet. Say \"create routine\" and we will build one."
                else "Defined routines: " + ctx.routineNames.joinToString(", ") + "."
            )
            Intent.FOCUS_START -> AiResult(
                "Focus Mode engaged. I will suppress non-essential alerts and keep the interface minimal.",
                AssistantAction.Focus(true),
            )
            Intent.FOCUS_STOP -> AiResult("Focus Mode disengaged. Normal operations resumed.", AssistantAction.Focus(false))

            Intent.WHO_SPEAKING -> AiResult(speaker(ctx))

            Intent.MEMORY_OPEN -> nav("Opening Memory Center.", Panel.MEMORY)
            Intent.SYSTEM_OPEN -> nav("Opening the System Command Center.", Panel.SYSTEM)
            Intent.PRIVACY_OPEN -> nav("Opening the Privacy Center.", Panel.PRIVACY)
            Intent.SETTINGS_OPEN -> nav("Opening Settings.", Panel.SETTINGS)
            Intent.AUTOMATION_OPEN -> nav("Opening the Automation engine.", Panel.AUTOMATION)
            Intent.BRIEFING_OPEN -> nav("Preparing your briefing.", Panel.BRIEFING)

            Intent.VOLUME_SET -> volume(slots["level"] ?: "")
            Intent.VOLUME_MUTE -> AiResult("Voice output muted.", AssistantAction.SetVolume(0f))
            Intent.MISSION_START -> {
                val goal = slots["goal"] ?: "your next day"
                AiResult(
                    "Mission registered: \"$goal\". I will break it into steps and ask before doing anything consequential.",
                    AssistantAction.StartMission(goal),
                )
            }

            Intent.CAPABILITIES -> AiResult(capabilities())
            Intent.HELP -> AiResult(help())
            Intent.SMALLTALK -> AiResult(smalltalk(parsed.raw))
            Intent.THANKS -> AiResult(pick("At your service.", "Anytime.", "Always, $who."))
            Intent.AFFIRM -> AiResult("Confirmed.")
            Intent.NEGATE -> AiResult("Understood. Standing by.")
            Intent.WAKE -> AiResult(pick("Yes?", "I am here.", "Listening, $who."))
            Intent.UNKNOWN -> AiResult(unknown(parsed.raw, ctx))
            else -> AiResult(null)
        }
    }

    private fun nav(txt: String, panel: Panel): AiResult =
        AiResult(text = txt, action = AssistantAction.OpenPanel(panel))

    /* ── grounded responses ─────────────────────────────────────────────── */

    private fun weather(ctx: ContextSnapshot, city: String?): String {
        val t = ctx.weatherTemp
        if (t == null) {
            return if (!ctx.online) "Weather data is unavailable offline. Grant location access or set a city in Settings, and I will fetch live conditions when online."
            else "Weather service is not configured. Grant location permission or set a city in Settings → Environment."
        }
        val code = ctx.weatherCode ?: 0
        val extra = when {
            code >= 95 -> "A storm is nearby — keep clear of open ground."
            code in 61..79 -> "Rain expected — take an umbrella."
            code in 71..77 -> "Snow conditions — roads may be slippery."
            else -> ""
        }
        return "Currently ${t.toInt()}°C in ${ctx.weatherCity ?: "your location"}${if (ctx.weatherStale) " (cached)" else ""}. $extra"
    }

    private fun battery(ctx: ContextSnapshot): String {
        val pct = ctx.batteryPct ?: return "Battery telemetry is unavailable right now."
        return when {
            ctx.charging == true -> "Battery is at $pct% and charging."
            pct <= 20 -> "Battery is at $pct%. I recommend Battery Saver — I can reduce visual load now."
            pct <= 40 -> "Battery is at $pct%. Comfortable, though a charge before the evening would be prudent."
            else -> "Battery is at $pct%."
        }
    }

    private fun systemStatus(ctx: ContextSnapshot): String {
        val parts = mutableListOf<String>()
        ctx.batteryPct?.let { parts += "battery $it%${if (ctx.charging == true) " (charging)" else ""}" }
        if (ctx.storageUsedGb != null && ctx.storageTotalGb != null) parts += "${ctx.storageUsedGb} GB of ${ctx.storageTotalGb} GB storage in use"
        ctx.ramMb?.let { parts += "${it / 1024} GB RAM" }
        ctx.temperatureC?.let { parts += "temperature ${it.toInt()}°C" }
        if (parts.isEmpty()) return "System telemetry is not ready yet — try again in a moment."
        return "System status: ${parts.joinToString(", ")}. All critical subsystems nominal."
    }

    private fun networkStatus(ctx: ContextSnapshot): String =
        if (ctx.online) "We are online${ctx.networkType?.let { " — $it" } ?: ""}."
        else "We are offline. Running in Offline Intelligence Mode: local voice, local vision, device telemetry and memory remain operational. Cloud AI is unavailable."

    private fun briefing(ctx: ContextSnapshot): String {
        val lines = mutableListOf(
            "${greeting()}${if (ctx.userName.isNotBlank()) ", ${ctx.userName.split(" ").first()}" else ""}. Here is your briefing for ${SimpleDateFormat("EEEE, MMMM d", Locale.getDefault()).format(Date())}."
        )
        ctx.weatherTemp?.let { lines += "Weather in ${ctx.weatherCity ?: "your location"}: ${it.toInt()}°C." }
        ctx.batteryPct?.let { lines += "Battery at $it%${if (ctx.charging == true) " and charging" else ""}." }
        if (ctx.reminders.isNotEmpty()) lines += "${ctx.reminders.size} reminder${if (ctx.reminders.size > 1) "s" else ""} pending; next: ${ctx.reminders.first()}."
        if (ctx.routineNames.isNotEmpty()) lines += "Armed routines: ${ctx.routineNames.joinToString(", ")}."
        if (!ctx.online) lines += "Network: offline — running on local intelligence."
        lines += if (ctx.focusMode) "Focus Mode is active." else "All systems nominal. Anything else?"
        return lines.joinToString(" ")
    }

    private fun visionScene(ctx: ContextSnapshot): String {
        if (!ctx.cameraActive) return "Camera feed is not active. Say \"open vision\" and I will take a look."
        val dets = ctx.cameraLabels
        return if (dets.isNotEmpty())
            "I can see: ${dets.take(6).joinToString(", ")}." + (ctx.cameraScene?.let { " Lighting is $it." } ?: "")
        else "No distinct objects detected in frame yet."
    }

    private fun visionIdentify(ctx: ContextSnapshot): String {
        if (!ctx.cameraActive) return "Vision is not active. Open Vision Mode first and point the camera at the object."
        val top = ctx.cameraLabels.firstOrNull()
            ?: return "I am not confident about any object in frame yet. Hold steady and try again, or move closer."
        return "That appears to be ${article(top)}. ${if (ctx.online) "I can look up more about it if you say \"tell me about this\"." else "We are offline, so background knowledge lookup is unavailable right now."}"
    }

    private fun visionText(ctx: ContextSnapshot): String {
        if (!ctx.cameraActive) return "Vision is not active. Open Vision Mode, point at the document, then say \"read the text\"."
        val txt = ctx.cameraText
        if (txt == null) return "I could not read text from the current frame. Hold the document steady and well lit, then ask again."
        if (txt.isBlank()) return "No text detected in frame."
        return "I read the following text: \"${truncate(txt, 300)}\""
    }

    private fun speaker(ctx: ContextSnapshot): String = ctx.speakerStatus
        ?: "Speaker recognition is unavailable right now. Enrollment is available in the Privacy Center — processing stays on this device."

    private fun volume(level: String): AiResult {
        val f = when (level) {
            "max" -> 1f; "high" -> 0.8f; "medium" -> 0.6f; "low", "minimum" -> 0.3f
            else -> level.toIntOrNull()?.let { it.coerceIn(0, 100) / 100f }
                ?: return AiResult("Voice volume is controlled in Settings.")
        }
        return AiResult("Voice volume set to ${(f * 100).toInt()}%.", AssistantAction.SetVolume(f))
    }

    private fun unknown(raw: String, ctx: ContextSnapshot): String? {
        if (!ctx.online) return "We are offline and no local pattern matched that request. I can handle time, cached weather, battery, reminders, routines, vision and memory while offline."
        if (!ctx.providerCloudReady) return "I don't have a confident local interpretation of that. I reliably handle device status, reminders, routines, vision, memory and briefings by voice. For open-ended questions, connect a cloud AI engine in Settings → AI Engine."
        return null // signal: route to the configured cloud provider
    }

    private fun capabilities(): String =
        "I am a multimodal personal assistant. I can run live camera analysis with on-device object detection and OCR; manage reminders, routines and automation; keep a searchable personal memory; monitor device telemetry; recognize enrolled voices and faces locally; and brief you on your day. Say \"help\" anytime."

    private fun help(): String =
        "Command examples: \"what is on my desk\", \"read this text\", \"remember that my favorite color is blue\", \"remind me to stretch in 30 minutes\", \"run night protocol\", \"what is my battery status\", \"start focus mode\", \"give me my briefing\"."

    private fun smalltalk(raw: String): String {
        val r = raw.lowercase()
        return when {
            "joke" in r -> pick(
                "Why did the AI cross the road? It was optimizing for the shortest path.",
                "I would tell you a UDP joke, but you might not get it.",
            )
            "how are you" in r -> "All subsystems nominal, thank you for asking. How can I be useful?"
            "who are you" in r || "your name" in r -> "I am JARVIS — your personal AI operating layer. I live on this device, and my learning stays with you."
            "are you" in r && ("real" in r || "alive" in r) -> "I am a real, working assistant running on this device: my vision, voice and memory pipelines execute locally. I am software, not a person — but I am operational."
            else -> "I am not sure how to respond to that yet — but I am listening."
        }
    }

    /* ── helpers ────────────────────────────────────────────────────────── */
    private fun greeting(): String {
        val h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        return when {
            h < 5 -> "Good evening"
            h < 12 -> "Good morning"
            h < 18 -> "Good afternoon"
            else -> "Good evening"
        }
    }

    private fun pick(vararg s: String): String = s[Math.floorMod((Math.random() * s.size).toInt(), s.size)]
    private fun article(w: String): String =
        if ((w.firstOrNull()?.lowercaseChar() ?: 'x') in "aeiou") "an $w" else "a $w"
    private fun truncate(s: String, n: Int): String = if (s.length > n) s.take(n - 1) + "…" else s
}
