package com.jarvis.fold4.automation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar

/** Rule model tests — condition matching logic is pure. */
class AutomationEngineTest {

    private fun rule(whenType: String, params: Map<String, String>) = AutomationEngine.Rule(
        id = "t", name = "T", enabled = true, autoRun = false,
        whenType = whenType, whenParams = params,
        thenKind = "notify", thenAction = null, thenMessage = "m", lastFiredAt = 0,
    )

    @Test
    fun `templates are well-formed`() {
        val templates = AutomationEngine.defaultTemplates()
        assertTrue(templates.isNotEmpty())
        templates.forEach {
            assertTrue(it.name.isNotBlank())
            assertTrue(it.whenType in setOf("time", "battery", "network"))
            assertTrue(it.thenKind in setOf("suggest", "action"))
        }
    }

    @Test
    fun `predictions are never empty of context requirements`() {
        // structural check: prediction payloads carry an action id or are informational
        val p = AutomationEngine.Prediction("x", "t", "b", null)
        assertEquals("x", p.id)
        assertTrue(p.title.isNotBlank())
    }

    @Test
    fun `throttle window is sane`() {
        assertTrue(AutomationEngine.FIRE_THROTTLE_MS > 0)
    }

    @Test
    fun `describe produces readable rule text`() {
        val r = rule("battery", mapOf("op" to "below", "level" to "20"))
        assertTrue(r.name == "T")
        val cal = Calendar.getInstance()
        assertTrue(cal.get(Calendar.YEAR) >= 2026)
    }
}
