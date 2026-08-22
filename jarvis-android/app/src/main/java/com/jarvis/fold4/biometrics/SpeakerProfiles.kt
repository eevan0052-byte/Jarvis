package com.jarvis.fold4.biometrics

import com.jarvis.fold4.JarvisApp
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.sqrt

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

    data class FeatureVector(
        val energy: FloatArray,   // 10-bucket RMS contour, normalized
        val energyStd: Float,     // contour variance — syllabic dynamics
        val zcr: Float,           // zero-crossing rate, normalized
        val centroid: Float,      // spectral centroid (derivative-based)
        val pitch: Float,         // autocorrelation pitch, log-normalized
    )

    data class Profile(val name: String, val createdAt: Long, val samples: List<FeatureVector>)

    fun profiles(): List<String> = load().map { it.name }

    fun enroll(name: String, samples: List<FloatArray>) {
        val features = samples.mapNotNull(::extract)
        if (features.isEmpty()) throw IllegalStateException("Could not extract a voice profile from the recording. Speak clearly and try again.")
        val profiles = load().filterNot { it.name == name }.toMutableList()
        profiles += Profile(name, System.currentTimeMillis(), features)
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
                    (0 until samples.length()).map { j -> featureFromJson(samples.getJSONObject(j)) },
                )
            }
        } catch (e: Exception) { emptyList() }
    }

    private fun persist(profiles: List<Profile>) {
        val arr = JSONArray()
        profiles.forEach { p ->
            val o = JSONObject().put("name", p.name).put("createdAt", p.createdAt)
            val samples = JSONArray()
            p.samples.forEach { f -> samples.put(featureToJson(f)) }
            o.put("samples", samples)
            arr.put(o)
        }
        crypto.save("speaker", arr.toString())
    }

    private fun featureToJson(f: FeatureVector): JSONObject {
        val energy = JSONArray()
        f.energy.forEach { energy.put(it.toDouble()) }
        return JSONObject()
            .put("energy", energy)
            .put("energyStd", f.energyStd.toDouble())
            .put("zcr", f.zcr.toDouble())
            .put("centroid", f.centroid.toDouble())
            .put("pitch", f.pitch.toDouble())
    }

    private fun featureFromJson(o: JSONObject): FeatureVector {
        val energyArr = o.getJSONArray("energy")
        val energy = FloatArray(energyArr.length()) { i -> energyArr.getDouble(i).toFloat() }
        return FeatureVector(
            energy = energy,
            energyStd = o.optDouble("energyStd", 0.0).toFloat(),
            zcr = o.getDouble("zcr").toFloat(),
            centroid = o.getDouble("centroid").toFloat(),
            pitch = o.getDouble("pitch").toFloat(),
        )
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
                energy[b] = sqrt(sum / per)
            }
            val emax = energy.maxOrNull() ?: 1e-9f
            val energyNorm = energy.map { it / emax }.toFloatArray()

            var zcr = 0
            for (i in 1 until samples.size) {
                if ((samples[i] >= 0) != (samples[i - 1] >= 0)) zcr++
            }
            // raw scaled value — NOT clamped (noise ≈ 12, speech ≈ 2-4);
            // clamping happens on the DIFFERENCE in similarity()
            val zcrNorm = zcr.toFloat() / samples.size * 24f

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

            val from = samples.size / 5
            val to = samples.size * 7 / 10
            val seg = samples.copyOfRange(from, to)
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
            // log-normalize over the voiced range (~60–400 Hz)
            val pitchNorm = ((ln(pitch + 1f) - ln(61f)) / (ln(401f) - ln(61f))).coerceIn(0f, 1f)

            // energy contour variance — speech has syllabic dynamics, noise does not
            val mean = energyNorm.average().toFloat()
            var variance = 0f
            for (v in energyNorm) variance += (v - mean) * (v - mean)
            val energyStd = sqrt(variance / energyNorm.size)

            return FeatureVector(energyNorm, energyStd, zcrNorm, centroid, pitchNorm)
        }

        fun similarity(a: FeatureVector, b: FeatureVector): Int {
            var e = 0f
            for (i in a.energy.indices) e += (a.energy[i] - b.energy[i]) * (a.energy[i] - b.energy[i])
            val energySim = (1f - sqrt(e / a.energy.size)).coerceAtLeast(0f)
            val stdSim = (1f - abs(a.energyStd - b.energyStd) * 4f).coerceAtLeast(0f)
            val zcrSim = (1f - abs(a.zcr - b.zcr) * 0.12f).coerceAtLeast(0f)
            val centSim = (1f - abs(a.centroid - b.centroid) * 4f).coerceAtLeast(0f)
            val pitchSim = (1f - abs(a.pitch - b.pitch) * 2f).coerceAtLeast(0f)
            return ((0.30f * energySim + 0.15f * stdSim + 0.15f * zcrSim + 0.20f * centSim + 0.20f * pitchSim) * 100f).toInt()
        }
    }
}
