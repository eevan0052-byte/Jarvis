/** Memory Center UI — view / edit / delete / search / categorize. */
import { $, esc, download } from './../utils.js';
import { Memory, CATEGORIES } from './../memory.js';
import { Privacy } from './../privacy.js';

let selCat = 'all';

export function renderMemory() {
  $('#mem-count').textContent = `${Memory.all().length} entries · local storage`;
  renderCats();
  renderList();
}

function renderCats() {
  const all = Memory.all();
  const cats = [{ id: 'all', label: 'All', icon: '◈', n: all.length }, ...CATEGORIES.map(c => ({ ...c, n: Memory.all(c.id).length }))];
  $('#mem-cats').innerHTML = cats.map(c =>
    `<div class="cat-item ${selCat === c.id ? 'sel' : ''}" data-cat="${c.id}"><span>${c.icon}</span>${c.label}<span class="n">${c.n}</span></div>`).join('');
  $$('#mem-cats .cat-item').forEach(el => el.addEventListener('click', () => { selCat = el.dataset.cat; renderMemory(); }));
}

function renderList() {
  const q = $('#mem-search').value.toLowerCase().trim();
  let entries = q ? Memory.search(q, 40) : Memory.all(selCat === 'all' ? null : selCat);
  const holder = $('#mem-list');
  if (!entries.length) {
    holder.innerHTML = '<div class="dim" style="padding:18px;text-align:center">No memories here yet. Ask me to remember something, or add an entry.</div>';
    return;
  }
  holder.innerHTML = entries.map(e => `
    <div class="mem-item ${e.pinned ? 'pinned' : ''}" data-id="${e.id}">
      <div class="t">${CATEGORIES.find(c => c.id === e.category)?.icon || '◈'} ${esc(e.title)} ${e.pinned ? '<span class="badge real">PINNED</span>' : ''}</div>
      <div class="b">${esc(e.body || '')}</div>
      <div class="meta">${(e.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}<span class="faint tiny" style="margin-left:auto">${new Date(e.updatedAt).toLocaleString()}</span></div>
      <div class="ops">
        <button data-op="edit" title="Edit">✎</button>
        <button data-op="pin" title="Pin">${e.pinned ? '▾' : '▲'}</button>
        <button data-op="del" title="Delete">✕</button>
      </div>
    </div>`).join('');

  $$('#mem-list .mem-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('[data-op="del"]').addEventListener('click', () => {
      Memory.remove(id);
      Privacy.log('memory-deleted', id);
      renderMemory();
    });
    item.querySelector('[data-op="pin"]').addEventListener('click', () => {
      const e = Memory.get(id);
      Memory.update(id, { pinned: !e.pinned });
      renderMemory();
    });
    item.querySelector('[data-op="edit"]').addEventListener('click', () => editEntry(id));
  });
}

function editEntry(id) {
  const e = Memory.get(id);
  if (!e) return;
  const holder = $('#mem-list');
  holder.innerHTML = `
    <div class="glass" style="padding:14px">
      <label class="tiny faint">Title</label>
      <input id="edit-title" style="width:100%;margin:4px 0 10px" value="${esc(e.title)}">
      <label class="tiny faint">Body</label>
      <textarea id="edit-body" rows="4" style="width:100%;margin:4px 0 10px">${esc(e.body || '')}</textarea>
      <label class="tiny faint">Tags (comma separated)</label>
      <input id="edit-tags" style="width:100%;margin:4px 0 12px" value="${esc((e.tags || []).join(', '))}">
      <div class="row">
        <button class="btn primary" id="edit-save">Save</button>
        <button class="btn" id="edit-cancel">Cancel</button>
      </div>
    </div>`;
  $('#edit-save').addEventListener('click', () => {
    Memory.update(id, {
      title: $('#edit-title').value,
      body: $('#edit-body').value,
      tags: $('#edit-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    });
    renderMemory();
  });
  $('#edit-cancel').addEventListener('click', renderMemory);
}

export function initMemoryPanel() {
  $('#mem-search').addEventListener('input', () => renderList());
  $('#mem-add').addEventListener('click', () => {
    const cat = selCat === 'all' ? 'note' : selCat;
    const e = Memory.add({ category: cat, title: 'New memory', body: '' });
    editEntry(e.id);
  });
  $('#mem-export').addEventListener('click', () => {
    download(`jarvis-memory-${new Date().toISOString().slice(0, 10)}.json`, Memory.exportJson());
    Privacy.log('memory-export');
  });
  $('#mem-import').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      try {
        const text = await input.files[0].text();
        Memory.importJson(text);
        Privacy.log('memory-import');
        renderMemory();
      } catch (e) {
        alert('Import failed: ' + e.message);
      }
    };
    input.click();
  });
}
