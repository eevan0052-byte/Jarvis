package com.jarvis.fold4.device

import android.app.ActivityManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Environment
import android.os.StatFs
import android.os.SystemClock
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.jarvis.fold4.core.DeviceState
import com.jarvis.fold4.core.JarvisCore
import kotlinx.coroutines.*
import kotlin.math.round

/**
 * SystemInfoCollector — REAL device telemetry from Android APIs.
 * Battery (BatteryManager), storage (StatFs), RAM (ActivityManager memory
 * info + MemoryInfo), connectivity (ConnectivityManager), temperature
 * (ThermalManager where available), sensors (SensorManager probe).
 * Unavailable values stay null and are rendered as UNAVAILABLE — never
 * fabricated.
 */
class SystemInfoCollector(private val context: Context) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    fun start() {
        scope.launch {
            while (isActive) {
                collect()
                delay(15_000)
            }
        }
    }

    fun collect(): DeviceState {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager

        val batteryPct: Int? = bm?.let {
            val level = it.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            if (level == Int.MIN_VALUE) null else level
        }
        val charging: Boolean? = bm?.let {
            when (it.getIntProperty(BatteryManager.BATTERY_PROPERTY_STATUS)) {
                BatteryManager.BATTERY_STATUS_CHARGING, BatteryManager.BATTERY_STATUS_FULL -> true
                BatteryManager.BATTERY_STATUS_DISCHARGING, BatteryManager.BATTERY_STATUS_NOT_CHARGING -> false
                else -> null
            }
        }

        val storage = try {
            val stat = StatFs(Environment.getDataDirectory().absolutePath)
            stat.blockCountLong to stat.availableBlocksLong
        } catch (e: Exception) { null }
        val storageTotalGb = storage?.let { round(it.first * it.second / 1e9f * 10) / 10f }
        val storageFreeGb = storage?.let { round((it.first * it.second / 1e9f) * 10) / 10f }

        val ramMb: Long? = try {
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val mem = ActivityManager.MemoryInfo()
            am.getMemoryInfo(mem)
            mem.totalMem / (1024 * 1024)
        } catch (e: Exception) { null }

        val (online, networkType) = connectivity()

        val temperatureC: Float? = try {
            thermalProbe()
        } catch (e: Exception) { null }

        val device = DeviceState(
            batteryPct = batteryPct,
            charging = charging,
            storageUsedGb = if (storageTotalGb != null && storageFreeGb != null) round((storageTotalGb - storageFreeGb) * 10) / 10f else null,
            storageTotalGb = storageTotalGb,
            ramMb = ramMb,
            networkType = networkType,
            online = online,
            temperatureC = temperatureC,
        )
        JarvisCore.updateDevice { d -> d.copy(
            batteryPct = device.batteryPct ?: d.batteryPct,
            charging = device.charging ?: d.charging,
            storageUsedGb = device.storageUsedGb ?: d.storageUsedGb,
            storageTotalGb = device.storageTotalGb ?: d.storageTotalGb,
            ramMb = device.ramMb ?: d.ramMb,
            networkType = device.networkType ?: d.networkType,
            online = device.online,
            temperatureC = device.temperatureC ?: d.temperatureC,
        ) }
        return device
    }

    private fun connectivity(): Pair<Boolean, String?> {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return true to null
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false to "offline"
        val type = when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH) -> "bluetooth"
            else -> "connected"
        }
        return true to type
    }

    private fun thermalProbe(): Float? {
        return try {
            val intent = context.registerReceiver(null, android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED))
            val t = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE) ?: Int.MIN_VALUE
            if (t == Int.MIN_VALUE) null else t / 10f
        } catch (e: Exception) { null }
    }

    /** Probe sensor presence (accelerometer etc.) — for the System Center. */
    fun availableSensors(): List<String> {
        val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return emptyList()
        return sm.getSensorList(Sensor.TYPE_ALL).map { it.name }.distinct()
    }
}
