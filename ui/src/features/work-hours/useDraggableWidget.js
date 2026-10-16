import { computed, onMounted, onUnmounted, ref, watch } from "vue";

export function useDraggableWidget(anchor, storageKey) {
  const position = ref(null);
  const dragging = ref(false);
  const margin = 12;
  let gesture = null;
  let observer;
  let suppressClick = false;
  let clickTimer;

  const style = computed(() => position.value ? {
    right: `${position.value.right}px`,
    bottom: `${position.value.bottom}px`,
  } : undefined);

  function viewport() {
    return { width: document.documentElement.clientWidth, height: window.innerHeight };
  }

  function currentPosition() {
    const rect = anchor.value.getBoundingClientRect();
    const bounds = viewport();
    return { right: bounds.width - rect.right, bottom: bounds.height - rect.bottom };
  }

  function clamp(value) {
    if (!anchor.value) return value;
    const bounds = viewport();
    return {
      right: Math.min(Math.max(margin, value.right), Math.max(margin, bounds.width - anchor.value.offsetWidth - margin)),
      bottom: Math.min(Math.max(margin, value.bottom), Math.max(margin, bounds.height - anchor.value.offsetHeight - margin)),
    };
  }

  function persist() {
    if (!storageKey() || !position.value) return;
    try {
      localStorage.setItem(storageKey(), JSON.stringify(position.value));
    } catch {
      // Moving the widget also works when browser storage is unavailable.
    }
  }

  function restore() {
    position.value = null;
    if (!storageKey()) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey()) || "null");
      if (saved && Number.isFinite(saved.right) && Number.isFinite(saved.bottom)) {
        position.value = clamp(saved);
      }
    } catch {
      position.value = null;
    }
  }

  function keepInView() {
    if (!position.value || !anchor.value || dragging.value) return;
    position.value = clamp(position.value);
    persist();
  }

  function stop(event) {
    if (!gesture || event && event.pointerId !== gesture.pointerId) return;
    const previous = gesture;
    gesture = null;
    dragging.value = false;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    window.removeEventListener("blur", cancel);
    try {
      if (previous.handle.hasPointerCapture(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId);
    } catch {
      // A hidden or removed handle may already have released the pointer.
    }
    if (previous.moved) {
      suppressClick = true;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { suppressClick = false; }, 0);
      keepInView();
      persist();
    }
  }

  function move(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 5) return;
    gesture.moved = true;
    dragging.value = true;
    if (event.cancelable) event.preventDefault();
    position.value = clamp({ right: gesture.right - dx, bottom: gesture.bottom - dy });
  }

  function cancel() {
    stop();
  }

  function start(event) {
    if (!anchor.value || event.button !== 0 || !event.isPrimary || gesture) return;
    const control = event.target.closest("button, a, input, select, textarea");
    if (control && control !== event.currentTarget && !control.hasAttribute("data-widget-drag-handle")) return;
    const initial = currentPosition();
    gesture = { pointerId: event.pointerId, handle: event.currentTarget, x: event.clientX, y: event.clientY, ...initial, moved: false };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Window listeners keep dragging available without pointer capture.
    }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", cancel);
  }

  function captureClick(event) {
    if (!suppressClick || event.detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }

  function moveWithKeyboard(event) {
    if (!anchor.value || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const initial = currentPosition();
    const distance = event.shiftKey ? 40 : 16;
    position.value = clamp({
      right: initial.right + (event.key === "ArrowLeft" ? distance : event.key === "ArrowRight" ? -distance : 0),
      bottom: initial.bottom + (event.key === "ArrowUp" ? distance : event.key === "ArrowDown" ? -distance : 0),
    });
    persist();
  }

  watch(anchor, (element) => {
    observer?.disconnect();
    if (!element) {
      stop();
      return;
    }
    keepInView();
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(keepInView);
      observer.observe(element);
    }
  }, { flush: "post" });
  watch(storageKey, restore, { flush: "post" });
  onMounted(() => {
    restore();
    window.addEventListener("resize", keepInView);
  });
  onUnmounted(() => {
    stop();
    observer?.disconnect();
    clearTimeout(clickTimer);
    window.removeEventListener("resize", keepInView);
  });

  return { style, dragging, start, captureClick, moveWithKeyboard };
}
