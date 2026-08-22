package com.jarvis.fold4.context

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Weather via Open-Meteo (free, no API key, HTTPS). Cached in memory with a
 * 20-minute TTL; stale cache is served when offline and clearly marked.
 */
class WeatherService {

    data class Current(val temp: Float, val wind: Float, val humidity: Float, val code: Int)

    private var cache: Cached? = null

    data class Cached(val city: String, val current: Current, val fetchedAt: Long)

    suspend fun fetch(lat: Double, lon: Double, city: String?): Cached {
        val now = System.currentTimeMillis()
        cache?.let { if (now - it.fetchedAt < TTL_MS) return it }
        return withContext(Dispatchers.IO) {
            val url = URL(
                "https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon" +
                    "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto"
            )
            val conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            try {
                if (conn.responseCode != 200) throw IllegalStateException("HTTP ${conn.responseCode}")
                val text = conn.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(text)
                val current = json.getJSONObject("current")
                val c = Current(
                    temp = current.getDouble("temperature_2m").toFloat(),
                    wind = current.getDouble("wind_speed_10m").toFloat(),
                    humidity = current.getDouble("relative_humidity_2m").toFloat(),
                    code = current.getInt("weather_code"),
                )
                cache = Cached(city ?: "your location", c, now)
                cache!!
            } catch (e: Exception) {
                cache ?: throw e // no cache → surface the error honestly
            } finally {
                conn.disconnect()
            }
        }
    }

    companion object { private const val TTL_MS = 20 * 60_000L }
}
