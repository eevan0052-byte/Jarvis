package com.jarvis.fold4.ai

/**
 * Local NLU — on-device intent engine (Kotlin port of the reference
 * implementation in the web companion; behavior is unit-tested against the
 * same command corpus). Rule/pattern-based, zero network, <1 ms latency.
 */
object LocalNluEngine {

    enum class Intent {
        GREET, TIME, DATE, WEATHER, BATTERY, SYSTEM_STATUS, NETWORK_STATUS, BRIEFING,
        VISION_ANALYZE, VISION_IDENTIFY, VISION_READ_TEXT, VISION_SCENE, VISION_ROOM,
        VISION_STOP, VISION_OPEN, EXPLAIN_THIS,
        REMEMBER_THIS, REMEMBER_FACT, RECALL, FORGET,
        REMINDER_SET, REMINDER_LIST, REMINDER_CANCEL,
        ROUTINE_RUN, ROUTINE_CREATE, ROUTINE_LIST, FOCUS_START, FOCUS_STOP,
        WHO_SPEAKING, MEMORY_OPEN, SYSTEM_OPEN, PRIVACY_OPEN, SETTINGS_OPEN,
        AUTOMATION_OPEN, BRIEFING_OPEN, VOLUME_SET, VOLUME_MUTE, MISSION_START,
        HELP, CAPABILITIES, WAKE, THANKS, AFFIRM, NEGATE, SMALLTALK, UNKNOWN
    }

    data class Parsed(
        val intent: Intent,
        val raw: String,
        val slots: Map<String, String> = emptyMap(),
        val confidence: Float = 0.1f,
    )

    private data class Rule(val intent: Intent, val re: Regex, val stop: Boolean = false)

    private val CHAIN_VERBS =
        "(?:check|tell|show|start|stop|open|close|run|remind|set|create|analyze|what|who|when|read|explain|summarize|identify|scan|mute|unmute|enable|disable|help|give|remember|forget|find|how|do|can|could|please)"

