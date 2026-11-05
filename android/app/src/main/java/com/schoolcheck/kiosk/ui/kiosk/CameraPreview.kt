package com.schoolcheck.kiosk.ui.kiosk

import android.content.Context
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.util.concurrent.Executor

/**
 * Thin CameraX wrapper for the kiosk: preview plus in-memory JPEG capture.
 *
 * `takePicture` with [ImageCapture.OnImageCapturedCallback] returns the JPEG bytes
 * directly, so the frame never touches the filesystem or the gallery.
 */
class KioskCameraController(private val context: Context) {

    val previewView: PreviewView = PreviewView(context).apply {
        scaleType = PreviewView.ScaleType.FILL_CENTER
        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    }

    private val executor: Executor = ContextCompat.getMainExecutor(context)
    private var cameraProvider: ProcessCameraProvider? = null
    private var imageCapture: ImageCapture? = null

    fun start(
        lifecycleOwner: LifecycleOwner,
        useFrontCamera: Boolean,
        onReady: () -> Unit,
        onError: (String) -> Unit,
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
                provider.unbindAll()
                provider.bindToLifecycle(lifecycleOwner, selector, preview, capture)
                imageCapture = capture
                onReady()
            } catch (error: Exception) {
                onError(error.message ?: "Camera could not be started.")
            }
        }, executor)
    }

    fun capture(onCaptured: (ByteArray) -> Unit, onError: (String) -> Unit) {
        val capture = imageCapture
        if (capture == null) {
            onError("Camera is not ready yet.")
            return
        }
        capture.takePicture(
            executor,
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
        cameraProvider?.unbindAll()
        cameraProvider = null
        imageCapture = null
    }
}
