package com.schoolcheck.kiosk.util

import com.schoolcheck.kiosk.data.ApiException
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import kotlinx.serialization.SerializationException

private const val FACE_UNREADABLE = "Couldn't find a clear face in that photo. Move a little closer and try again."

/** Maps transport/API errors to short, non-technical kiosk-facing text. */
fun Throwable.toFriendlyMessage(): String = when (this) {
    is ApiException -> when {
        httpStatus == 401 -> "Device key rejected. Open settings and check the key."
        code == "FACE_NOT_DETECTED" || httpStatus == 422 -> FACE_UNREADABLE
        code == "FILE_TOO_LARGE" || httpStatus == 413 -> "Photo is too large for the server (limit 8 MB)."
        code == "RATE_LIMITED" || httpStatus == 429 -> "Too many scans in a row. Wait a few seconds."
        code == "FACE_SERVICE_UNAVAILABLE" || httpStatus == 503 ->
            "The school server is still warming up its face service. Try again in a moment."
        httpStatus >= 500 -> "School server error ($httpStatus). Please try again."
        else -> message.ifBlank { "Request failed (HTTP $httpStatus)." }
    }
    is UnknownHostException -> "Can't reach the server. Check the server URL and the Wi-Fi connection."
    is ConnectException -> "Can't connect to the server. Check the server URL and that the backend is running."
    is SocketTimeoutException -> "The server took too long to answer. Try again."
    is SerializationException -> "Unexpected response from the server. Check the backend version."
    is IOException -> "Network problem: ${message ?: "check the connection"}."
    else -> message ?: "Something went wrong. Try again."
}
