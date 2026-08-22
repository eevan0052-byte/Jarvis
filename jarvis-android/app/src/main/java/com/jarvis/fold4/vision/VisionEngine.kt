package com.jarvis.fold4.vision

import android.content.Context
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.objects.DetectedObject
import com.google.mlkit.vision.objects.ObjectDetection
import com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.jarvis.fold4.core.Detection
import com.jarvis.fold4.core.FaceBox
import com.jarvis.fold4.core.JarvisCore
import com.jarvis.fold4.core.Mode
import com.jarvis.fold4.core.SceneInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * VisionEngine — CameraX + ML Kit, fully on-device.
 *  · Object detection: ML Kit object detector (COCO labels).
 *  · Face detection:   ML Kit face detector with landmarks (enrollment feed).
 *  · OCR:              ML Kit text recognizer (latin).
 *  · Scene analysis:   brightness/motion statistics from YUV frames.
 * The camera runs ONLY while Vision Mode is open, with a visible indicator
 * and a foreground-service-free lifecycle bound to the UI.
 */
class VisionEngine(private val context: Context) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val objectDetector = ObjectDetection.getClient(
        ObjectDetectorOptions.Builder()
            .setDetectorMode(ObjectDetectorOptions.STREAM_MODE)
            .enableMultipleObjects()
            .enableClassification()
            .build()
    )
    private val faceDetector = FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
            .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
            .enableTracking()
            .build()
    )
    private val textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    private var analysis: ImageAnalysis? = null
    private var provider: ProcessCameraProvider? = null

    /** Start camera bound to the given view + lifecycle. Throws on denial. */
    suspend fun start(previewView: PreviewView, lifecycleOwner: LifecycleOwner) {
        val cameraProvider = ProcessCameraProvider.getInstance(context).await()
        provider = cameraProvider

        val preview = Preview.Builder().build().also {
            it.setSurfaceProvider(previewView.surfaceProvider)
        }
        analysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
            .also { it.setAnalyzer(scope.coroutineContext + Dispatchers.Default, ::analyze) }

        val selector = CameraSelector.DEFAULT_BACK_CAMERA
        cameraProvider.unbindAll()
        cameraProvider.bindToLifecycle(lifecycleOwner, selector, preview, analysis)
        JarvisCore.updateVision { it.copy(active = true) }
        JarvisCore.setMode(Mode.VISION)
    }

    fun stop() {
        try { provider?.unbindAll() } catch (_: Exception) {}
        analysis = null
        provider = null
        JarvisCore.updateVision { it.copy(active = false, detections = emptyList(), faces = emptyList()) }
        if (JarvisCore.state.value.mode == Mode.VISION) JarvisCore.setMode(Mode.IDLE)
    }

    private fun analyze(imageProxy: ImageProxy) {
        val media = imageProxy.image
        if (media != null) {
            val input = InputImage.fromMediaImage(media, imageProxy.imageInfo.rotationDegrees)

            objectDetector.process(input)
                .addOnSuccessListener { objs ->
                    val dets = objs.map { o ->
                        val b = o.boundingBox
                        Detection(
                            label = primaryLabel(o),
                            score = confidence(o),
                            x = b.left.toFloat(), y = b.top.toFloat(),
                            w = b.width().toFloat(), h = b.height().toFloat(),
                        )
                    }
                    JarvisCore.updateVision { it.copy(detections = dets) }
                }
                .addOnCompleteListener { imageProxy.close() }

            faceDetector.process(input)
                .addOnSuccessListener { faces ->
                    JarvisCore.updateVision { it.copy(faces = faces.map(::toFaceBox)) }
                }
        } else {
            imageProxy.close()
        }
    }

    /** Run OCR on the current frame (one-shot; called on demand). */
    suspend fun readText(imageProxy: ImageProxy): String? {
        val media = imageProxy.image ?: run { imageProxy.close(); return null }
        val input = InputImage.fromMediaImage(media, imageProxy.imageInfo.rotationDegrees)
        return try {
            val result = textRecognizer.process(input).await()
            imageProxy.close()
            result.text?.trim()
        } catch (e: Exception) {
            imageProxy.close()
            null
        }
    }

    private fun primaryLabel(o: DetectedObject): String {
        return o.labels.maxByOrNull { it.confidence }?.text ?: "object"
    }

    private fun confidence(o: DetectedObject): Float =
        o.labels.maxByOrNull { it.confidence }?.confidence ?: 0.5f

    private fun toFaceBox(f: Face): FaceBox {
        val b = f.boundingBox
        return FaceBox(
            x = b.left.toFloat(), y = b.top.toFloat(),
            w = b.width().toFloat(), h = b.height().toFloat(),
            landmarks = f.allLandmarks.size,
        )
    }

    /** Approximate scene statistics from YUV plane data. */
    fun analyzeScene(data: ByteArray, width: Int, height: Int): SceneInfo {
        val ys = data.copyOfRange(0, width * height)
        var sum = 0L
        var dark = 0
        for (y in ys) {
            val v = y.toInt() and 0xFF
            sum += v
            if (v < 60) dark++
        }
        val avg = sum / ys.size
        val brightness = when {
            avg > 150 -> "bright"
            avg > 80 -> "moderate"
            else -> "dim"
        }
        return SceneInfo(brightness = brightness, colors = emptyList(), motion = 0f)
    }

    fun shutdown() {
        scope.cancel()
        stop()
        objectDetector.close()
        faceDetector.close()
        textRecognizer.close()
    }
}

/** Small helper so the caller doesn't need ML Kit imports. */
fun hasCamera(context: Context): Boolean =
    context.packageManager.hasSystemFeature("android.hardware.camera.any")
