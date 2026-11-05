package com.schoolcheck.kiosk.test

import com.schoolcheck.kiosk.ui.kiosk.DetectedFaceBox
import com.schoolcheck.kiosk.ui.kiosk.FaceGuidance
import com.schoolcheck.kiosk.ui.kiosk.evaluateFaceDetection
import org.junit.Assert.assertEquals
import org.junit.Test

class FaceDetectionTest {

    private val imageWidth = 640
    private val imageHeight = 480

    private fun face(left: Float, top: Float, right: Float, bottom: Float) =
        DetectedFaceBox(left, top, right, bottom)

    @Test
    fun `no faces asks the student to look at the camera`() {
        val result = evaluateFaceDetection(emptyList(), imageWidth, imageHeight)
        assertEquals(FaceGuidance.NO_FACE, result.guidance)
        assertEquals(0, result.faceCount)
    }

    @Test
    fun `more than one face is rejected`() {
        val result = evaluateFaceDetection(
            listOf(
                face(220f, 140f, 420f, 360f),
                face(40f, 100f, 160f, 240f),
            ),
            imageWidth,
            imageHeight,
        )
        assertEquals(FaceGuidance.MULTIPLE_FACES, result.guidance)
        assertEquals(2, result.faceCount)
    }

    @Test
    fun `a small face is too far away`() {
        val result = evaluateFaceDetection(
            listOf(face(300f, 220f, 340f, 270f)),
            imageWidth,
            imageHeight,
        )
        assertEquals(FaceGuidance.TOO_FAR, result.guidance)
    }

    @Test
    fun `an oversized face is too close`() {
        val result = evaluateFaceDetection(
            listOf(face(20f, 20f, 620f, 460f)),
            imageWidth,
            imageHeight,
        )
        assertEquals(FaceGuidance.TOO_CLOSE, result.guidance)
    }

    @Test
    fun `an off-centre face is asked to centre`() {
        val result = evaluateFaceDetection(
            listOf(face(0f, 120f, 210f, 360f)),
            imageWidth,
            imageHeight,
        )
        assertEquals(FaceGuidance.OFF_CENTER, result.guidance)
    }

    @Test
    fun `a centred well-sized face is ready`() {
        val result = evaluateFaceDetection(
            listOf(face(200f, 100f, 440f, 380f)),
            imageWidth,
            imageHeight,
        )
        assertEquals(FaceGuidance.READY, result.guidance)
        assertEquals(1, result.faceCount)
    }
}
