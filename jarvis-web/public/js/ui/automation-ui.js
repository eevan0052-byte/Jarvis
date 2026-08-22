/** Automation Engine UI — routines editor with condition/action builder. */
import { $, $$, esc } from './../utils.js';
import { listRules, saveRule, deleteRule, toggleRule, defaultTemplates, ACTIONS } from './../automation.js';
import { Memory } from './../memory.js';
import { emit } from './../state.js';

const whenTypes = {
  time: { label: 'At a specific time', fields: [{ k: 'time', type: 'time', label: 'Time' }] },
  battery: { label: 'When battery level…', fields: [{ k: 'op', type: 'select', label: 'Operator', opts: [['below', 'falls below'], ['above', 'rises above']] }, { k: 'level', type: 'number', label: 'Level (%)' }] },
  charging: { label: 'When charging state…', fields: [{ k: 'state', type: 'select', label: 'State', opts: [['charging', 'starts charging'], ['discharging', 'unplugged']] }] },
  network: { label: 'When network…', fields: [{ k: 'state', type: 'select', label: 'State', opts: [['online', 'comes online'], ['offline', 'goes offline']] }] },
};

export function renderAutomation() {
  const body = $('#automation-body');
  const rules = listRules();
  const commands = Memory.all('command');

  body.innerHTML = `
    <div class="row spread" style="margin-bottom:12px">
      <span class="tiny dim">IF condition → THEN suggestion / action. Consequential actions always ask unless auto-run is enabled.</span>
      <button class="btn primary" id="auto-new">+ New routine</button>
    </div>
    ${rules.map(r => `
      <div class="rule-item">
        <div class="head">
          <span class="name">${esc(r.name)}</span>
          <span class="badge ${r.enabled ? 'real' : 'unavail'}">${r.enabled ? 'ENABLED' : 'DISABLED'}</span>
          <span class="badge ${r.autoRun ? 'exp' : 'unavail'}">${r.autoRun ? 'AUTO-RUN' : 'CONFIRM FIRST'}</span>
          <div class="ops">
            <button class="btn" data-toggle="${r.id}">${r.enabled ? 'Disable' : 'Enable'}</button>
            <button class="btn" data-autorun="${r.id}">${r.autoRun ? 'Un-auto' : 'Auto-run'}</button>
            <button class="btn danger" data-del="${r.id}">Delete</button>
          </div>
        </div>
        <div class="flow">IF <b>${describeWhen(r.when)}</b> → <b>${describeThen(r.then)}</b></div>
      </div>`).join('') || '<div class="dim">No routines yet. Create one below or say "create routine".</div>'}

    <div class="glass-title" style="padding-left:0;margin-top:16px">Custom command language</div>
    <div class="glass-body" style="padding-left:0">
      ${commands.map(c => `
        <div class="kv"><span class="k">"${esc(c.title)}" — ${(c.data?.actions || []).length} steps</span>
        <span class="v row"><button class="btn danger" data-cdel="${c.id}" style="padding:4px 10px">Delete</button></span></div>`).join('') || '<div class="dim">No custom commands. Define one: e.g. "night protocol" → mute sounds, dim FX, start focus.</div>'}
      <button class="btn" id="cmd-new" style="margin-top:8px">+ New custom command</button>
    </div>
    <div class="glass-title" style="padding-left:0;margin-top:16px">Starter templates</div>
    <div class="row wrap" style="margin-top:8px">
      ${defaultTemplates().map(t => `<button class="btn" data-tpl="${t.name}">+ ${t.name}</button>`).join('')}
    </div>
    <div id="rule-editor" class="hidden"></div>`;

  $('#auto-new').addEventListener('click', () => openEditor());
  $$('#automation-body [data-del]').forEach(b => b.addEventListener('click', () => { deleteRule(b.dataset.del); renderAutomation(); }));
  $$('#automation-body [data-toggle]').forEach(b => b.addEventListener('click', () => { const r = listRules().find(x => x.id === b.dataset.toggle); toggleRule(b.dataset.toggle, !r.enabled); renderAutomation(); }));
  $$('#automation-body [data-autorun]').forEach(b => b.addEventListener('click', () => { const r = listRules().find(x => x.id === b.dataset.autorun); saveRule({ ...r, autoRun: !r.autoRun }); renderAutomation(); }));
  $$('#automation-body [data-cdel]').forEach(b => b.addEventListener('click', () => { Memory.remove(b.dataset.cdel); renderAutomation(); }));
  $$('#automation-body [data-tpl]').forEach(b => b.addEventListener('click', () => {
    const t = defaultTemplates().find(x => x.name === b.dataset.tpl);
    if (t) { saveRule({ name: t.name, when: t.when, then: t.then, autoRun: t.then.kind === 'action' }); renderAutomation(); }
  }));
  $('#cmd-new').addEventListener('click', openCommandEditor);
}

function describeWhen(w) {
  if (!w) return 'manual';
  const t = whenTypes[w.type];
  return t ? `${t.label.replace('…', '')} ${w.params ? Object.values(w.params).join(' ') : ''}`.trim() : w.type;
}
function describeThen(t) {
  if (!t) return '—';
  if (t.kind === 'suggest') return `suggest "${t.message}"`;
  if (t.kind === 'notify') return `notify "${t.message}"`;
  return `run ${ACTIONS[t.action]?.label || t.action}`;
}

