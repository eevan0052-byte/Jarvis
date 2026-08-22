package com.jarvis.fold4.privacy

import android.content.Context
import com.jarvis.fold4.memory.MemoryDatabase
import com.jarvis.fold4.memory.MemoryEntity
import java.util.UUID

/**
 * AuditLogger — local, viewable activity record (what happened, when, on this
 * device only). Capped at 500 entries; clearable from the Privacy Center.
 */
class AuditLogger(private val db: MemoryDatabase) {

    private val dao = db.memoryDao()

    suspend fun record(event: String, detail: String = "") {
        val existing = dao.byCategoryOnce("audit")
        if (existing.size >= 500) {
            existing.take(existing.size - 499).forEach { dao.delete(it.id) }
        }
        dao.insert(
            MemoryEntity(
                id = UUID.randomUUID().toString(),
                category = "audit",
                title = event,
                body = detail,
            )
        )
    }

    suspend fun recent(limit: Int = 60): List<MemoryEntity> =
        dao.byCategoryOnce("audit").takeLast(limit).reversed()

    suspend fun clear() = dao.deleteCategory("audit")
}
