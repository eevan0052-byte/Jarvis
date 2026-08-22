package com.jarvis.fold4.biometrics

import com.google.mlkit.vision.face.Face
import com.jarvis.fold4.JarvisApp
import org.json.JSONArray
import org.json.JSONObject

/**
 * Face recognition — TRANSPARENT landmark templates for personalization.
 * Uses ML Kit face landmarks (eyes, nose, mouth geometry, aspect ratio).
 * NOT a security biometric, never used to authenticate or unlock anything.
 * Templates are encrypted at rest; deletion is one tap in the Privacy Center.
 */
class FaceProfiles {

    private val crypto = JarvisApp.instance.bioCrypto

    data class Template(
        val aspect: Float,
        val eyeDist: Float,
        val noseToMouth: Float,
        val eyeAngle: Float,
    )

    data class Profile(val name: String, val createdAt: Long, val samples: List<Template>)

    fun profiles(): List<String> = load().map { it.name }

    fun templateFromFace(face: Face): Template? {
        val eyes = face.allLandmarks.filter { it.landmarkType == com.google.mlkit.vision.face.FaceLandmark.LEFT_EYE || it.landmarkType == com.google.mlkit.vision.face.FaceLandmark.RIGHT_EYE }
        val nose = face.allLandmarks.firstOrNull { it.landmarkType == com.google.mlkit.vision.face.FaceLandmark.NOSE_BASE }
        val mouth = face.allLandmarks.firstOrNull { it.landmarkType == com.google.mlkit.vision.face.FaceLandmark.MOUTH_LEFT || it.landmarkType == com.google.mlkit.vision.face.FaceLandmark.MOUTH_RIGHT }
        if (eyes.size < 2 || nose == null || mouth == null) return null
        val b = face.boundingBox
        val l = eyes[0].position
        val r = eyes[1].position
        val W = b.width().toFloat()
        val H = b.height().toFloat()
        return Template(
            aspect = W / H,
            eyeDist = kotlin.math.sqrt((l.x - r.x) * (l.x - r.x) + (l.y - r.y) * (l.y - r.y)) / W,
            noseToMouth = kotlin.math.sqrt((nose.position.x - mouth.position.x) * (nose.position.x - mouth.position.x) + (nose.position.y - mouth.position.y) * (nose.position.y - mouth.position.y)) / H,
            eyeAngle = kotlin.math.atan2((r.y - l.y).toDouble(), (r.x - l.x).toDouble()).toFloat(),
        )
    }

    fun enroll(name: String, faces: List<Face>) {
        val templates = faces.mapNotNull(::templateFromFace)
        if (templates.isEmpty()) throw IllegalStateException("Could not extract facial landmarks. Face the camera with good lighting.")
        val profiles = load().filterNot { it.name == name }.toMutableList()
        profiles += Profile(name, System.currentTimeMillis(), templates)
        persist(profiles)
    }

    fun verify(face: Face): Match? {
        val t = templateFromFace(face) ?: return null
        var best: Match? = null
        for (p in load()) {
            for (s in p.samples) {
                val score = similarity(t, s)
                if (best == null || score > best.score) best = Match(p.name, score)
            }
        }
        return best
    }

    fun remove(name: String) = persist(load().filterNot { it.name == name })
    fun wipe() = crypto.delete("face")

    data class Match(val name: String, val score: Int, val lowConfidence: Boolean = false)

    private fun similarity(a: Template, b: Template): Int {
        val eyeDist = (1f - kotlin.math.abs(a.eyeDist - b.eyeDist) / 0.12f).coerceAtLeast(0f)
        val aspect = (1f - kotlin.math.abs(a.aspect - b.aspect) / 0.35f).coerceAtLeast(0f)
        val ntm = (1f - kotlin.math.abs(a.noseToMouth - b.noseToMouth) / 0.15f).coerceAtLeast(0f)
        val eyeAngle = (1f - kotlin.math.abs(a.eyeAngle - b.eyeAngle) / 0.3f).coerceAtLeast(0f)
        return ((0.3f * eyeDist + 0.2f * aspect + 0.3f * ntm + 0.2f * eyeAngle) * 100f).toInt()
    }

    private fun load(): List<Profile> {
        val raw = crypto.load("face") ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                val samples = o.getJSONArray("samples")
                Profile(
                    o.getString("name"),
                    o.getLong("createdAt"),
                    (0 until samples.length()).map { j ->
                        val s = samples.getJSONObject(j)
                        Template(
                            s.getDouble("aspect").toFloat(),
                            s.getDouble("eyeDist").toFloat(),
                            s.getDouble("noseToMouth").toFloat(),
                            s.getDouble("eyeAngle").toFloat(),
                        )
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
            p.samples.forEach { s ->
                samples.put(JSONObject()
                    .put("aspect", s.aspect.toDouble())
                    .put("eyeDist", s.eyeDist.toDouble())
                    .put("noseToMouth", s.noseToMouth.toDouble())
                    .put("eyeAngle", s.eyeAngle.toDouble()))
            }
            o.put("samples", samples)
            arr.put(o)
        }
        crypto.save("face", arr.toString())
    }
}
