package com.schoolcheck.kiosk.data

import com.schoolcheck.kiosk.data.model.HealthPayload
import com.schoolcheck.kiosk.data.model.HeartbeatPayload
import com.schoolcheck.kiosk.data.model.VerifyPayload
import com.schoolcheck.kiosk.util.UrlUtils
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** Shared OkHttp client: short connect timeout, generous read timeout for face detection. */
object HttpClientProvider {
    val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .writeTimeout(45, TimeUnit.SECONDS)
            .callTimeout(60, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }
}

/**
 * Kiosk device API client for docs/API.md §5.
 *
 * Only the three documented kiosk endpoints are called; the device authenticates with
 * the `X-Device-Key` header. The verify request sends the JPEG as multipart field `image`
 * and leaves `mode` unset so the server applies AUTO check-in/check-out.
 */
class KioskApi(private val client: OkHttpClient) {

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
        isLenient = true
    }

    private val emptyBody = ByteArray(0).toRequestBody(null)

    suspend fun health(baseUrl: String, deviceKey: String): HealthPayload = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(UrlUtils.join(baseUrl, "/kiosk/health"))
            .header(HEADER_DEVICE_KEY, deviceKey)
            .get()
            .build()
        val payload = extractData(parseObject(executeForBody(request)))
        json.decodeFromJsonElement(HealthPayload.serializer(), payload)
    }

    suspend fun heartbeat(baseUrl: String, deviceKey: String): HeartbeatPayload = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(UrlUtils.join(baseUrl, "/kiosk/heartbeat"))
            .header(HEADER_DEVICE_KEY, deviceKey)
            .post(emptyBody)
            .build()
        val payload = extractData(parseObject(executeForBody(request)))
        json.decodeFromJsonElement(HeartbeatPayload.serializer(), payload)
    }

    suspend fun verify(baseUrl: String, deviceKey: String, jpeg: ByteArray): VerifyPayload =
        withContext(Dispatchers.IO) {
            val multipart = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("image", "scan.jpg", jpeg.toRequestBody(JPEG_MEDIA_TYPE))
                .build()
            val request = Request.Builder()
                .url(UrlUtils.join(baseUrl, "/kiosk/verify"))
                .header(HEADER_DEVICE_KEY, deviceKey)
                .post(multipart)
                .build()
            val root = parseObject(executeForBody(request))
            if (root["success"]?.jsonPrimitive?.booleanOrNull == false) {
                throw errorFromEnvelope(root, httpStatus = 200)
            }
            val payload = extractData(root)
            json.decodeFromJsonElement(VerifyPayload.serializer(), payload)
        }

    private fun executeForBody(request: Request): String {
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw errorForStatus(response.code, text)
            return text
        }
    }

    private fun errorForStatus(status: Int, text: String): ApiException {
        val root = runCatching { parseObject(text) }.getOrNull()
        return if (root != null) {
            errorFromEnvelope(root, status)
        } else {
            ApiException("HTTP_$status", "Request failed (HTTP $status).", status)
        }
    }

    private fun errorFromEnvelope(root: JsonObject, httpStatus: Int): ApiException {
        val error = root["error"] as? JsonObject
        val code = error?.get("code")?.jsonPrimitive?.contentOrNull ?: "HTTP_$httpStatus"
        val message = error?.get("message")?.jsonPrimitive?.contentOrNull
            ?: "Request failed (HTTP $httpStatus)."
        return ApiException(code, message, httpStatus)
    }

    private fun parseObject(text: String): JsonObject {
        val body = text.ifBlank { "{}" }
        return when (val element = json.parseToJsonElement(body)) {
            is JsonObject -> element
            else -> JsonObject(emptyMap())
        }
    }

    /** Some kiosk routes document a bare payload; accept both bare and success-envelope shapes. */
    private fun extractData(root: JsonObject): JsonObject =
        (root["data"] as? JsonObject) ?: root

    private companion object {
        const val HEADER_DEVICE_KEY = "X-Device-Key"
        val JPEG_MEDIA_TYPE = "image/jpeg".toMediaType()
    }
}
