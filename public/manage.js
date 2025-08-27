// public/manage.js
// No addEventListener; bind via DOM properties per project standards.
(function () {
  var model = document.getElementById('model');
  var agentId = document.getElementById('agentId');
  var prompt = document.getElementById('prompt');
  var userInput = document.getElementById('userInput');
  var output = document.getElementById('output');
  var statusEl = document.getElementById('status');
  var btnCreate = document.getElementById('btnCreate');
  var btnReload = document.getElementById('btnReload');
  var btnSend = document.getElementById('btnSend');
  var btnClear = document.getElementById('btnClear');

  function setStatus(s){ if (statusEl) statusEl.textContent = s; }
  function log(x){ if (output) output.textContent = (typeof x === 'string') ? x : JSON.stringify(x, null, 2); }
  function clearLog(){ if (output) output.textContent = ''; }

  async function listModels(){
    setStatus('loading');
    try {
      var res = await fetch('/api/models');
      if (!res.ok) throw new Error('models ' + res.status);
      var models = await res.json();
      if (model){
        model.innerHTML = '';
        for (var i = 0; i < models.length; i++){
          var m = models[i];
          var opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.label + ' — ' + m.provider;
          model.appendChild(opt);
        }
      }
    } catch (err) {
      log({ error: String(err && err.message || err) });
    } finally {
      setStatus('ready');
    }
  }

  async function createAgent(){
    setStatus('creating');
    try {
      var sel = model ? model.value : '';
      var sys = prompt ? prompt.value : '';
      var res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_agent', config: { model: sel, systemPrompt: sys } })
      });
      var json = await res.json();
      if (agentId && json.id) agentId.value = json.id;
      log(json);
    } catch (err) {
      log({ error: String(err && err.message || err) });
    } finally {
      setStatus('ready');
    }
  }

  async function useAgent(){
    var id = agentId ? agentId.value.trim() : '';
    if (!id){ log({ error: 'Missing agent id' }); return; }
    setStatus('chatting');
    try {
      var input = userInput ? userInput.value : '';
      var res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'use_agent', config: { id: id }, prompt: input })
      });
      if (!res.body){ log({ error: 'No response stream' }); return; }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var acc = '';
      while (true){
        var step = await reader.read();
        if (step.done) break;
        acc += decoder.decode(step.value, { stream: true });
        if (output) output.textContent = acc;
      }
    } catch (err) {
      log({ error: String(err && err.message || err) });
    } finally {
      setStatus('ready');
    }
  }

  // Optional UX: Enter to send (no addEventListener; property handler is OK)
  if (userInput) userInput.onkeydown = function (e){ if (e.key === 'Enter' && !e.shiftKey){ if (btnSend) btnSend.onclick(); } };

  // Bind via DOM properties only
  if (btnCreate) btnCreate.onclick = createAgent;
  if (btnReload) btnReload.onclick = listModels;
  if (btnSend) btnSend.onclick = useAgent;
  if (btnClear) btnClear.onclick = clearLog;

  // Init
  listModels();
})();