    private val RULES = listOf(
        Rule(Intent.WAKE, Regex("""^(jarvis|hey\s+jarvis|ok\s+jarvis)\s*$""", RegexOption.IGNORE_CASE)),
        Rule(Intent.THANKS, Regex("""\b(thanks|thank you|thx|cheers|perfect|great|awesome|good job|nice)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.AFFIRM, Regex("""^(yes|yeah|yep|ok|okay|sure|go ahead|do it|confirm|please do|affirmative)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.NEGATE, Regex("""^(no|nope|nah|cancel|never ?mind|abort|not now)[.!?\s]*$|^stop[.!?\s]*$""", RegexOption.IGNORE_CASE)),

        Rule(Intent.GREET, Regex("""\b(^hi|^hello|^hey|^good\s+(morning|afternoon|evening)|how are you|what'?s up|yo)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.TIME, Regex("""\bwhat('?s| is) the time\b|\bwhat time is it\b|\bcurrent time\b|\btell me the time\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.DATE, Regex("""\bwhat('?s| is) (the|today'?s) date\b|\bwhat day is (it|today)\b|\btoday'?s date\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.WEATHER, Regex("""\bweather\b|\btemperature outside\b|\bforecast\b|\bis it (raining|cold|hot|sunny|snowing)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.BATTERY, Regex("""\bbattery\b|\bpower level\b|\bcharge (level|status)\b|\bhow much (power|charge|battery)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.SYSTEM_STATUS, Regex("""\b(system|device) (status|health|stats|diagnostics)\b|\bstorage (status|space|left)\b|\bram usage\b|\bhow('?s| is) (the )?(device|system|phone) (doing|running)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.NETWORK_STATUS, Regex("""\bnetwork (status|connection)\b|\bam i (online|offline)\b|\bwifi status\b|\bconnectivity\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.BRIEFING, Regex("""\b(briefing|brief me|morning brief|evening brief|daily brief|summary of (my|the) (day|morning|evening))\b""", RegexOption.IGNORE_CASE)),

        Rule(Intent.VISION_ANALYZE, Regex("""\b(analyze|scan|inspect|examine)\s+(this|that|the scene|what'?s? in front of you|the camera|what you see)\b""", RegexOption.IGNORE_CASE), stop = true),
        Rule(Intent.VISION_ANALYZE, Regex("""\b(analyze|scan) (the )?(environment|room|area|desk|table|scene)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.VISION_IDENTIFY, Regex("""\b(what is|what'?s|identify|what are)\s+(this|that|these|those|it|the object|this object|this thing)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.VISION_IDENTIFY, Regex("""\bidentify (this|that|the) (object|thing|item|plant|device|product)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.VISION_READ_TEXT, Regex("""\b(read|extract|ocr)\s+(the )?(text|this text|that text|this document|that document|this page|the screen|this screen|the sign|this book)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.VISION_READ_TEXT, Regex("""\bread (what|that|this|it)\b.*\b(says|text|written)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.VISION_SCENE, Regex("""\b(summarize|describe)\s+(what you see|the scene|what'?s in front of you|your view|the camera view)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.VISION_ROOM, Regex("""\b(analyze|describe|scan) (this|the) room\b|\broom analysis\b|\bwhat kind of room\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.EXPLAIN_THIS, Regex("""\b(explain|tell me about|what does|how does|what is .* used for)\s+(this|that|it|this object|that object)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.EXPLAIN_THIS, Regex("""\b(what is|what are) (this|that)\b.*\b(used for|for)\b""", RegexOption.IGNORE_CASE)),

        Rule(Intent.REMEMBER_THIS, Regex("""\bremember (this|that|it|this object|that object)\s*[.!?]?\s*$""", RegexOption.IGNORE_CASE), stop = true),
        Rule(Intent.RECALL, Regex("""\b(what do you (remember|know) about|recall|do you remember)\s+(.+)""", RegexOption.IGNORE_CASE), stop = true),
        Rule(Intent.FORGET, Regex("""\b(forget|delete|erase|remove) (that|this|the memory|what you remember about)\b""", RegexOption.IGNORE_CASE), stop = true),
        Rule(Intent.REMEMBER_FACT, Regex("""\b(remember|note|memorize)\s+(that|this)?\s*.+""", RegexOption.IGNORE_CASE), stop = true),
        Rule(Intent.REMEMBER_FACT, Regex("""\b(i (like|love|prefer|hate|dislike)\b.*|my favorite\b.*|i am a\b.*|i work as\b.*|i live in\b.*)""", RegexOption.IGNORE_CASE), stop = true),

        Rule(Intent.REMINDER_SET, Regex("""\bremind me\b""", RegexOption.IGNORE_CASE), stop = true),
        Rule(Intent.REMINDER_SET, Regex("""\bset (a |an )?(reminder|alarm)\b""", RegexOption.IGNORE_CASE), stop = true),
        Rule(Intent.REMINDER_LIST, Regex("""\b(show|list|what are) (my )?reminders\b|\bupcoming reminders\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.REMINDER_CANCEL, Regex("""\b(cancel|delete|remove|clear) (the |my |that )?reminder\b""", RegexOption.IGNORE_CASE), stop = true),

        Rule(Intent.VISION_OPEN, Regex("""\b(open|start|activate|enable|launch)\s+(vision|the camera|camera mode|vision mode)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.VISION_STOP, Regex("""\b(stop|close|end|exit|disable)\s+(vision|camera|scan|scanning)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.MEMORY_OPEN, Regex("""\b(open|show|go to) (the |my )?memor(y|ies)\b|\bmemory center\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.SYSTEM_OPEN, Regex("""\b(open|show) (the )?system (status|command center|center|page)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.PRIVACY_OPEN, Regex("""\b(open|show) (the )?privacy (center|settings|page)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.SETTINGS_OPEN, Regex("""\b(open|show) (the )?settings\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.AUTOMATION_OPEN, Regex("""\b(open|show) (the )?automation(s)?\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.BRIEFING_OPEN, Regex("""\b(open|show) (the |my )?briefing\b""", RegexOption.IGNORE_CASE)),

        Rule(Intent.FOCUS_START, Regex("""\b(start|enable|activate|begin)\s+(the\s+|my\s+)?focus\s*(mode)?\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.FOCUS_STOP, Regex("""\b(stop|end|disable|exit)\s+(the\s+|my\s+)?focus\s*(mode)?\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.ROUTINE_CREATE, Regex("""\bcreate (a |an |new )?routine\b""", RegexOption.IGNORE_CASE), stop = true),
        Rule(Intent.ROUTINE_LIST, Regex("""\b(show|list) (my )?routines\b|\bmy routines\b""", RegexOption.IGNORE_CASE)),

        Rule(Intent.WHO_SPEAKING, Regex("""\bwho is (speaking|talking|this)\b|\bidentify (the |this )?(speaker|voice|person)\b|\bwho am i\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.VOLUME_SET, Regex("""\b(set |change )?(the )?volume (to |at )?(\d{1,3}|max|minimum|low|medium|high)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.VOLUME_MUTE, Regex("""\b(mute|unmute|silence)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.MISSION_START, Regex("""\bhelp me (prepare for|get ready for|plan)\b""", RegexOption.IGNORE_CASE), stop = true),
        Rule(Intent.MISSION_START, Regex("""\b(start|create) (a |an )?mission\b""", RegexOption.IGNORE_CASE), stop = true),
        Rule(Intent.CAPABILITIES, Regex("""\bwhat can you do\b|\byour (capabilities|abilities|features)\b|\blist your (features|commands|abilities)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.HELP, Regex("""\b(help|how do i|how to)\b""", RegexOption.IGNORE_CASE)),
        Rule(Intent.SMALLTALK, Regex("""\b(how are you|tell me a joke|are you (real|alive|ai)|who are you|what is your name|do you sleep|sing)\b""", RegexOption.IGNORE_CASE)),

        // Catch-all routine run — MUST remain last (first match wins).
        Rule(Intent.ROUTINE_RUN, Regex("""\b(run|start|activate|execute|initiate|trigger)\s+(.+?)\s*(routine|protocol|mode)?$""", RegexOption.IGNORE_CASE)),
    )

    /**
     * Split compound commands ("check my schedule, tell me if I have time,
     * and start my focus mode") while guarding ordinary lists
     * ("buy milk, eggs and bread").
     */
    fun splitChain(text: String): List<String> {
        val splitRe = Regex("""\s*,\s*|\s*;\s*|\s+(?:and\s+)?then\s+|\s+and\s+(?=$CHAIN_VERBS\b)""", RegexOption.IGNORE_CASE)
        val candidates = text.split(splitRe).map { it.trim() }.filter { it.isNotEmpty() }
        if (candidates.size <= 1) return listOf(text.trim())
        val verbRe = Regex("""^(?:and\s+)?$CHAIN_VERBS\b""", RegexOption.IGNORE_CASE)
        val valid = candidates.drop(1).all { verbRe.containsMatchIn(it) }
        if (!valid) return listOf(text.trim())
        return candidates.map { it.replace(Regex("""^and\s+""", RegexOption.IGNORE_CASE), "").trim() }
    }

    fun parse(text: String): Parsed {
        val raw = text.trim()
        if (raw.isEmpty()) return Parsed(Intent.UNKNOWN, raw, confidence = 0f)
        val lower = raw.lowercase()

        var best: Pair<Rule, MatchResult>? = null
        for (rule in RULES) {
            val m = rule.re.find(lower) ?: continue
            if (rule.stop) return build(rule.intent, m, raw, 0.97f)
            if (best == null) best = rule to m
        }
        return best?.let { build(it.first.intent, it.second, raw, 0.85f) }
            ?: Parsed(Intent.UNKNOWN, raw, slots = mapOf("query" to raw), confidence = 0.1f)
    }

    fun parseAll(text: String): List<Parsed> = splitChain(text).map { parse(it) }

    private fun build(intent: Intent, m: MatchResult, raw: String, confidence: Float): Parsed {
        val slots = mutableMapOf<String, String>()
        val lower = raw.lowercase()

        when (intent) {
            Intent.REMINDER_SET -> {
                var body = raw
                    .replace(Regex("""^(.*?remind me|.*?set (a |an )?(reminder|alarm))\s*(to\s+|about\s+)?""", RegexOption.IGNORE_CASE), "")
                    .trim().replace(Regex("""[,.!?]+$"""), "")
                val timeM = Regex("""\b(in\s+\d+\s*(seconds?|minutes?|hours?)|at\s+\d{1,2}(?::\d{2})?\s*(am|pm)?|tomorrow(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(am|pm)?)?|tonight|this\s+(morning|afternoon|evening))\b""", RegexOption.IGNORE_CASE).find(body)
                if (timeM != null) {
                    slots["timePhrase"] = timeM.value
                    body = body.replace(timeM.value, "").replace(Regex("""\s+"""), " ").replace(Regex("""^(to|about)\s+""", RegexOption.IGNORE_CASE), "").trim()
                }
                if (body.isNotEmpty()) body = body.replaceFirstChar { it.uppercase() }
                slots["body"] = body
            }
            Intent.REMEMBER_FACT -> {
                val body = raw.replace(Regex("""^(.*?\b(remember|note|memorize)\s+(that\s+|this\s+)?)""", RegexOption.IGNORE_CASE), "").trim()
                slots["fact"] = body.replace(Regex("""^that\s+""", RegexOption.IGNORE_CASE), "")
            }
            Intent.RECALL -> {
                slots["query"] = (m.groups[3]?.value ?: raw.replace(Regex("""^(what do you (remember|know) about|recall|do you remember)\s*""", RegexOption.IGNORE_CASE), "")).trim()
            }
            Intent.FORGET -> slots["query"] = raw.replace(Regex("""^(forget|delete|erase|remove)\s+(that|this|the memory|what you remember about)\s*""", RegexOption.IGNORE_CASE), "").trim()
            Intent.REMINDER_CANCEL -> slots["query"] = raw.replace(Regex("""^(cancel|delete|remove|clear)\s+(the |my |that )?reminder(s)?\s*""", RegexOption.IGNORE_CASE), "").trim()
            Intent.ROUTINE_RUN -> {
                val name = (m.groups[2]?.value ?: "").trim().ifEmpty {
                    raw.replace(Regex("""\b(run|start|activate|execute|initiate|trigger)\s+""", RegexOption.IGNORE_CASE), "")
                        .replace(Regex("""\s*(routine|protocol|mode)$""", RegexOption.IGNORE_CASE), "").trim()
                }
                slots["routineName"] = name
            }
            Intent.VOLUME_SET -> slots["level"] = (m.groups[4]?.value ?: "").lowercase()
            Intent.MISSION_START -> slots["goal"] = raw
                .replace(Regex("""^(help me (prepare for|get ready for|plan)|start (a |an )?mission)\s*""", RegexOption.IGNORE_CASE), "").trim()
                .ifEmpty { "my next day" }
            Intent.WEATHER -> {
                var city = raw.replace(Regex("""^(.*?weather|.*?forecast)\s*(in|for)?\s*""", RegexOption.IGNORE_CASE), "").replace("?", "").trim()
                if (city.isBlank() || city.lowercase() in setOf("please", "the", "a", "an", "ok", "okay")) city = ""
                slots["city"] = city
            }
            else -> {}
        }
        if (intent == Intent.UNKNOWN) slots["query"] = raw
        return Parsed(intent, raw, slots, confidence)
    }
}
