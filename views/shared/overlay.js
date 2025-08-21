export function createActionOverlay({ onEdit, onDelete, actions = [], positionClass = 'absolute top-2 right-2', iconSize = 'w-4 h-4' } = {}) {
    const bar = document.createElement('div');
    bar.className = `${positionClass} flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity`;

    const addBtn = (icon, title, onClick, extraClass = '') => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `p-1 ${extraClass}`.trim();
        btn.title = title || '';
        btn.innerHTML = `<i data-lucide="${icon}" class="${iconSize}"></i>`;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof onClick === 'function') onClick(e);
        });
        bar.appendChild(btn);
    };

    if (onEdit) addBtn('file-edit', 'Modifica', onEdit, 'hover:text-accent');
    if (onDelete) addBtn('trash-2', 'Elimina', onDelete, 'hover:text-red-500');

    actions.forEach(a => addBtn(a.icon, a.title, a.onClick, a.className || 'hover:text-accent'));

    return bar;
}

export function addOverlayTo(container, options) {
    const overlay = createActionOverlay(options);
    container.appendChild(overlay);
    return overlay;
}
