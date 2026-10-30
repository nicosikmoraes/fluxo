import { t } from "../../state/locale";
import { onBeforeUnmount, reactive } from "vue";
import { apiRequest, auth } from "../auth/auth";
import { clone } from "./whiteboard";

export function useWhiteboard() {
  const owner = auth.user?.id;
  const state = reactive({ boardId: "global", elements: [], version: 0, loading: false, ready: false, dirty: false, saving: false, error: "", conflict: false });
  let timer, pending, saved = "[]", history = ["[]"], index = 0, disposed = false, paused = false;
  const historyState = reactive({ undo: false, redo: false });
  function draftKey(boardId = state.boardId) { return `fluxo:whiteboard-draft:${owner}:${boardId}`; }
  function endpoint(boardId = state.boardId) { return boardId === "global" ? "/whiteboard" : `/whiteboards/${encodeURIComponent(boardId)}/content`; }
  function syncHistory() { historyState.undo = index > 0; historyState.redo = index < history.length - 1; }
  function rememberDraft() {
    try { sessionStorage.setItem(draftKey(), JSON.stringify({ elements: state.elements, version: state.version })); } catch { /* The server remains the primary store when browser storage is unavailable. */ }
  }
  function removeDraft(boardId = state.boardId) { try { sessionStorage.removeItem(draftKey(boardId)); } catch {} }
  function changed() {
    if (!state.ready || auth.user?.id !== owner) return;
    state.dirty = JSON.stringify(state.elements) !== saved;
    if (state.dirty || state.saving) rememberDraft();
    else { removeDraft(); if (!state.conflict) state.error = ""; }
    clearTimeout(timer);
    if (state.dirty && !state.conflict && !paused) timer = setTimeout(save, 500);
  }
  function record() {
    const snapshot = JSON.stringify(state.elements);
    if (snapshot === history[index]) return;
    history = history.slice(0, index + 1);
    history.push(snapshot);
    let size = history.reduce((total, item) => total + item.length, 0);
    while (history.length > 2 && (history.length > 50 || size > 10000000)) size -= history.shift().length;
    index = history.length - 1;
    syncHistory();
    changed();
  }
  function undo() {
    if (index === 0) return;
    state.elements = JSON.parse(history[--index]); syncHistory(); changed();
  }
  function redo() {
    if (index === history.length - 1) return;
    state.elements = JSON.parse(history[++index]); syncHistory(); changed();
  }
  async function load(discardDraft = false) {
    if (state.loading || pending) return;
    if (state.ready && !discardDraft) return;
    const boardId = state.boardId;
    state.loading = true; state.error = "";
    try {
      const result = await apiRequest(endpoint(boardId));
      if (auth.user?.id !== owner || disposed || state.boardId !== boardId) return;
      saved = JSON.stringify(result.elements);
      state.elements = result.elements;
      state.version = result.version;
      state.conflict = false; state.dirty = false;
      if (discardDraft) removeDraft(boardId);
      else {
        try {
          if (boardId === "global" && !sessionStorage.getItem(draftKey(boardId))) {
            const legacyDraft = sessionStorage.getItem(`fluxo:whiteboard-draft:${owner}`);
            if (legacyDraft) { sessionStorage.setItem(draftKey(boardId), legacyDraft); sessionStorage.removeItem(`fluxo:whiteboard-draft:${owner}`); }
          }
          const draft = JSON.parse(sessionStorage.getItem(draftKey(boardId)));
          if (draft && Array.isArray(draft.elements) && JSON.stringify(draft.elements) !== saved) {
            state.elements = draft.elements;
            state.dirty = true;
            state.conflict = draft.version !== result.version;
            if (state.conflict) state.error = t("Há uma versão mais recente em outra aba. Exporte seu rascunho antes de carregar a versão salva.");
          }
        } catch {}
      }
      history = state.dirty ? [saved, JSON.stringify(state.elements)] : [saved];
      index = history.length - 1; syncHistory(); state.ready = true;
      if (state.dirty && !state.conflict) changed();
    } catch (error) { state.error = error.message; }
    finally { state.loading = false; }
  }
  async function save() {
    clearTimeout(timer);
    if (pending) return pending;
    if (!state.dirty || !state.ready || state.conflict || paused || auth.user?.id !== owner) return;
    const boardId = state.boardId;
    const snapshot = clone(state.elements);
    state.saving = true; state.error = "";
    pending = (async () => {
      try {
        const result = await apiRequest(endpoint(boardId), "PUT", { elements: snapshot, version: state.version });
        if (auth.user?.id !== owner || state.boardId !== boardId) return;
        state.version = result.version; saved = JSON.stringify(snapshot);
        state.dirty = JSON.stringify(state.elements) !== saved;
        if (state.dirty) rememberDraft(); else removeDraft();
      } catch (error) {
        if (state.boardId !== boardId) return;
        state.error = error.message; state.conflict = error.status === 409;
        rememberDraft();
      } finally {
        state.saving = false; pending = null;
        if (state.dirty && !state.error && !disposed && !paused) timer = setTimeout(save, 100);
      }
    })();
    return pending;
  }
  function beforeUnload(event) {
    if (state.dirty || state.saving) { rememberDraft(); event.preventDefault(); event.returnValue = ""; }
  }
  function visibility() { if (document.visibilityState === "hidden") save(); }
  function online() { if (!state.conflict) save(); }
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("online", online);
  document.addEventListener("visibilitychange", visibility);
  onBeforeUnmount(() => {
    disposed = true; clearTimeout(timer); save();
    window.removeEventListener("beforeunload", beforeUnload);
    window.removeEventListener("online", online);
    document.removeEventListener("visibilitychange", visibility);
  });
  function pause() { paused = true; clearTimeout(timer); }
  function resume() { paused = false; changed(); }
  async function switchBoard(nextBoardId) {
    const boardId = String(nextBoardId);
    if (boardId === state.boardId) return;
    clearTimeout(timer);
    if (state.dirty) rememberDraft();
    if (pending) await pending;
    if (state.dirty && !state.error && !state.conflict) await save();
    if (state.dirty) rememberDraft();
    paused = false;
    state.boardId = boardId;
    state.elements = []; state.version = 0; state.loading = false; state.ready = false;
    state.dirty = false; state.saving = false; state.error = ""; state.conflict = false;
    saved = "[]"; history = ["[]"]; index = 0; syncHistory();
    await load();
  }
  return { state, historyState, load, save, switchBoard, changed, record, undo, redo, pause, resume };
}
