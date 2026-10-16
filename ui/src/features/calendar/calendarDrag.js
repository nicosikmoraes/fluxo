import { onBeforeUnmount, reactive, ref } from "vue";
export function useCalendarDrag(calendar, isBusy, save) {
  const dragging = ref(null), over = ref(null), preview = ref(null);
  const position = reactive({ x: 0, y: 0, width: 0 });
  let gesture = null, frame = 0, lastFrame = 0, clickTimer = 0;
  function targetAt(x, y) {
    const target = document.elementFromPoint(x, y)?.closest("[data-calendar-drop]");
    return target && calendar.value?.contains(target) ? target.dataset.calendarDrop : null;
  }
  function updatePointer(x, y) {
    if (!gesture) return;
    gesture.x = x;
    gesture.y = y;
    position.x = x - gesture.offsetX;
    position.y = y - gesture.offsetY;
    over.value = targetAt(x, y);
  }
  function speed(value, start2, end) {
    const edge = Math.min(44, (end - start2) / 3);
    if (value < start2 || value > end) return 0;
    if (value < start2 + edge) return -12 * (1 - (value - start2) / edge);
    if (value > end - edge) return 12 * (1 - (end - value) / edge);
    return 0;
  }
  function scrollFrame(time) {
    if (!gesture?.active) return;
    const factor = Math.min(lastFrame ? (time - lastFrame) / 16 : 1, 2);
    lastFrame = time;
    const { x, y } = gesture;
    for (const element of calendar.value?.querySelectorAll(".calendar-scroll,.calendar-unscheduled-list,.calendar-day-tasks") || []) {
      const r = element.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      if (element.scrollWidth > element.clientWidth + 1) element.scrollLeft += speed(x, r.left, r.right) * factor;
      if (element.scrollHeight > element.clientHeight + 1) element.scrollTop += speed(y, r.top, r.bottom) * factor;
    }
    const vertical = speed(y, 0, window.innerHeight) * factor;
    if (vertical) window.scrollBy({ top: vertical, behavior: "instant" });
    over.value = targetAt(x, y);
    frame = requestAnimationFrame(scrollFrame);
  }
  function blockClick(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    clearClickGuard();
  }
  function clearClickGuard() {
    clearTimeout(clickTimer);
    window.removeEventListener("click", blockClick, true);
  }
  function guardClick() {
    clearClickGuard();
    window.addEventListener("click", blockClick, true);
    clickTimer = setTimeout(clearClickGuard, 400);
  }
  function clear() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("blur", cancel);
    gesture = null;
    dragging.value = null;
    over.value = null;
    preview.value = null;
  }
  function cancel() {
    if (gesture?.active) guardClick();
    clear();
  }
  function keydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }
  function start(event, task) {
    if (isBusy() || event.button !== 0 || event.isPrimary === false || event.target.closest(".calendar-card-schedule")) return;
    clear();
    clearClickGuard();
    const card = event.currentTarget, r = card.getBoundingClientRect();
    gesture = { id: task.id, task, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, offsetX: event.clientX - r.left, offsetY: event.clientY - r.top, width: r.width, active: false, unscheduled: !!card.closest(".calendar-unscheduled") };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", keydown);
    window.addEventListener("blur", cancel);
  }
  function move(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (isBusy()) {
      cancel();
      return;
    }
    if (!gesture.active) {
      if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 6) return;
      gesture.active = true;
      dragging.value = gesture.id;
      preview.value = { task: gesture.task, unscheduled: gesture.unscheduled };
      position.width = gesture.width;
      frame = requestAnimationFrame(scrollFrame);
    }
    event.preventDefault();
    updatePointer(event.clientX, event.clientY);
  }
  function finish(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const active = gesture.active, id = gesture.id;
    const target = active ? targetAt(event.clientX, event.clientY) : null;
    if (active) {
      event.preventDefault();
      guardClick();
    }
    clear();
    if (active && target !== null && !isBusy()) save(id, target === "undated" ? null : target);
  }
  onBeforeUnmount(() => {
    clear();
    clearClickGuard();
  });
  return { dragging, over, preview, position, start, cancel };
}
