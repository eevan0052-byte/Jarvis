package com.jarvis.fold4.biometrics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.sin
import kotlin.random.Random

/** Feature extraction is pure — testable without a device. */
class SpeakerProfilesTest {

    private fun tone(freq: Double, seconds: Double = 1.0, sr: Int = SpeakerProfiles.SAMPLE_RATE): FloatArray {
        val n = (sr * seconds).toInt()
        return FloatArray(n) { i -> (sin(2 * Math.PI * freq * i / sr) * 0.5).toFloat() }
    }

    private fun noise(seconds: Double = 1.0, sr: Int = SpeakerProfiles.SAMPLE_RATE): FloatArray {
        val n = (sr * seconds).toInt()
        return FloatArray(n) { Random(it).nextFloat() * 2f - 1f }
    }

    @Test
    fun `extract returns null for short input`() {
        assertNull(SpeakerProfiles.extract(FloatArray(100)))
    }

    @Test
    fun `same speaker similar, different speaker dissimilar`() {
        val a1 = SpeakerProfiles.extract(tone(180.0))!!
        val a2 = SpeakerProfiles.extract(tone(185.0))!!
        val b = SpeakerProfiles.extract(tone(300.0))!!
        val same = SpeakerProfiles.similarity(a1, a2)
        val diff = SpeakerProfiles.similarity(a1, b)
        assertTrue("same voice should score higher (got $same vs $diff)", same > diff)
    }

    @Test
    fun `noise versus tone is clearly different`() {
        val a = SpeakerProfiles.extract(tone(150.0))!!
        val n = SpeakerProfiles.extract(noise())!!
        val sim = SpeakerProfiles.similarity(a, n)
        assertTrue(sim < 70)
    }

    @Test
    fun `similarity is bounded 0 to 100`() {
        val a = SpeakerProfiles.extract(tone(200.0))!!
        val b = SpeakerProfiles.extract(tone(200.0))!!
        val s = SpeakerProfiles.similarity(a, b)
        assertTrue(s in 0..100)
        assertEquals(100, s) // identical inputs → 100
    }
}
