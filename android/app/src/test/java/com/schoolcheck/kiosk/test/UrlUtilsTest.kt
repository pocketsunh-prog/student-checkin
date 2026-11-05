package com.schoolcheck.kiosk.test

import com.schoolcheck.kiosk.util.UrlUtils
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class UrlUtilsTest {

    @Test
    fun `appends api when only host and port are given`() {
        assertEquals(
            "http://10.0.2.2:3001/api",
            UrlUtils.normalizeBaseUrl("10.0.2.2:3001"),
        )
    }

    @Test
    fun `keeps an existing api suffix and strips trailing slashes`() {
        assertEquals(
            "http://10.0.2.2:3001/api",
            UrlUtils.normalizeBaseUrl("  http://10.0.2.2:3001/api/  "),
        )
        assertEquals(
            "https://school.example.org/api",
            UrlUtils.normalizeBaseUrl("https://school.example.org/api"),
        )
    }

    @Test
    fun `adds http scheme when missing`() {
        assertEquals(
            "http://192.168.1.20:3001/api",
            UrlUtils.normalizeBaseUrl("192.168.1.20:3001"),
        )
    }

    @Test
    fun `blank url is rejected`() {
        assertNotNull(UrlUtils.validateBaseUrl(""))
        assertNotNull(UrlUtils.validateBaseUrl("   "))
    }

    @Test
    fun `valid http and https urls pass validation`() {
        assertNull(UrlUtils.validateBaseUrl("http://10.0.2.2:3001/api"))
        assertNull(UrlUtils.validateBaseUrl("https://school.example.org/api"))
        assertNull(UrlUtils.validateBaseUrl("192.168.1.20:3001"))
    }

    @Test
    fun `unsupported scheme is rejected`() {
        assertNotNull(UrlUtils.validateBaseUrl("ftp://10.0.2.2:3001"))
    }

    @Test
    fun `device key must not be blank`() {
        assertNotNull(UrlUtils.validateDeviceKey(""))
        assertNotNull(UrlUtils.validateDeviceKey("  "))
        assertNull(UrlUtils.validateDeviceKey("demo-kiosk-key-12345"))
    }
}
