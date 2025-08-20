import { DataManager } from '../../DataManager.js';

let modal, form, cancelBtn, saveBtn;
let idInput, nameInput, descriptionInput, importanceInput;

function init() {
	modal = document.getElementById('object-modal');
	form = document.getElementById('object-form');
	cancelBtn = document.getElementById('cancel-object-modal');
	saveBtn = document.getElementById('save-object-btn');

	idInput = document.getElementById('object-id');
	nameInput = document.getElementById('obj-name');
	descriptionInput = document.getElementById('obj-description');
	importanceInput = document.getElementById('obj-importance');

	cancelBtn.addEventListener('click', close);
	saveBtn.addEventListener('click', save);
	form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
}

function open(obj = {}) {
	form.reset();
	idInput.value = obj.id || '';
	nameInput.value = obj.name || '';
	descriptionInput.value = obj.description || '';
	importanceInput.value = obj.importance || '';
	modal.classList.remove('hidden');
}

function close() {
	modal.classList.add('hidden');
}

async function save() {
	const name = nameInput.value.trim();
	if (!name) return;
	const currentProjectId = await DataManager.getCurrentProjectId();
	if (!currentProjectId) return alert('Nessun progetto selezionato.');

	const payload = {
		id: idInput.value || undefined,
		name,
		description: descriptionInput.value.trim(),
		importance: importanceInput.value.trim()
	};

	await DataManager.saveProjectItem(currentProjectId, 'objects', payload);
	document.dispatchEvent(new CustomEvent('object-saved'));
	close();
}

export default { init, open, close };