function openEditor(edit) {
  const el = $('#rule-editor');
  el.classList.remove('hidden');
  el.innerHTML = `
    <label>Routine name</label>
    <input id="re-name" value="${esc(edit?.name || '')}" placeholder="e.g. Evening wind-down">
    <label>Condition (IF)</label>
    <select id="re-when-type">
      ${Object.entries(whenTypes).map(([id, t]) => `<option value="${id}">${t.label}</option>`).join('')}
    </select>
    <div id="re-when-fields"></div>
    <label>Outcome (THEN)</label>
    <select id="re-then-kind">
      <option value="suggest">Suggest to the user</option>
      <option value="notify">Notify (non-intrusive)</option>
      <option value="action">Run an action</option>
    </select>
    <div id="re-then-fields"></div>
    <label><input type="checkbox" id="re-autorun"> Auto-run without confirmation (only for actions you trust)</label>
    <div class="row" style="margin-top:14px">
      <button class="btn primary" id="re-save">Save routine</button>
      <button class="btn" id="re-cancel">Cancel</button>
    </div>`;

  const whenFields = $('#re-when-fields');
  const thenFields = $('#re-then-fields');

  const drawWhen = () => {
    const t = whenTypes[$('#re-when-type').value];
    whenFields.innerHTML = t.fields.map(f => fieldHtml(f, edit?.when?.params?.[f.k])).join('');
  };
  const drawThen = () => {
    const kind = $('#re-then-kind').value;
    if (kind === 'action') {
      thenFields.innerHTML = `<select id="re-action">${Object.entries(ACTIONS).map(([id, a]) => `<option value="${id}">${a.label}</option>`).join('')}</select>`;
    } else {
      thenFields.innerHTML = `<input id="re-message" placeholder="Message to ${kind === 'suggest' ? 'suggest' : 'show'}" value="${esc(edit?.then?.message || '')}">`;
    }
  };
  $('#re-when-type').addEventListener('change', drawWhen);
  $('#re-then-kind').addEventListener('change', drawThen);
  drawWhen(); drawThen();

  $('#re-cancel').addEventListener('click', () => el.classList.add('hidden'));
  $('#re-save').addEventListener('click', () => {
    const wt = $('#re-when-type').value;
    const params = {};
    $$('#re-when-fields input, #re-when-fields select').forEach(f => { params[f.dataset.k] = f.type === 'number' ? +f.value : f.value; });
    const kind = $('#re-then-kind').value;
    const then = kind === 'action' ? { kind, action: $('#re-action').value } : { kind, message: $('#re-message').value || '(no message)' };
    saveRule({ id: edit?.id, name: $('#re-name').value || 'Unnamed routine', when: { type: wt, params }, then, autoRun: $('#re-autorun').checked });
    renderAutomation();
  });
}

function fieldHtml(f, value) {
  if (f.type === 'select') {
    return `<select data-k="${f.k}">${f.opts.map(([v, l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  }
  return `<input data-k="${f.k}" type="${f.type}" value="${esc(value ?? '')}" placeholder="${f.label}">`;
}

function openCommandEditor() {
  const el = $('#rule-editor');
  el.classList.remove('hidden');
  el.innerHTML = `
    <label>Command phrase (what you say)</label>
    <input id="cm-name" placeholder="e.g. night protocol">
    <label>Steps (executed in order)</label>
    <div id="cm-steps"></div>
    <div class="row" style="margin-top:10px">
      <button class="btn" id="cm-addstep">+ Step</button>
      <button class="btn primary" id="cm-save">Save command</button>
      <button class="btn" id="cm-cancel">Cancel</button>
    </div>`;
  const steps = $('#cm-steps');
  const addStep = () => {
    const d = document.createElement('div');
    d.className = 'row';
    d.style.marginTop = '6px';
    d.innerHTML = `
      <select class="cm-step-type">
        ${Object.entries({ fx: 'Set FX quality', sound: 'Toggle sounds', focus: 'Toggle focus', vision: 'Open vision', panel: 'Open panel', briefing: 'Show briefing', speak: 'Speak phrase' }).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
      <select class="cm-step-value" style="flex:1">
        <option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="true">true</option><option value="false">false</option>
        <option value="memory">memory</option><option value="system">system</option><option value="privacy">privacy</option><option value="automation">automation</option><option value="settings">settings</option>
        <option value="briefing">briefing</option>
      </select>
      <button class="btn danger cm-rm" style="padding:4px 9px">✕</button>`;
    d.querySelector('.cm-rm').addEventListener('click', () => d.remove());
    steps.appendChild(d);
  };
  $('#cm-addstep').addEventListener('click', addStep);
  $('#cm-cancel').addEventListener('click', () => el.classList.add('hidden'));
  $('#cm-save').addEventListener('click', () => {
    const name = $('#cm-name').value.trim();
    if (!name) return;
    const actions = $$('#cm-steps .row').map(r => {
      const t = r.querySelector('.cm-step-type').value;
      const v = r.querySelector('.cm-step-value').value;
      if (t === 'focus') return { type: 'focus', value: v === 'true' };
      if (t === 'fx') return { type: 'fx', value: v };
      if (t === 'sound') return { type: 'sound', value: v === 'true' };
      if (t === 'speak') return { type: 'speak', text: v };
      return { type: t, panel: v, value: v };
    });
    Memory.add({ category: 'command', title: name, tags: [name.toLowerCase().replace(/\s+/g, '-')], data: { actions, consequential: true } });
    renderAutomation();
  });
  addStep();
}
