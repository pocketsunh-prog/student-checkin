package com.schoolcheck.kiosk.util

import java.net.URI

/**
 * Pure helpers for the server URL entered on the setup screen: normalisation and
 * validation. Kept free of Android types so it is unit-testable on the JVM.
 */
object UrlUtils {

    private val SCHEME = Regex("^[a-zA-Z][a-zA-Z0-9+.-]*://")

    /**
     * Returns the base URL actually used by the app:
     * trims spaces, adds `http://` when no scheme was given, drops trailing slashes and
     * appends `/api` when the caller only typed `host:port` (all routes live under /api).
     */
    fun normalizeBaseUrl(raw: String): String {
        var value = raw.trim()
        if (value.isEmpty()) return ""
        if (!SCHEME.containsMatchIn(value)) value = "http://$value"
        value = value.trimEnd('/')
        if (!value.endsWith("/api", ignoreCase = true)) value = "$value/api"
        return value
    }

    /** Returns a human-readable error, or null when [raw] is usable as a base URL. */
    fun validateBaseUrl(raw: String): String? {
        val normalized = normalizeBaseUrl(raw)
        if (normalized.isEmpty()) return "Server URL is required."
        val uri = try {
            URI(normalized)
        } catch (_: Exception) {
            return "Enter a valid URL, e.g. http://10.0.2.2:3001/api"
        }
        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") {
            return "URL must start with http:// or https://"
        }
        if (uri.host.isNullOrBlank()) {
            return "URL must include a host, e.g. 10.0.2.2:3001"
        }
        return null
    }

    fun validateDeviceKey(raw: String): String? =
        if (raw.trim().isEmpty()) "Device key is required." else null

    /** Joins a normalised base URL with an absolute API path such as `/kiosk/health`. */
    fun join(baseUrl: String, path: String): String = baseUrl.trimEnd('/') + path
}
