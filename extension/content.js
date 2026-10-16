(() => {
  const api = globalThis.browser || globalThis.chrome;
  if (globalThis.__xueban) return;
  globalThis.__xueban = true;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
  document.documentElement.append(host);
  const root = host.attachShadow({mode: 'closed'});
  root.innerHTML = `<style>*{box-sizing:border-box}button{font:13px system-ui;cursor:pointer;border:0;border-radius:7px;background:white;color:#303256;padding:8px 12px}button:hover{background:#eeedff}.bar{display:none;position:fixed;pointer-events:auto;background:white;border:1px solid #ddddeb;padding:4px;border-radius:10px;box-shadow:0 4px 24px #2222}.shade{position:fixed;inset:0;pointer-events:auto;cursor:crosshair}.box{position:fixed;border:2px solid #6258ed;background:#6258ed15;box-shadow:0 0 0 9999px #10112770;pointer-events:none}.hint{position:fixed;top:18px;left:50%;transform:translateX(-50%);padding:12px 20px;border-radius:10px;background:#fff;color:#25243c;font:14px system-ui;pointer-events:none}</style><div class="bar"><button data-q="请用简单语言解释这段内容。">解释一下</button><button data-q="请举一个具体例子帮助我理解这段内容。">举个例子</button><button data-q="">提问</button></div>`;
  const bar = root.querySelector('.bar'); let selected = '';
  document.addEventListener('mouseup', e => {
    if (e.composedPath().includes(host) || root.querySelector('.shade')) return;
    const sel = getSelection(); selected = sel?.toString().trim() || '';
    if (!selected || ['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) { bar.style.display = 'none'; return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    bar.style.cssText = `display:block;left:${Math.max(8, Math.min(r.left, innerWidth - 270))}px;top:${Math.min(innerHeight - 48, Math.max(8, r.bottom + 6))}px`;
  });
  bar.addEventListener('mousedown', e => e.preventDefault());
  bar.addEventListener('click', async e => {
    const button = e.target.closest('button'); if (!button) return;
    await api.runtime.sendMessage({type: 'material', text: selected, question: button.dataset.q});
    bar.style.display = 'none';
  });
  api.runtime.onMessage.addListener(msg => { if (msg.type === 'capture') capture(msg.hint); });
  function capture(hint = '拖动框选图片或视频画面 · Esc 取消') {
    if (root.querySelector('.shade')) return;
    bar.style.display = 'none';
    const shade = document.createElement('div'); shade.className = 'shade';
    const box = document.createElement('div'); box.className = 'box';
    const label = document.createElement('div'); label.className = 'hint'; label.textContent = hint;
    root.append(shade, box, label); let start;
    const cleanup = () => { shade.remove(); box.remove(); label.remove(); document.removeEventListener('keydown', key, true); };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); cleanup(); } };
    document.addEventListener('keydown', key, true);
    shade.onpointerdown = e => { start = {x: e.clientX, y: e.clientY}; shade.setPointerCapture(e.pointerId); };
    shade.onpointermove = e => { if (!start) return; Object.assign(box.style, {left: Math.min(start.x, e.clientX) + 'px', top: Math.min(start.y, e.clientY) + 'px', width: Math.abs(e.clientX - start.x) + 'px', height: Math.abs(e.clientY - start.y) + 'px'}); };
    shade.onpointerup = async e => {
      if (!start) return;
      const rect = {x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY), width: Math.abs(e.clientX - start.x), height: Math.abs(e.clientY - start.y)};
      const video = [...document.querySelectorAll('video')].find(v => { const r = v.getBoundingClientRect(); return rect.x < r.right && rect.x + rect.width > r.left && rect.y < r.bottom && rect.y + rect.height > r.top; });
      const time = video ? video.currentTime : null;
      cleanup(); if (rect.width < 8 || rect.height < 8) return;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const result = await api.runtime.sendMessage({type: 'capture-region', rect, viewport: {width: innerWidth, height: innerHeight}, time});
      if (result?.error) alert('学伴：' + result.error);
    };
  }
})();
