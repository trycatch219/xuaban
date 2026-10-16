const api = globalThis.browser || globalThis.chrome;
api.storage.local.setAccessLevel?.({accessLevel: 'TRUSTED_CONTEXTS'});
api.storage.session.setAccessLevel?.({accessLevel: 'TRUSTED_CONTEXTS'});
function openPanel(tabId) {
  if (api.sidePanel) return api.sidePanel.open({tabId});
  return api.sidebarAction.open();
}
async function enable(tabId) {
  await api.scripting.executeScript({target: {tabId}, files: ['content.js']});
}
api.runtime.onInstalled.addListener(() => {
  api.contextMenus.create({id: 'text', title: '用学伴提问', contexts: ['selection']});
  api.contextMenus.create({id: 'image', title: '用学伴询问这张图片', contexts: ['image']});
});
api.action.onClicked.addListener(async tab => {
  openPanel(tab.id).catch(() => {});
  try { await enable(tab.id); } catch { await api.storage.session.set({notice: '当前页面无法启用划词工具，可切换到普通网页。'}); }
});
api.contextMenus.onClicked.addListener(async (info, tab) => {
  openPanel(tab.id).catch(() => {});
  if (info.menuItemId === 'text') {
    await api.storage.session.set({incoming: {id: crypto.randomUUID(), type: 'text', text: info.selectionText, title: tab.title, url: tab.url, tabId: tab.id}});
  } else {
    try { await enable(tab.id); await api.tabs.sendMessage(tab.id, {type: 'capture', hint: '请框选图片区域；仅截取可见画面。'}); }
    catch { await api.storage.session.set({notice: '无法读取此页面，请在普通网页中截图。'}); }
  }
});
api.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.type === 'material' && sender.tab) {
    openPanel(sender.tab.id).catch(() => {});
    const material = {id: crypto.randomUUID(), type: 'text', text: String(msg.text || '').slice(0, 30000), title: sender.tab.title, url: sender.tab.url, tabId: sender.tab.id, question: String(msg.question || '')};
    api.storage.session.set({incoming: material}).then(() => respond({ok: true}));
    return true;
  }
  if (msg.type === 'capture-region' && sender.tab) {
    (async () => {
      const [active] = await api.tabs.query({active: true, windowId: sender.tab.windowId});
      if (active?.id !== sender.tab.id) throw new Error('网页已切换，请重新截图');
      const data = await api.tabs.captureVisibleTab(sender.tab.windowId, {format: 'png'});
      await api.storage.session.set({incoming: {id: crypto.randomUUID(), type: 'image', data, rect: msg.rect, viewport: msg.viewport, time: msg.time, title: sender.tab.title, url: sender.tab.url, tabId: sender.tab.id}});
      respond({ok: true});
    })().catch(error => respond({error: error.message}));
    return true;
  }
});
