package com.jarvis.fold4.biometrics

import com.jarvis.fold4.JarvisApp
import org.json.JSONArray
import org.json.JSONObject

/**
 * Speaker recognition — TRANSPARENT acoustic voiceprint.
 *
 * HONEST SCOPE (also shown in the Privacy Center): Android exposes no
 * biometric speaker-embedding API. JARVIS extracts a classical acoustic
 * feature vector (energy contour, zero-crossing rate, spectral centroid,
 * autocorrelation pitch) from locally recorded PCM. It distinguishes clearly
 * different voices; it is NOT a security-grade biometric and is never used
 * for authentication. Templates are encrypted at rest (BiometricCrypto) and
 * never leave the device.
 *
 * Enrollment records 2 × 3 s samples via AudioRecord (16 kHz mono PCM).
 */
class SpeakerProfiles {

    private val crypto = JarvisApp.instance.bioCrypto

    data class Profile(val name: String, val createdAt: Long, val samples: List<FloatArray>)

    data class FeatureVector(
        val energy: FloatArray,   // 10-bucket RMS contour, normalized
        val zcr: Float,           // zero-crossing rate, normalized
        val centroid: Float,      // spectral centroid (derivative-based)
        val pitch: Float,         // autocorrelation pitch, log-normalized
    )

    fun profiles(): List<String> = load().map { it.name }

    fun enroll(name: String, samples: List<FloatArray>) {
        val profiles = load().filterNot { it.name == name }.toMutableList()
        profiles += Profile(name, System.currentTimeMillis(), samples.mapNotNull(::extract))
        persist(profiles)
    }

    fun verify(sample: FloatArray): Match? {
        val f = extract(sample) ?: return null
        var best: Match? = null
        for (p in load()) {
            for (s in p.samples) {
                val sim = similarity(f, s)
                if (best == null || sim > best.score) best = Match(p.name, sim)
            }
        }
        return best
    }

    fun remove(name: String) = persist(load().filterNot { it.name == name })

    fun wipe() = crypto.wipeAll()

    data class Match(val name: String, val score: Int, val lowConfidence: Boolean = false)

    /* ── persistence (encrypted JSON) ───────────────────────────────────── */

    private fun load(): List<Profile> {
        val raw = crypto.load("speaker") ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                val samples = o.getJSONArray("samples")
                Profile(
                    o.getString("name"),
                    o.getLong("createdAt"),
                    (0 until samples.length()).map { j ->
                        val a = samples.getJSONArray(j)
                        FloatArray(a.length()) { k -> a.getDouble(k).toFloat() }
                    },
                )
            }
        } catch (e: Exception) { emptyList() }
    }

    private fun persist(profiles: List<Profile>) {
        val arr = JSONArray()
        profiles.forEach { p ->
            val o = JSONObject().put("name", p.name).put("createdAt", p.createdAt)
            val samples = JSONArray()
            p.samples.forEach { f ->
                val a = JSONArray()
                f.forEach { a.put(it.toDouble()) }
                samples.put(a)
            }
            o.put("samples", samples)
            arr.put(o)
        }
        crypto.save("speaker", arr.toString())
    }

    /* ── feature extraction (pure, testable) ────────────────────────────── */

    companion object {
        const val SAMPLE_RATE = 16000

        fun extract(samples: FloatArray): FeatureVector? {
            if (samples.size < SAMPLE_RATE / 2) return null
            val buckets = 10
            val energy = FloatArray(buckets)
            val per = samples.size / buckets
            for (b in 0 until buckets) {
                var sum = 0f
                for (i in b * per until (b + 1) * per) sum += samples[i] * samples[i]
                energy[b] = kotlin.math.sqrt(sum / per)
            }
            val emax = energy.maxOrNull() ?: 1e-9f
            val energyNorm = energy.map { it / emax }.toFloatArray()

            var zcr = 0
            for (i in 1 until samples.size) {
                if ((samples[i] >= 0) != (samples[i - 1] >= 0)) zcr++
            }
            val zcrNorm = (zcr.toFloat() / samples.size * 400f).coerceAtMost(1f)

            val frame = 2048
            val centroids = mutableListOf<Float>()
            var off = 0
            while (off + frame <= samples.size) {
                var num = 0f
                var den = 0f
                var prev = samples[off]
                for (i in 1 until frame) {
                    val d = samples[off + i] - prev
                    num += d * d * i
                    den += d * d
                    prev = samples[off + i]
                }
                if (den > 1e-9f) centroids += num / den / frame
                off += frame
            }
            val centroid = if (centroids.isEmpty()) 0f else centroids.average().toFloat()

            val seg = samples.copyOfRange(samples.size / 5, samples.size * 7 / 10)
            var pitch = 0f
            val minLag = SAMPLE_RATE / 400
            val maxLag = SAMPLE_RATE / 60
            if (seg.size > maxLag * 2) {
                var best = -1f
                var bestLag = 0
                for (lag in minLag until maxLag) {
                    var c = 0f
                    var i = 0
                    while (i < seg.size - lag) {
                        c += seg[i] * seg[i + lag]
                        i += 8
                    }
                    if (c > best) { best = c; bestLag = lag }
                }
                if (best > 0) pitch = SAMPLE_RATE.toFloat() / bestLag
            }
            val pitchNorm = ((kotlin.math.ln(pitch + 1f) - 6f) / 3f).coerceIn(0f, 1f)

            return FeatureVector(energyNorm, zcrNorm, centroid, pitchNorm)
        }

        fun similarity(a: FeatureVector, b: FeatureVector): Int {
            var e = 0f
            for (i in a.energy.indices) e += (a.energy[i] - b.energy[i]) * (a.energy[i] - b.energy[i])
            val energySim = (1f - kotlin.math.sqrt(e / a.energy.size)).coerceAtLeast(0f)
            val zcrSim = (1f - kotlin.math.abs(a.zcr - b.zcr)).coerceAtLeast(0f)
            val centSim = (1f - kotlin.math.abs(a.centroid - b.centroid) * 4f).coerceAtLeast(0f)
            val pitchSim = (1f - kotlin.math.abs(a.pitch - b.pitch) * 2f).coerceAtLeast(0f)
            return ((0.45f * energySim + 0.2f * zcrSim + 0.2f * centSim + 0.15f * pitchSim) * 100f).toInt()
        }
    }
}
