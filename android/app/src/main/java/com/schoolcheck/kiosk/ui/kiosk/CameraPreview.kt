package com.schoolcheck.kiosk.ui.kiosk

import android.content.Context
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection as MlKitFaceDetection
import com.google.mlkit.vision.face.FaceDetector
import com.google.mlkit.vision.face.FaceDetectorOptions
import java.util.concurrent.Executor
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Thin CameraX wrapper for the kiosk: preview, live on-device face guidance and
 * in-memory JPEG capture.
 *
 * `takePicture` with [ImageCapture.OnImageCapturedCallback] returns the JPEG bytes
 * directly, so the frame never touches the filesystem or the gallery. ML Kit runs on
 * a background executor over [ImageAnalysis] frames and reports [FaceDetection] to the
 * UI for real-time "move closer / centre your face / hold still" notices.
 */
class KioskCameraController(private val context: Context) {

    val previewView: PreviewView = PreviewView(context).apply {
        scaleType = PreviewView.ScaleType.FILL_CENTER
        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    }

    private val mainExecutor: Executor = ContextCompat.getMainExecutor(context)
    private var cameraProvider: ProcessCameraProvider? = null
    private var imageCapture: ImageCapture? = null
    private var imageAnalysis: ImageAnalysis? = null
    private var faceDetector: FaceDetector? = null
    private var analysisExecutor: ExecutorService? = null
    private val analysisInFlight = AtomicBoolean(false)

    fun start(
        lifecycleOwner: LifecycleOwner,
        useFrontCamera: Boolean,
        onReady: () -> Unit,
        onError: (String) -> Unit,
        onFaceDetection: (FaceDetection) -> Unit,
    ) {
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            try {
                val provider = future.get()
                cameraProvider = provider
                val selector = when {
                    useFrontCamera && provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) ->
                        CameraSelector.DEFAULT_FRONT_CAMERA
                    provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) ->
                        CameraSelector.DEFAULT_BACK_CAMERA
                    else -> throw IllegalStateException("No camera found on this device.")
                }
                val preview = Preview.Builder()
                    .build()
                    .also { it.setSurfaceProvider(previewView.surfaceProvider) }
                val capture = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .setJpegQuality(85)
                    .build()

                imageAnalysis?.clearAnalyzer()
                val analysis = buildImageAnalysis(onFaceDetection)
                imageAnalysis = analysis
                ensureDetector()
                ensureAnalysisExecutor()

                provider.unbindAll()
                try {
                    provider.bindToLifecycle(
                        lifecycleOwner,
                        selector,
                        preview,
                        capture,
                        analysis,
                    )
                } catch (threeUseCaseError: Exception) {
                    // Some devices cannot bind preview + capture + analysis together.
                    // Keep the camera usable and fall back to manual framing guidance.
                    provider.unbindAll()
                    provider.bindToLifecycle(lifecycleOwner, selector, preview, capture)
                    imageAnalysis = null
                    onFaceDetection(
                        FaceDetection(guidance = FaceGuidance.UNAVAILABLE),
                    )
                }
                imageCapture = capture
                onReady()
            } catch (error: Exception) {
                onError(error.message ?: "Camera could not be started.")
            }
        }, mainExecutor)
    }

    private fun buildImageAnalysis(onFaceDetection: (FaceDetection) -> Unit): ImageAnalysis {
        val analysis = ImageAnalysis.Builder()
            .setTargetResolution(Size(640, 480))
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
        val executor = analysisExecutor ?: newAnalysisExecutor().also { analysisExecutor = it }
        analysis.setAnalyzer(executor) { imageProxy ->
            analyze(imageProxy, onFaceDetection)
        }
        return analysis
    }

    private fun ensureDetector(): FaceDetector {
        val existing = faceDetector
        if (existing != null) return existing
        val options = FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
            .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
            .setMinFaceSize(0.12f)
            .enableTracking()
            .build()
        return MlKitFaceDetection.getClient(options).also { faceDetector = it }
    }

    private fun ensureAnalysisExecutor(): ExecutorService =
        analysisExecutor ?: newAnalysisExecutor().also { analysisExecutor = it }

    private fun newAnalysisExecutor(): ExecutorService =
        Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "kiosk-face-analysis").apply { isDaemon = true }
        }

    private fun analyze(imageProxy: ImageProxy, onFaceDetection: (FaceDetection) -> Unit) {
        if (!analysisInFlight.compareAndSet(false, true)) {
            imageProxy.close()
            return
        }
        val mediaImage = imageProxy.image
        val detector = faceDetector
        if (mediaImage == null || detector == null) {
            analysisInFlight.set(false)
            imageProxy.close()
            return
        }

        val rotation = imageProxy.imageInfo.rotationDegrees
        val imageWidth = if (rotation % 180 == 0) imageProxy.width else imageProxy.height
        val imageHeight = if (rotation % 180 == 0) imageProxy.height else imageProxy.width
        val input = InputImage.fromMediaImage(mediaImage, rotation)

        detector.process(input)
            .addOnSuccessListener { faces ->
                val boxes = faces.mapNotNull { face ->
                    val box = face.boundingBox
                    if (box.width() <= 0 || box.height() <= 0) {
                        null
                    } else {
                        DetectedFaceBox(
                            left = box.left.toFloat(),
                            top = box.top.toFloat(),
                            right = box.right.toFloat(),
                            bottom = box.bottom.toFloat(),
                        )
                    }
                }
                onFaceDetection(evaluateFaceDetection(boxes, imageWidth, imageHeight))
            }
            .addOnFailureListener {
                onFaceDetection(FaceDetection(guidance = FaceGuidance.UNAVAILABLE))
            }
            .addOnCompleteListener {
                analysisInFlight.set(false)
                imageProxy.close()
            }
    }

    fun capture(onCaptured: (ByteArray) -> Unit, onError: (String) -> Unit) {
        val capture = imageCapture
        if (capture == null) {
            onError("Camera is not ready yet.")
            return
        }
        capture.takePicture(
            mainExecutor,
            object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    try {
                        val buffer = image.planes[0].buffer
                        val bytes = ByteArray(buffer.remaining())
                        buffer.get(bytes)
                        onCaptured(bytes)
                    } catch (error: Exception) {
                        onError("Could not read the captured photo.")
                    } finally {
                        image.close()
                    }
                }

                override fun onError(exception: ImageCaptureException) {
                    onError(exception.message ?: "Capture failed.")
                }
            },
        )
    }

    fun stop() {
        imageAnalysis?.clearAnalyzer()
        imageAnalysis = null
        cameraProvider?.unbindAll()
        cameraProvider = null
        imageCapture = null
        faceDetector?.close()
        faceDetector = null
        analysisExecutor?.shutdownNow()
        analysisExecutor = null
        analysisInFlight.set(false)
    }
}
