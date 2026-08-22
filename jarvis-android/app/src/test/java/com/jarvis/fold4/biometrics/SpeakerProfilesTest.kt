package com.jarvis.fold4.biometrics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.sin
import kotlin.random.Random

/**
 * Feature extraction is pure — testable without a device.
 * Signals are synthetic "voices": harmonic stacks with syllabic amplitude
 * envelopes — far closer to real speech than pure tones, so the features
 * discriminate pitch/formant differences the way they do in practice.
 */
class SpeakerProfilesTest {

    private fun voice(f0: Double, formant: Double, seed: Int, seconds: Double = 1.2, sr: Int = SpeakerProfiles.SAMPLE_RATE): FloatArray {
        val n = (sr * seconds).toInt()
        val rnd = Random(seed)
        return FloatArray(n) { i ->
            val t = i.toDouble() / sr
            val syllabic = 0.45 + 0.55 * (0.5 + 0.5 * sin(2 * PI * 1.35 * t + 0.7))
            val harmonics = sin(2 * PI * f0 * t) +
                0.6 * sin(2 * PI * f0 * 2 * t) +
                0.35 * sin(2 * PI * f0 * 3 * t) +
                0.45 * sin(2 * PI * formant * t)
            val noise = (rnd.nextDouble() - 0.5) * 0.02
            (harmonics * syllabic * 0.32 + noise).toFloat()
        }
    }

    @Test
    fun `extract returns null for short input`() {
        assertNull(SpeakerProfiles.extract(FloatArray(100)))
    }

    @Test
    fun `same speaker similar, different speaker dissimilar`() {
        // "same speaker": two takes, same pitch/formant, different noise
        val a1 = SpeakerProfiles.extract(voice(118.0, 850.0, seed = 7))!!
        val a2 = SpeakerProfiles.extract(voice(121.0, 840.0, seed = 8))!!
        // "different speaker": clearly different pitch and formant
        val b = SpeakerProfiles.extract(voice(220.0, 1500.0, seed = 9))!!
        val same = SpeakerProfiles.similarity(a1, a2)
        val diff = SpeakerProfiles.similarity(a1, b)
        assertTrue("same speaker should score higher (got same=$same, diff=$diff)", same > diff)
    }

    @Test
    fun `noise versus voice is clearly different`() {
        val a = SpeakerProfiles.extract(voice(130.0, 900.0, seed = 11))!!
        val rnd = Random(42)
        val noise = FloatArray(SpeakerProfiles.SAMPLE_RATE) { (rnd.nextFloat() * 2f - 1f) * 0.4f }
        val n = SpeakerProfiles.extract(noise)!!
        val sim = SpeakerProfiles.similarity(a, n)
        assertTrue("noise should not match a voice (got $sim)", sim < 70)
    }

    @Test
    fun `similarity is bounded 0 to 100`() {
        val a = SpeakerProfiles.extract(voice(150.0, 1000.0, seed = 21))!!
        val b = SpeakerProfiles.extract(voice(150.0, 1000.0, seed = 22))!!
        val s = SpeakerProfiles.similarity(a, b)
        assertTrue(s in 0..100)
    }

    @Test
    fun `identical inputs score 100`() {
        val a = SpeakerProfiles.extract(voice(150.0, 1000.0, seed = 33))!!
        assertEquals(100, SpeakerProfiles.similarity(a, a))
    }
}
