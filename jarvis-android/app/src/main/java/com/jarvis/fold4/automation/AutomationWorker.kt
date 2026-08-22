package com.jarvis.fold4.automation

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.jarvis.fold4.JarvisApp
import com.jarvis.fold4.notifications.Notifier
import java.util.concurrent.TimeUnit

/**
 * Background evaluation of automation rules + reminder delivery.
 * 15-minute period (WorkManager minimum) — the UI layer also evaluates on
 * every state change for immediate responses.
 */
class AutomationWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? JarvisApp ?: return Result.success()
        val engine = AutomationEngine(app.memory)
        val fired = engine.evaluate()
        for (rule in fired) {
            engine.markFired(rule)
            when (rule.thenKind) {
                "notify" -> Notifier(app).post("JARVIS", rule.name, rule.thenMessage ?: "")
                "action" -> {
                    if (rule.autoRun) Notifier(app).post("JARVIS", "Automation", "Executed: ${rule.name}")
                    else Notifier(app).post("JARVIS", "Routine ready", "${rule.name} wants to act — open JARVIS to confirm.")
                }
                else -> Notifier(app).post("JARVIS", rule.name, rule.thenMessage ?: "")
            }
        }
        // reminders
        for (r in app.memory.reminders()) {
            val due = r.dataJson?.let { parseDue(it) } ?: continue
            if (due <= System.currentTimeMillis()) {
                Notifier(app).post("JARVIS reminder", r.title, r.body)
                app.memory.update(r.id) { it.copy(body = it.body + " · delivered") }
            }
        }
        return Result.success()
    }

    private fun parseDue(json: String): Long? =
        Regex("\"dueAt\"\\s*:\\s*(\\d+)").find(json)?.groupValues?.get(1)?.toLongOrNull()

    companion object {
        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<AutomationWorker>(15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "jarvis.automation", ExistingPeriodicWorkPolicy.KEEP, req
            )
        }
    }
}
