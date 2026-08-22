package com.jarvis.fold4.ai

import com.jarvis.fold4.ai.LocalNluEngine.Intent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** NLU parity tests — same corpus as the web companion test suite. */
class LocalNluEngineTest {

    @Test
    fun `battery intent`() {
        assertEquals(Intent.BATTERY, LocalNluEngine.parse("what is my battery status").intent)
    }

    @Test
    fun `vision identify`() {
        assertEquals(Intent.VISION_IDENTIFY, LocalNluEngine.parse("what is this object").intent)
    }

    @Test
    fun `reminder with time slot`() {
        val p = LocalNluEngine.parse("remind me to call mom at 6pm")
        assertEquals(Intent.REMINDER_SET, p.intent)
        assertEquals("Call mom", p.slots["body"])
        assertEquals("at 6pm", p.slots["timePhrase"])
    }

    @Test
    fun `remember fact`() {
        val p = LocalNluEngine.parse("remember that my favorite color is blue")
        assertEquals(Intent.REMEMBER_FACT, p.intent)
        assertTrue(p.slots["fact"]!!.contains("favorite color"))
    }

    @Test
    fun `recall extracts query`() {
        val p = LocalNluEngine.parse("what do you remember about the office")
        assertEquals(Intent.RECALL, p.intent)
        assertTrue(p.slots["query"]!!.contains("office"))
    }

    @Test
    fun `focus beats routine catch-all`() {
        assertEquals(Intent.FOCUS_START, LocalNluEngine.parse("start focus mode").intent)
        assertEquals(Intent.FOCUS_STOP, LocalNluEngine.parse("stop focus mode").intent)
        assertEquals(Intent.FOCUS_START, LocalNluEngine.parse("start my focus mode").intent)
    }

    @Test
    fun `routine run extracts name`() {
        val p = LocalNluEngine.parse("run night protocol")
        assertEquals(Intent.ROUTINE_RUN, p.intent)
        assertTrue(p.slots["routineName"]!!.contains("night"))
    }

    @Test
    fun `chain splitting`() {
        val parts = LocalNluEngine.splitChain("check my schedule, tell me if I have enough time, and start my focus mode")
        assertEquals(3, parts.size)
        assertEquals(Intent.FOCUS_START, LocalNluEngine.parse(parts[2]).intent)
    }

    @Test
    fun `lists are not chains`() {
        val parts = LocalNluEngine.splitChain("remind me to buy milk, eggs and bread")
        assertEquals(1, parts.size)
    }

    @Test
    fun `wake word`() {
        assertEquals(Intent.WAKE, LocalNluEngine.parse("Jarvis").intent)
        assertEquals(Intent.WAKE, LocalNluEngine.parse("hey jarvis").intent)
    }

    @Test
    fun `stop alone is negate, stop focus is focus`() {
        assertEquals(Intent.NEGATE, LocalNluEngine.parse("stop").intent)
        assertEquals(Intent.FOCUS_STOP, LocalNluEngine.parse("stop focus mode").intent)
    }

    @Test
    fun `unknown fallback`() {
        assertEquals(Intent.UNKNOWN, LocalNluEngine.parse("xyzzy plugh frobnicate").intent)
    }
}
