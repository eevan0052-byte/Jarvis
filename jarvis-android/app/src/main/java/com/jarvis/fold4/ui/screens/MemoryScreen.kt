package com.jarvis.fold4.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.jarvis.fold4.MainViewModel
import com.jarvis.fold4.memory.MemoryEntity
import com.jarvis.fold4.ui.components.GlassPanel
import com.jarvis.fold4.ui.theme.JarvisColors
import kotlinx.coroutines.launch

/** Memory Center — viewable, editable, deletable, searchable, categorized. */
@Composable
fun MemoryScreen(vm: MainViewModel) {
    val all by vm.memory.all().collectAsState(initial = emptyList())
    var query by remember { mutableStateOf("") }
    var selectedCat by remember { mutableStateOf("all") }
    var editing by remember { mutableStateOf<MemoryEntity?>(null) }

    val cats = listOf("all", "fact", "preference", "reminder", "routine", "object", "device", "command", "mission", "note", "observation")

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("MEMORY CENTER", color = JarvisColors.BlueSoft, fontFamily = FontFamily.Monospace, letterSpacing = 4.sp, fontSize = 13.sp)
        Text("${all.size} entries · stored on this device only", color = JarvisColors.TextFaint, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))

        OutlinedTextField(
            value = query, onValueChange = { query = it },
            placeholder = { Text("Search memory…", color = JarvisColors.TextFaint) },
            modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
            singleLine = true,
        )

        Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            cats.take(7).forEach { c ->
                TextButton(onClick = { selectedCat = c }) {
                    Text(
                        c.uppercase(),
                        color = if (selectedCat == c) JarvisColors.BlueSoft else JarvisColors.TextFaint,
                        fontFamily = FontFamily.Monospace, fontSize = 9.sp, letterSpacing = 1.4.sp,
                    )
                }
            }
        }

        val filtered = remember(all, query, selectedCat) {
            all.filter { e ->
                (selectedCat == "all" || e.category == selectedCat) &&
                    (query.isBlank() || e.title.contains(query, true) || e.body.contains(query, true))
            }
        }

        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(filtered, key = { it.id }) { e ->
                GlassPanel(e.category.uppercase()) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text(e.title, color = JarvisColors.Text, fontSize = 13.sp)
                        Row {
                            TextButton(onClick = { editing = e }) { Text("EDIT", color = JarvisColors.TextFaint, fontSize = 9.sp) }
                            TextButton(onClick = { androidx.compose.runtime.rememberCoroutineScope().launch { vm.memory.delete(e.id) } }) {
                                Text("DELETE", color = JarvisColors.Red, fontSize = 9.sp)
                            }
                        }
                    }
                    if (e.body.isNotBlank()) Text(e.body, color = JarvisColors.TextDim, fontSize = 11.sp)
                }
            }
        }
    }

    editing?.let { e ->
        var title by remember(e.id) { mutableStateOf(e.title) }
        var body by remember(e.id) { mutableStateOf(e.body) }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { editing = null },
            confirmButton = {
                TextButton(onClick = {
                    val scope = androidx.compose.runtime.rememberCoroutineScope()
                    scope.launch { vm.memory.update(e.id) { it.copy(title = title, body = body) } }
                    editing = null
                }) { Text("SAVE", color = JarvisColors.BlueSoft) }
            },
            title = { Text("Edit memory", color = JarvisColors.Text) },
            text = {
                Column {
                    OutlinedTextField(title, { title = it }, label = { Text("Title") })
                    OutlinedTextField(body, { body = it }, label = { Text("Body") })
                }
            },
        )
    }
}
