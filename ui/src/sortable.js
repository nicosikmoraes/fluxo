import Sortable from 'sortablejs';
export const vSortable = {
 mounted(el, binding) {
  el._sortCallback = binding.value;
  el._sortable = new Sortable(el, { animation: 220, handle: '.drag-handle', draggable: '[data-id]', ghostClass: 'drag-ghost', chosenClass: 'drag-chosen', disabled: false,
   onEnd(event) {
    if (event.oldIndex === event.newIndex) return;
    const ids = [...el.children].filter(n => n.dataset.id).map(n => Number(n.dataset.id));
    const siblings = [...el.children].filter(n => n !== event.item);
    el.insertBefore(event.item, siblings[event.oldIndex] || null);
    el._sortCallback(ids);
   }
  });
 },
 updated(el, binding) { el._sortCallback = binding.value; },
 unmounted(el) { el._sortable?.destroy(); }
};
