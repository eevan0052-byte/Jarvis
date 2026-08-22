package com.jarvis.fold4.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * Notifier — grouped, prioritized notifications with channels:
 *  · reminders  (default importance)
 *  · predictions (low — no sound)
 *  · system (silent status)
 * Respects the POST_NOTIFICATIONS runtime permission; Focus Mode suppresses
 * everything except reminders the user marked important.
 */
class Notifier(private val context: Context) {

    fun post(title: String, body: String, channel: String = "predictions", id: Int = (System.currentTimeMillis() % 100000).toInt()) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        ensureChannels()
        val builder = NotificationCompat.Builder(context, channel)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(if (channel == "reminders") NotificationCompat.PRIORITY_DEFAULT else NotificationCompat.PRIORITY_LOW)
            .setAutoCancel(true)
            .setSilent(channel != "reminders")
        try { NotificationManagerCompat.from(context).notify(id, builder.build()) } catch (_: Exception) {}
    }

    fun ensureChannels() {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel("reminders", "Reminders", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "Reminders you set" })
        nm.createNotificationChannel(NotificationChannel("predictions", "Predictions", NotificationManager.IMPORTANCE_LOW).apply { description = "Contextual suggestions" })
        nm.createNotificationChannel(NotificationChannel("system", "System", NotificationManager.IMPORTANCE_MIN).apply { description = "System status" })
    }
}
