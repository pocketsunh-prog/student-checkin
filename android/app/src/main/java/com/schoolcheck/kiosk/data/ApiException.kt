package com.schoolcheck.kiosk.data

/**
 * A non-2xx API response (or an error envelope with `success: false`), carrying the
 * contract's machine-readable [code] plus the HTTP status for friendly messages.
 */
class ApiException(
    val code: String,
    override val message: String,
    val httpStatus: Int,
) : Exception(message)
