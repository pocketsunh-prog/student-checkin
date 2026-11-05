package com.schoolcheck.kiosk.ui.kiosk

import kotlin.math.abs

/**
 * Live face guidance states shown above the capture button.
 *
 * Detection runs on-device (ML Kit); the server remains the authority for matching.
 * Gating the capture button on [FaceGuidance.READY] avoids uploading frames where the
 * face is missing, too small, off-centre or one of several people.
 */
enum class FaceGuidance {
    SEARCHING,
    NO_FACE,
    MULTIPLE_FACES,
    TOO_FAR,
    TOO_CLOSE,
    OFF_CENTER,
    READY,
    UNAVAILABLE,
}

/** A detected face rectangle in (possibly rotated) image coordinates. */
data class DetectedFaceBox(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
) {
    val width: Float get() = (right - left).coerceAtLeast(0f)
    val height: Float get() = (bottom - top).coerceAtLeast(0f)
    val centerX: Float get() = (left + right) / 2f
    val centerY: Float get() = (top + bottom) / 2f
}

data class FaceDetection(
    val guidance: FaceGuidance = FaceGuidance.SEARCHING,
    val faceCount: Int = 0,
    val faceWidthRatio: Float = 0f,
)

/**
 * Pure heuristic used by the camera analyzer and unit tests.
 *
 * The face should be roughly centred and occupy 25–72% of the analysed image width.
 * These values are intentionally forgiving: the goal is to stop obviously bad captures,
 * not to reject a usable face because the student moved a few pixels.
 */
fun evaluateFaceDetection(
    boxes: List<DetectedFaceBox>,
    imageWidth: Int,
    imageHeight: Int,
): FaceDetection {
    if (imageWidth <= 0 || imageHeight <= 0) {
        return FaceDetection(FaceGuidance.SEARCHING)
    }
    if (boxes.isEmpty()) {
        return FaceDetection(FaceGuidance.NO_FACE)
    }
    if (boxes.size > 1) {
        return FaceDetection(FaceGuidance.MULTIPLE_FACES, faceCount = boxes.size)
    }

    val face = boxes.maxByOrNull { it.width * it.height } ?: boxes.first()
    val widthRatio = face.width / imageWidth
    val centerXRatio = face.centerX / imageWidth
    val centerYRatio = face.centerY / imageHeight

    val guidance = when {
        widthRatio < 0.25f -> FaceGuidance.TOO_FAR
        widthRatio > 0.72f -> FaceGuidance.TOO_CLOSE
        abs(centerXRatio - 0.5f) > 0.17f -> FaceGuidance.OFF_CENTER
        abs(centerYRatio - 0.5f) > 0.20f -> FaceGuidance.OFF_CENTER
        else -> FaceGuidance.READY
    }
    return FaceDetection(guidance = guidance, faceCount = 1, faceWidthRatio = widthRatio)
}

fun FaceGuidance.hint(): String = when (this) {
    FaceGuidance.SEARCHING -> "Starting face detection…"
    FaceGuidance.NO_FACE -> "No face detected — look straight at the camera"
    FaceGuidance.MULTIPLE_FACES -> "Only one person in front of the camera"
    FaceGuidance.TOO_FAR -> "Move a little closer"
    FaceGuidance.TOO_CLOSE -> "Move back slightly"
    FaceGuidance.OFF_CENTER -> "Centre your face inside the oval"
    FaceGuidance.READY -> "Face detected — hold still"
    FaceGuidance.UNAVAILABLE -> "Tap Scan when your face is inside the oval"
}
